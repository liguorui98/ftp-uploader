import { contextBridge, ipcRenderer } from 'electron'

// 定义暴露给渲染进程的API
export interface ElectronAPI {
  // 服务器配置
  getServers: () => Promise<ServerConfig[]>
  saveServer: (server: ServerConfig) => Promise<void>
  deleteServer: (id: string) => Promise<void>
  testConnection: (server: ServerConfig) => Promise<boolean>

  // 文件传输
  uploadFiles: (params: UploadParams) => Promise<{ success: boolean; taskId: string }>
  cancelTransfer: (id: string) => Promise<void>
  retryTransfer: (id: string) => Promise<void>
  getTransferHistory: () => Promise<TransferTask[]>
  getQueueStatus: () => Promise<{ queued: number; active: number; isPaused: boolean }>
  pauseAll: () => Promise<void>
  resumeAll: () => Promise<void>
  clearHistory: () => Promise<void>
  deleteTransfer: (id: string) => Promise<void>

  // 定时任务
  getSchedules: () => Promise<ScheduleConfig[]>
  saveSchedule: (schedule: ScheduleConfig) => Promise<void>
  deleteSchedule: (id: string) => Promise<void>
  toggleSchedule: (id: string, enabled: boolean) => Promise<void>

  // 文件监控
  getWatchers: () => Promise<WatcherConfig[]>
  addWatcher: (config: WatcherConfig) => Promise<void>
  removeWatcher: (id: string) => Promise<void>
  toggleWatcher: (id: string, enabled: boolean) => Promise<void>

  // 系统对话框
  selectFiles: () => Promise<string[]>
  selectFolder: () => Promise<string | null>
  selectFolderForUpload: () => Promise<{
    folderPath: string
    folderName: string
    files: Array<{ filePath: string; relativePath: string }>
  } | null>

  // 事件监听（返回 cleanup 函数）
  onTransferProgress: (callback: (data: TransferProgress) => void) => () => void
  onTransferStarted: (callback: (data: TransferTask) => void) => () => void
  onTransferComplete: (callback: (data: TransferTask) => void) => () => void
  onTransferError: (callback: (data: { id: string; error: string }) => void) => () => void
  onLogMessage: (callback: (data: LogMessage) => void) => () => void
  removeAllListeners: (channel: string) => void

  // 应用信息
  getAppVersion: () => Promise<string>
  getAppInfo: () => Promise<{
    appVersion: string
    appName: string
    author: string
    description: string
    electronVersion: string
    nodeVersion: string
    chromeVersion: string
    platform: string
  }>
  getPlatform: () => string

  // 设置
  getSettings: () => Promise<Record<string, unknown>>
  updateSettings: (settings: Record<string, unknown>) => Promise<void>
  exportConfig: () => Promise<string>
  importConfig: (jsonStr: string) => Promise<boolean>

  // 系统功能
  openFilePath: (filePath: string) => Promise<{ success: boolean; error?: string }>
  showItemInFolder: (filePath: string) => Promise<{ success: boolean }>

  // 服务器文件浏览器
  browserList: (serverId: string, remotePath: string) => Promise<Array<{
    name: string
    type: 'file' | 'directory' | 'symbolicLink'
    size: number
    modifyTime: string
    permissions: string
  }>>
  browserMkdir: (serverId: string, remotePath: string, dirName: string) => Promise<{ success: boolean }>
  browserDelete: (serverId: string, remotePath: string) => Promise<{ success: boolean }>
  browserRename: (serverId: string, oldPath: string, newPath: string) => Promise<{ success: boolean }>
  browserDownload: (serverId: string, remotePath: string) => Promise<{ success: boolean; localPath?: string; downloadId: string }>
  browserCancelDownload: (downloadId: string) => Promise<{ success: boolean }>
  onBrowserDownloadStarted: (callback: (data: { downloadId: string }) => void) => () => void
  onBrowserDownloadProgress: (callback: (data: {
    downloadId: string
    fileName: string
    transferred: number
    total: number
    speed: number
    elapsedTime: number
    estimatedTimeRemaining: number
  }) => void) => () => void
  onBrowserDownloadComplete: (callback: (data: {
    downloadId: string
    success: boolean
    error?: string
  }) => void) => () => void
}

