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

  // 事件监听
  onTransferProgress: (callback: (data: TransferProgress) => void) => void
  onTransferStarted: (callback: (data: TransferTask) => void) => void
  onTransferComplete: (callback: (data: TransferTask) => void) => void
  onTransferError: (callback: (data: { id: string; error: string }) => void) => void
  onLogMessage: (callback: (data: LogMessage) => void) => void
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

  // 系统功能
  openFilePath: (filePath: string) => Promise<{ success: boolean; error?: string }>
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

  // 事件监听
  onTransferProgress: (callback: (data: TransferProgress) => void) => {
    ipcRenderer.on('transfer:progress', (_, data) => callback(data))
  },
  onTransferStarted: (callback: (data: TransferTask) => void) => {
    ipcRenderer.on('transfer:started', (_, data) => callback(data))
  },
  onTransferComplete: (callback: (data: TransferTask) => void) => {
    ipcRenderer.on('transfer:complete', (_, data) => callback(data))
  },
  onTransferError: (callback: (data: { id: string; error: string }) => void) => {
    ipcRenderer.on('transfer:error', (_, data) => callback(data))
  },
  onLogMessage: (callback: (data: LogMessage) => void) => {
    ipcRenderer.on('log:message', (_, data) => callback(data))
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },

  // 应用信息
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getPlatform: () => process.platform,

  // 系统功能
  openFilePath: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
} as ElectronAPI)
