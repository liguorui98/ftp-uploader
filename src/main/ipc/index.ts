import { ipcMain, dialog, shell, BrowserWindow, app } from '../electron-shim'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import glob from 'fast-glob'
import { ConfigStore } from '../services/config-store'
import { TransferManager } from '../services/transfer-manager'
import { Scheduler } from '../services/scheduler'
import { FileWatcherService } from '../services/file-watcher'
import { testConnection, createClient, TransferClient } from '../services/ftp-client'

export function registerConfigIPC(configStore: ConfigStore) {
  ipcMain.handle('config:get-servers', async () => {
    return configStore.getServers()
  })

  ipcMain.handle('config:save-server', async (_, server) => {
    configStore.saveServer(server)
    return { success: true }
  })

  ipcMain.handle('config:delete-server', async (_, id) => {
    configStore.deleteServer(id)
    return { success: true }
  })

  ipcMain.handle('config:test-connection', async (_, server) => {
    try {
      const result = await testConnection(server)
      return result
    } catch (error) {
      return false
    }
  })

  ipcMain.handle('config:get-settings', async () => {
    return configStore.getSettings()
  })

  ipcMain.handle('config:update-settings', async (_, settings) => {
    configStore.updateSettings(settings)
    return { success: true }
  })

  ipcMain.handle('config:export', async () => {
    return configStore.exportConfig()
  })

  ipcMain.handle('config:import', async (_, jsonStr) => {
    const success = configStore.importConfig(jsonStr)
    return { success }
  })
}