// 类型定义
export interface ServerConfig {
  id: string
  name: string
  type: 'ftp' | 'sftp'
  host: string
  port: number
  username: string
  password: string
  privateKeyPath?: string
  passphrase?: string
  remotePath: string
  timeout: number
  encoding?: string
  ftpOptions?: {
    passive: boolean
    secure: boolean | 'implicit'
  }
}

export interface UploadParams {
  serverId: string
  folderName?: string
  files: Array<{
    localPath: string
    remotePath: string
  }>
}

export interface TransferTask {
  id: string
  serverId: string
  serverName: string
  folderName?: string
  files: Array<{
    localPath: string
    remotePath: string
    fileName: string
    fileSize: number
    transferred: number
    status: 'pending' | 'transferring' | 'completed' | 'failed'
  }>
  status: 'pending' | 'connecting' | 'transferring' | 'completed' | 'failed' | 'cancelled'
  progress: number
  startTime?: number
  endTime?: number
  error?: string
  retryCount: number
}

export interface TransferProgress {
  id: string
  fileIndex: number
  transferred: number
  total: number
  speed: number
  elapsedTime: number
  estimatedTimeRemaining: number
  totalTransferred: number
  totalSize: number
}

export interface ScheduleConfig {
  id: string
  name: string
  enabled: boolean
  serverId: string
  sourcePaths: string[]
  remotePath: string
  filePattern?: string
  deleteAfterUpload: boolean
  mode: 'interval' | 'cron' | 'daily' | 'weekly'
  intervalMinutes?: number
  cronExpression?: string
  dailyTime?: string
  weeklyDay?: number
  weeklyTime?: string
}

export interface WatcherConfig {
  id: string
  name: string
  enabled: boolean
  watchPath: string
  serverId: string
  remotePath: string
  filePattern?: string
  autoUpload: boolean
  debounceMs: number
}

export interface LogMessage {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: number
}

