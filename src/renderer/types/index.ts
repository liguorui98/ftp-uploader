// 服务器配置
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

// 传输任务
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

// 传输进度
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

// 定时任务配置
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

// 文件监控配置
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

// 应用设置
export interface AppSettings {
  maxConcurrency: number
  maxRetries: number
  retryDelayMs: number
  autoStart: boolean
  minimizeToTray: boolean
  defaultRemotePath: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  notifications: boolean
  language: 'zh-CN' | 'en-US'
  theme: 'light' | 'dark' | 'system'
}

// 日志消息
export interface LogMessage {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: number
}

// 上传参数
export interface UploadParams {
  serverId: string
  folderName?: string
  files: Array<{
    localPath: string
    remotePath: string
  }>
}

// 队列状态
export interface QueueStatus {
  queued: number
  active: number
  isPaused: boolean
}

// 远程文件信息
export interface RemoteFileInfo {
  name: string
  type: 'file' | 'directory' | 'symbolicLink'
  size: number
  modifyTime: string
  permissions: string
}

// 下载进度
export interface DownloadProgress {
  downloadId: string
  fileName: string
  transferred: number
  total: number
  speed: number
  elapsedTime: number
  estimatedTimeRemaining: number
}