export function registerTransferIPC(transferManager: TransferManager, configStore: ConfigStore) {
  ipcMain.handle('transfer:upload', async (_, params) => {
    try {
      const taskId = transferManager.enqueue(params)
      return { success: true, taskId }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('transfer:cancel', async (_, id) => {
    transferManager.cancel(id)
    return { success: true }
  })

  ipcMain.handle('transfer:retry', async (_, id) => {
    transferManager.retry(id)
    return { success: true }
  })

  ipcMain.handle('transfer:history', async () => {
    return transferManager.getHistory()
  })

  ipcMain.handle('transfer:queue-status', async () => {
    return transferManager.getQueueStatus()
  })

  ipcMain.handle('transfer:pause-all', async () => {
    transferManager.pauseAll()
    return { success: true }
  })

  ipcMain.handle('transfer:resume-all', async () => {
    transferManager.resumeAll()
    return { success: true }
  })

  ipcMain.handle('transfer:clear-history', async () => {
    configStore.clearTransfers()
    return { success: true }
  })

  ipcMain.handle('transfer:delete', async (_, id) => {
    configStore.deleteTransfer(id)
    return { success: true }
  })
}

export function registerDialogIPC(mainWindow: BrowserWindow) {
  ipcMain.handle('dialog:select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:select-private-key', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: '私钥文件', extensions: ['pem', 'key', 'ppk', '*'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:select-folder-for-upload', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    const folderPath = result.filePaths[0]
    const files = await glob('**/*', {
      cwd: folderPath,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    })
    return {
      folderPath,
      folderName: path.basename(folderPath),
      files: files.map((filePath) => ({
        filePath,
        relativePath: path.relative(folderPath, filePath),
      })),
    }
  })
}

export function registerAppIPC() {
  const pkg = require(path.join(app.getAppPath(), 'package.json'))

  ipcMain.handle('app:version', async () => {
    return pkg.version
  })

  ipcMain.handle('app:get-info', async () => {
    return {
      appVersion: pkg.version,
      appName: pkg.name,
      author: pkg.author,
      description: pkg.description,
      electronVersion: process.versions.electron || '',
      nodeVersion: process.versions.node || '',
      chromeVersion: process.versions.chrome || '',
      platform: process.platform,
    }
  })
}

export function registerFileWatcherIPC(
  fileWatcher: FileWatcherService,
  configStore: ConfigStore,
  scheduler: Scheduler,
) {
  ipcMain.handle('watcher:get-all', async () => {
    return configStore.getWatchers()
  })

  ipcMain.handle('watcher:add', async (_, config) => {
    configStore.saveWatcher(config)
    if (config.enabled) {
      fileWatcher.addWatcher(config)
    }
    return { success: true }
  })

  ipcMain.handle('watcher:remove', async (_, id) => {
    fileWatcher.removeWatcher(id)
    configStore.deleteWatcher(id)
    return { success: true }
  })

  ipcMain.handle('watcher:toggle', async (_, id, enabled) => {
    fileWatcher.toggleWatcher(id, enabled)
    const config = configStore.getWatcherById(id)
    if (config) {
      configStore.saveWatcher({ ...config, enabled })
    }
    return { success: true }
  })

  ipcMain.handle('schedule:get-all', async () => {
    return configStore.getSchedules()
  })

  ipcMain.handle('schedule:save', async (_, schedule) => {
    configStore.saveSchedule(schedule)
    if (schedule.enabled) {
      scheduler.addSchedule(schedule)
    } else {
      scheduler.removeSchedule(schedule.id)
    }
    return { success: true }
  })

  ipcMain.handle('schedule:delete', async (_, id) => {
    scheduler.removeSchedule(id)
    configStore.deleteSchedule(id)
    return { success: true }
  })

  ipcMain.handle('schedule:toggle', async (_, id, enabled) => {
    scheduler.toggleSchedule(id, enabled)
    const config = configStore.getScheduleById(id)
    if (config) {
      configStore.saveSchedule({ ...config, enabled })
    }
    return { success: true }
  })

  ipcMain.handle('shell:open-path', async (_, filePath) => {
    const error = await shell.openPath(filePath)
    return { success: !error, error }
  })

  ipcMain.handle('shell:show-item-in-folder', (_, filePath) => {
    shell.showItemInFolder(filePath)
    return { success: true }
  })
}

export function registerBrowserIPC(configStore: ConfigStore, mainWindow: BrowserWindow) {
  // 辅助函数：根据 serverId 获取配置并创建已连接的客户端
  const getClient = async (serverId: string) => {
    const servers = configStore.getServers()
    const config = servers.find((s) => s.id === serverId)
    if (!config) throw new Error(`服务器不存在: ${serverId}`)
    const client = createClient(config.type)
    await client.connect(config)
    return { client, config }
  }

  ipcMain.handle('browser:list', async (_, serverId: string, remotePath: string) => {
    const { client } = await getClient(serverId)
    try {
      const files = await client.list(remotePath)
      return files.map((f) => ({
        name: f.name,
        type: f.type,
        size: f.size,
        modifyTime: f.modifyTime instanceof Date ? f.modifyTime.toISOString() : String(f.modifyTime),
        permissions: f.permissions,
      }))
    } finally {
      await client.disconnect()
    }
  })

  ipcMain.handle('browser:mkdir', async (_, serverId: string, remotePath: string, dirName: string) => {
    const { client } = await getClient(serverId)
    try {
      const fullPath = remotePath.endsWith('/') ? remotePath + dirName : remotePath + '/' + dirName
      await client.mkdir(fullPath, false)
      return { success: true }
    } finally {
      await client.disconnect()
    }
  })

  ipcMain.handle('browser:delete', async (_, serverId: string, remotePath: string) => {
    const { client } = await getClient(serverId)
    try {
      await client.delete(remotePath)
      return { success: true }
    } finally {
      await client.disconnect()
    }
  })

  ipcMain.handle('browser:rename', async (_, serverId: string, oldPath: string, newPath: string) => {
    const { client } = await getClient(serverId)
    try {
      await client.rename(oldPath, newPath)
      return { success: true }
    } finally {
      await client.disconnect()
    }
  })

  // 活跃下载引用（用于取消）
  const activeDownloads = new Map<string, {
    client: TransferClient
    abortController: AbortController
    localPath: string
  }>()

  // 发送事件到渲染进程（带窗口销毁保护）
  const sendToRenderer = (channel: string, data: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }

  ipcMain.handle('browser:download', async (_, serverId: string, remotePath: string) => {
    const fileName = path.basename(remotePath)
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      filters: [{ name: '所有文件', extensions: ['*'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, downloadId: '' }
    }

    const downloadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const startTime = Date.now()
    let lastTransferred = 0
    let lastTime = startTime
    let speed = 0
    let lastProgressEmitTime = 0
    const PROGRESS_THROTTLE_MS = 300

    const { client } = await getClient(serverId)
    const abortController = new AbortController()

    // 注册活跃下载（用于取消）
    activeDownloads.set(downloadId, { client, abortController, localPath: result.filePath })

    // 立即发送 downloadId 到渲染进程（不等待下载完成）
    sendToRenderer('browser:download-started', { downloadId })

    try {
      await client.download(remotePath, result.filePath, (transferred, total) => {
        // 检查是否已取消（被 cancel-download handler 从 Map 中删除）
        if (!activeDownloads.has(downloadId)) {
          throw new Error('下载已取消')
        }

        const now = Date.now()
        const timeDelta = now - lastTime

        // 每 200ms 采样一次速度
        if (timeDelta >= 200) {
          const bytesDelta = transferred - lastTransferred
          speed = Math.round((bytesDelta / timeDelta) * 1000)
          lastTransferred = transferred
          lastTime = now
        }

        // 限流：每 300ms 发送一次进度事件
        if (now - lastProgressEmitTime >= PROGRESS_THROTTLE_MS) {
          lastProgressEmitTime = now
          const elapsedTime = now - startTime
          const estimatedTimeRemaining =
            speed > 0 && total > transferred
              ? Math.round(((total - transferred) / speed) * 1000)
              : 0

          sendToRenderer('browser:download-progress', {
            downloadId,
            fileName,
            transferred,
            total,
            speed,
            elapsedTime,
            estimatedTimeRemaining,
          })
        }
      }, abortController.signal)

      // 发送完成事件
      sendToRenderer('browser:download-complete', { downloadId, success: true })
      return { success: true, localPath: result.filePath, downloadId }
    } catch (error) {
      const isCancelled = error instanceof Error && error.message === '下载已取消'
      log.info(`[download] caught error: ${error}`)
      // 清理部分下载的文件
      try { fs.unlinkSync(result.filePath) } catch {}
      sendToRenderer('browser:download-complete', {
        downloadId,
        success: false,
        error: isCancelled ? '下载已取消' : (error instanceof Error ? error.message : String(error)),
      })
      return { success: false, downloadId }
    } finally {
      log.info('[download] finally block')
      activeDownloads.delete(downloadId)
      await client.disconnect()
    }
  })

  ipcMain.handle('browser:cancel-download', async (_, downloadId: string) => {
    log.info(`[cancel-download] called for ${downloadId}`)
    const active = activeDownloads.get(downloadId)
    if (active) {
      log.info('[cancel-download] found active download, calling client.cancel()')
      try {
        active.client.cancel()
      } catch (e) {
        log.error('[cancel-download] client.cancel() error:', e)
      }
      active.abortController.abort()
      activeDownloads.delete(downloadId)
      log.info('[cancel-download] done')
    } else {
      log.warn(`[cancel-download] no active download found for ${downloadId}`)
    }
    return { success: true }
  })
}
