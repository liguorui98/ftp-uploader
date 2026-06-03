import { app, BrowserWindow, Tray, Menu, nativeImage, session } from 'electron'
import path from 'path'
import log from 'electron-log'
import { ConfigStore } from './services/config-store'
import { TransferManager } from './services/transfer-manager'
import { Scheduler } from './services/scheduler'
import { FileWatcherService } from './services/file-watcher'
import { registerConfigIPC, registerTransferIPC, registerDialogIPC, registerFileWatcherIPC, registerAppIPC } from './ipc'

// 配置日志
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

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

  private createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      titleBarStyle: 'hiddenInset',
      show: false,
    })

    // 开发环境加载开发服务器，生产环境加载打包文件
    if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
      this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173')
      this.mainWindow.webContents.openDevTools()
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

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
    const iconPath = path.join(__dirname, '../../resources/icon.png')
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
