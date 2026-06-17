import {
  ServerConfig,
  TransferTask,
  TransferProgress,
  ScheduleConfig,
  WatcherConfig,
  AppSettings,
  LogMessage,
  UploadParams,
  QueueStatus,
} from './index'

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
  getQueueStatus: () => Promise<QueueStatus>
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
  selectPrivateKey: () => Promise<string | null>
  saveFile: (options?: any) => Promise<string | null>
  showMessage: (options: any) => Promise<number>

  // 应用设置
  getSettings: () => Promise<AppSettings>
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>
  exportConfig: () => Promise<string>
  importConfig: (jsonStr: string) => Promise<boolean>

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

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