// 通过contextBridge暴露API
contextBridge.exposeInMainWorld('electronAPI', {
  // 服务器配置
  getServers: () => ipcRenderer.invoke('config:get-servers'),
  saveServer: (server: ServerConfig) => ipcRenderer.invoke('config:save-server', server),
  deleteServer: (id: string) => ipcRenderer.invoke('config:delete-server', id),
  testConnection: (server: ServerConfig) => ipcRenderer.invoke('config:test-connection', server),

  // 文件传输
  uploadFiles: (params: UploadParams) => ipcRenderer.invoke('transfer:upload', params),
  cancelTransfer: (id: string) => ipcRenderer.invoke('transfer:cancel', id),
  retryTransfer: (id: string) => ipcRenderer.invoke('transfer:retry', id),
  getTransferHistory: () => ipcRenderer.invoke('transfer:history'),
  getQueueStatus: () => ipcRenderer.invoke('transfer:queue-status'),
  pauseAll: () => ipcRenderer.invoke('transfer:pause-all'),
  resumeAll: () => ipcRenderer.invoke('transfer:resume-all'),
  clearHistory: () => ipcRenderer.invoke('transfer:clear-history'),
  deleteTransfer: (id: string) => ipcRenderer.invoke('transfer:delete', id),

  // 定时任务
  getSchedules: () => ipcRenderer.invoke('schedule:get-all'),
  saveSchedule: (schedule: ScheduleConfig) => ipcRenderer.invoke('schedule:save', schedule),
  deleteSchedule: (id: string) => ipcRenderer.invoke('schedule:delete', id),
  toggleSchedule: (id: string, enabled: boolean) => ipcRenderer.invoke('schedule:toggle', id, enabled),

  // 文件监控
  getWatchers: () => ipcRenderer.invoke('watcher:get-all'),
  addWatcher: (config: WatcherConfig) => ipcRenderer.invoke('watcher:add', config),
  removeWatcher: (id: string) => ipcRenderer.invoke('watcher:remove', id),
  toggleWatcher: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('watcher:toggle', id, enabled),

  // 系统对话框
  selectFiles: () => ipcRenderer.invoke('dialog:select-files'),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectFolderForUpload: () => ipcRenderer.invoke('dialog:select-folder-for-upload'),

  // 事件监听（返回 cleanup 函数，组件在卸载时调用）
  onTransferProgress: (callback: (data: TransferProgress) => void) => {
    const wrapper = (_: unknown, data: TransferProgress) => callback(data)
    ipcRenderer.on('transfer:progress', wrapper)
    return () => { ipcRenderer.removeListener('transfer:progress', wrapper) }
  },
  onTransferStarted: (callback: (data: TransferTask) => void) => {
    const wrapper = (_: unknown, data: TransferTask) => callback(data)
    ipcRenderer.on('transfer:started', wrapper)
    return () => { ipcRenderer.removeListener('transfer:started', wrapper) }
  },
  onTransferComplete: (callback: (data: TransferTask) => void) => {
    const wrapper = (_: unknown, data: TransferTask) => callback(data)
    ipcRenderer.on('transfer:complete', wrapper)
    return () => { ipcRenderer.removeListener('transfer:complete', wrapper) }
  },
  onTransferError: (callback: (data: { id: string; error: string }) => void) => {
    const wrapper = (_: unknown, data: { id: string; error: string }) => callback(data)
    ipcRenderer.on('transfer:error', wrapper)
    return () => { ipcRenderer.removeListener('transfer:error', wrapper) }
  },
  onLogMessage: (callback: (data: LogMessage) => void) => {
    const wrapper = (_: unknown, data: LogMessage) => callback(data)
    ipcRenderer.on('log:message', wrapper)
    return () => { ipcRenderer.removeListener('log:message', wrapper) }
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },

  // 应用信息
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getPlatform: () => process.platform,

  // 设置
  getSettings: () => ipcRenderer.invoke('config:get-settings'),
  updateSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('config:update-settings', settings),
  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: (jsonStr: string) => ipcRenderer.invoke('config:import', jsonStr),

  // 系统功能
  openFilePath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-item-in-folder', filePath),

  // 服务器文件浏览器
  browserList: (serverId: string, remotePath: string) => ipcRenderer.invoke('browser:list', serverId, remotePath),
  browserMkdir: (serverId: string, remotePath: string, dirName: string) => ipcRenderer.invoke('browser:mkdir', serverId, remotePath, dirName),
  browserDelete: (serverId: string, remotePath: string) => ipcRenderer.invoke('browser:delete', serverId, remotePath),
  browserRename: (serverId: string, oldPath: string, newPath: string) => ipcRenderer.invoke('browser:rename', serverId, oldPath, newPath),
  browserDownload: (serverId: string, remotePath: string) => ipcRenderer.invoke('browser:download', serverId, remotePath),
  browserCancelDownload: (downloadId: string) => ipcRenderer.invoke('browser:cancel-download', downloadId),
  onBrowserDownloadStarted: (callback: (data: { downloadId: string }) => void) => {
    const wrapper = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('browser:download-started', wrapper)
    return () => { ipcRenderer.removeListener('browser:download-started', wrapper) }
  },
  onBrowserDownloadProgress: (callback: (data: {
    downloadId: string; fileName: string; transferred: number; total: number;
    speed: number; elapsedTime: number; estimatedTimeRemaining: number
  }) => void) => {
    const wrapper = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('browser:download-progress', wrapper)
    return () => { ipcRenderer.removeListener('browser:download-progress', wrapper) }
  },
  onBrowserDownloadComplete: (callback: (data: {
    downloadId: string; success: boolean; error?: string
  }) => void) => {
    const wrapper = (_: unknown, data: any) => callback(data)
    ipcRenderer.on('browser:download-complete', wrapper)
    return () => { ipcRenderer.removeListener('browser:download-complete', wrapper) }
  },
} as ElectronAPI)
