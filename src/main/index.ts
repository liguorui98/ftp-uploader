import { app, BrowserWindow, Tray, Menu, nativeImage, protocol } from './electron-shim'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import { ConfigStore } from './services/config-store'
import { TransferManager } from './services/transfer-manager'
import { Scheduler } from './services/scheduler'
import { FileWatcherService } from './services/file-watcher'
import { registerConfigIPC, registerTransferIPC, registerDialogIPC, registerFileWatcherIPC, registerAppIPC } from './ipc'

// 配置日志
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

// 注册自定义 app:// 协议（必须在 app.whenReady() 之前调用）
// 为渲染进程提供标准 Origin，解决 file:// 下 ESM 模块 CORS 白屏问题
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
])


class App {
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private isQuitting = false
  private configStore: ConfigStore
  private transferManager: TransferManager
  private scheduler: Scheduler
  private fileWatcher: FileWatcherService

  constructor() {
    this.configStore = new ConfigStore()
    this.transferManager = new TransferManager(this.configStore)
    this.scheduler = new Scheduler(this.configStore, this.transferManager)
    this.fileWatcher = new FileWatcherService(this.configStore, this.transferManager)
  }

  async init() {
    // 等待应用就绪
    await app.whenReady()

    // Dev 模式关闭安全警告（Vite HMR 需要 unsafe-eval）
    if (!app.isPackaged) {
      process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
    }

    // 注册自定义协议处理（生产环境关键：file:// 下 ESM 模块会被 CORS 阻止 → 白屏）
    this.registerAppProtocol()

    // 创建主窗口
    this.createMainWindow()

    // 创建系统托盘
    this.createTray()

    // 注册IPC处理器
    this.registerIPC()

    // 恢复定时任务和文件监控
    this.restoreSchedules()
    this.restoreWatchers()

    // 处理应用生命周期
    this.handleAppLifecycle()

    log.info('应用启动完成')
  }

  /**
   * 注册 app:// 自定义协议 — 为渲染进程提供标准 Origin，解决 ESM 模块的 CORS 白屏问题。
   * 在 file:// 协议下，Chromium 将 origin 视为 null，
   * 导致 <script type="module"> 因 CORS 检查而被拒绝执行。
   */
  private registerAppProtocol() {
    const rendererDir = path.join(app.getAppPath(), '.vite/renderer')

    const mimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    }

    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url)
      const relativePath = pathname.replace(/^\//, '')
      const filePath = path.normalize(path.join(rendererDir, relativePath))
      const ext = path.extname(filePath).toLowerCase()

      log.info(`[protocol] ${request.url} → ${relativePath} (ext=${ext})`)

      try {
        if (!filePath.startsWith(rendererDir)) {
          log.warn('[protocol] 路径穿越拦截:', request.url)
          return new Response('Forbidden', { status: 403 })
        }

        const data = fs.readFileSync(filePath)
        const contentType = mimeTypes[ext] || 'application/octet-stream'

        const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        log.info(`[protocol] 响应: ${relativePath} (${contentType}, ${data.byteLength} bytes)`)
        return new Response(arrayBuffer, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(data.byteLength),
          }
        })
      } catch (err: any) {
        log.error(`[protocol] 404: ${request.url} — ${err.message}`)
        return new Response('Not Found', { status: 404 })
      }
    })

    log.info('自定义协议 app:// 已注册，渲染目录:', rendererDir)
  }

  private createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      webPreferences: {
        preload: path.join(app.getAppPath(), '.vite/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      titleBarStyle: 'hiddenInset',
      show: false,
    })

    // 开发环境加载开发服务器，生产环境通过 app:// 自定义协议加载
    if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
      this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173')
      this.mainWindow.webContents.openDevTools()
    } else {
      // 使用自定义协议 app:// 而非 file://，避免 ESM 模块 CORS 白屏
      this.mainWindow.loadURL('app://renderer/index.html')
      this.mainWindow.webContents.openDevTools()
    }

    // 诊断：捕获页面加载失败
    this.mainWindow.webContents.on('did-fail-load', (_event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
      log.error(`页面加载失败: code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
    })

    // 诊断：转发渲染进程控制台到主进程日志
    this.mainWindow.webContents.on('console-message', (_event: any, level: number, message: string, line: number, sourceId: string) => {
      const levels = ['verbose', 'info', 'warning', 'error']
      log.info(`[renderer ${levels[level] || level}] ${message} (${sourceId}:${line})`)
    })

    // 窗口准备好后显示
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show()
    })

    // 关闭时隐藏到托盘而非退出
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault()
        this.mainWindow?.hide()
      }
    })

    // 传递实例给IPC处理器
    this.transferManager.setMainWindow(this.mainWindow)
  }

  private createTray() {
    const iconPath = path.join(app.getAppPath(), 'resources/icon.png')
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })

    this.tray = new Tray(icon)

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          this.mainWindow?.show()
          this.mainWindow?.focus()
        },
      },
      { type: 'separator' },
      {
        label: '暂停所有传输',
        click: () => {
          this.transferManager.pauseAll()
        },
      },
      {
        label: '恢复所有传输',
        click: () => {
          this.transferManager.resumeAll()
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.isQuitting = true
          app.quit()
        },
      },
    ])

    this.tray.setToolTip('FTP Uploader')
    this.tray.setContextMenu(contextMenu)

    // 点击托盘图标显示窗口
    this.tray.on('click', () => {
      this.mainWindow?.show()
      this.mainWindow?.focus()
    })
  }

  private registerIPC() {
    registerConfigIPC(this.configStore)
    registerTransferIPC(this.transferManager, this.configStore)
    registerDialogIPC(this.mainWindow!)
    registerFileWatcherIPC(this.fileWatcher, this.configStore, this.scheduler)
    registerAppIPC()
  }

  private restoreSchedules() {
    const schedules = this.configStore.getSchedules()
    schedules.forEach((schedule) => {
      if (schedule.enabled) {
        this.scheduler.addSchedule(schedule)
      }
    })
    log.info(`已恢复 ${schedules.filter((s) => s.enabled).length} 个定时任务`)
  }

  private restoreWatchers() {
    const watchers = this.configStore.getWatchers()
    watchers.forEach((watcher) => {
      if (watcher.enabled) {
        this.fileWatcher.addWatcher(watcher)
      }
    })
    log.info(`已恢复 ${watchers.filter((w) => w.enabled).length} 个文件监控`)
  }

  private handleAppLifecycle() {
    // macOS: 关闭所有窗口时隐藏到托盘
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        // Windows: 关闭所有窗口时隐藏到托盘
        // 不退出应用
      }
    })

    // macOS: 点击dock图标时显示窗口
    app.on('activate', () => {
      if (this.mainWindow) {
        this.mainWindow.show()
        this.mainWindow.focus()
      } else {
        this.createMainWindow()
      }
    })

    // 应用退出前清理
    app.on('before-quit', () => {
      this.isQuitting = true
      this.scheduler.stopAll()
      this.fileWatcher.stopAll()
      log.info('应用退出')
    })
  }
}

// 创建应用实例并启动
const ftpUploader = new App()
ftpUploader.init().catch((error) => {
  log.error('应用启动失败:', error)
  app.quit()
})
