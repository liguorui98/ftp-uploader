import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import path from 'path'
import glob from 'fast-glob'
import { ConfigStore } from '../services/config-store'
import { TransferManager } from '../services/transfer-manager'
import { Scheduler } from '../services/scheduler'
import { FileWatcherService } from '../services/file-watcher'
import { testConnection } from '../services/ftp-client'

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
      return []
    }
    const folderPath = result.filePaths[0]
    const files = await glob('**/*', {
      cwd: folderPath,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    })
    return files
  })
}

export function registerAppIPC() {
  const pkg = require(path.join(__dirname, '../../package.json'))

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
}
