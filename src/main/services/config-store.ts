import Store from 'electron-store'
import { safeStorage } from '../electron-shim'
import log from 'electron-log'

// 类型定义
export interface ServerConfig {
  id: string
  name: string
  type: 'ftp' | 'sftp'
  host: string
  port: number
  username: string
  password: string
  encryptedPassword?: string
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

export interface AppConfig {
  servers: ServerConfig[]
  schedules: ScheduleConfig[]
  watchers: WatcherConfig[]
  transfers: TransferTask[]
  settings: {
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
}

// 默认配置
const defaultConfig: AppConfig = {
  servers: [],
  schedules: [],
  watchers: [],
  transfers: [],
  settings: {
    maxConcurrency: 3,
    maxRetries: 3,
    retryDelayMs: 1000,
    autoStart: false,
    minimizeToTray: true,
    defaultRemotePath: '/uploads',
    logLevel: 'info',
    notifications: true,
    language: 'zh-CN',
    theme: 'system',
  },
}

export class ConfigStore {
  private store: Store<AppConfig>

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'config',
      defaults: defaultConfig,
      schema: {
        servers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              type: { type: 'string', enum: ['ftp', 'sftp'] },
              host: { type: 'string' },
              port: { type: 'number' },
              username: { type: 'string' },
              password: { type: 'string' },
              remotePath: { type: 'string' },
              timeout: { type: 'number' },
            },
            required: ['id', 'name', 'type', 'host', 'port', 'username'],
          },
        },
        schedules: { type: 'array' },
        watchers: { type: 'array' },
        transfers: { type: 'array' },
        settings: { type: 'object' },
      },
    })

    log.info('配置存储初始化完成')
  }

  // 服务器配置
  getServers(): ServerConfig[] {
    const servers = this.store.get('servers', [])
    // 解密密码，防御性清理字段
    return servers.map((server) => ({
      ...server,
      name: typeof server.name === 'string' ? server.name : String(server.name || server.id || '未知服务器'),
      password: this.decryptPassword(server.encryptedPassword || server.password),
    }))
  }

  getServerById(id: string): ServerConfig | undefined {
    return this.getServers().find((s) => s.id === id)
  }

  saveServer(server: ServerConfig): void {
    const servers = this.store.get('servers', [])
    const index = servers.findIndex((s) => s.id === server.id)

    // 加密密码
    const encryptedServer = {
      ...server,
      encryptedPassword: this.encryptPassword(server.password),
      password: '', // 不存储明文密码
    }

    if (index >= 0) {
      servers[index] = encryptedServer
    } else {
      servers.push(encryptedServer)
    }

    this.store.set('servers', servers)
    log.info(`服务器配置已保存: ${server.name}`)
  }

  deleteServer(id: string): void {
    const servers = this.store.get('servers', [])
    this.store.set(
      'servers',
      servers.filter((s) => s.id !== id)
    )
    log.info(`服务器配置已删除: ${id}`)
  }

  // 定时任务
  getSchedules(): ScheduleConfig[] {
    return this.store.get('schedules', [])
  }

  getScheduleById(id: string): ScheduleConfig | undefined {
    return this.getSchedules().find((s) => s.id === id)
  }

  saveSchedule(schedule: ScheduleConfig): void {
    const schedules = this.store.get('schedules', [])
    const index = schedules.findIndex((s) => s.id === schedule.id)

    if (index >= 0) {
      schedules[index] = schedule
    } else {
      schedules.push(schedule)
    }

    this.store.set('schedules', schedules)
    log.info(`定时任务已保存: ${schedule.name}`)
  }

  deleteSchedule(id: string): void {
    const schedules = this.store.get('schedules', [])
    this.store.set(
      'schedules',
      schedules.filter((s) => s.id !== id)
    )
    log.info(`定时任务已删除: ${id}`)
  }

  // 文件监控
  getWatchers(): WatcherConfig[] {
    return this.store.get('watchers', [])
  }

  getWatcherById(id: string): WatcherConfig | undefined {
    return this.getWatchers().find((w) => w.id === id)
  }

  saveWatcher(watcher: WatcherConfig): void {
    const watchers = this.store.get('watchers', [])
    const index = watchers.findIndex((w) => w.id === watcher.id)

    if (index >= 0) {
      watchers[index] = watcher
    } else {
      watchers.push(watcher)
    }

    this.store.set('watchers', watchers)
    log.info(`文件监控已保存: ${watcher.name}`)
  }

  deleteWatcher(id: string): void {
    const watchers = this.store.get('watchers', [])
    this.store.set(
      'watchers',
      watchers.filter((w) => w.id !== id)
    )
    log.info(`文件监控已删除: ${id}`)
  }

  // 传输历史
  getTransfers(): TransferTask[] {
    return this.store.get('transfers', [])
  }

  addTransfer(task: TransferTask): void {
    const transfers = this.store.get('transfers', [])
    transfers.unshift(task) // 新任务添加到开头

    // 只保留最近1000条记录
    if (transfers.length > 1000) {
      transfers.splice(1000)
    }

    this.store.set('transfers', transfers)
  }

  updateTransfer(id: string, updates: Partial<TransferTask>): void {
    const transfers = this.store.get('transfers', [])
    const index = transfers.findIndex((t) => t.id === id)

    if (index >= 0) {
      transfers[index] = { ...transfers[index], ...updates }
      this.store.set('transfers', transfers)
    }
  }

  deleteTransfer(id: string): void {
    const transfers = this.store.get('transfers', [])
    this.store.set(
      'transfers',
      transfers.filter((t) => t.id !== id)
    )
    log.info(`传输记录已删除: ${id}`)
  }

  clearTransfers(): void {
    this.store.set('transfers', [])
  }

  // 设置（与默认值合并，确保缺少的字段有默认值）
  getSettings(): AppConfig['settings'] {
    const stored = this.store.get('settings', {})
    return { ...defaultConfig.settings, ...stored }
  }

  updateSettings(updates: Partial<AppConfig['settings']>): void {
    const settings = this.getSettings()
    this.store.set('settings', { ...settings, ...updates })
    log.info('应用设置已更新')
  }

  // 密码加密/解密
  private encryptPassword(password: string): string {
    if (!password) return ''

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(password)
        return encrypted.toString('base64')
      }
    } catch (error) {
      log.error('密码加密失败:', error)
    }

    // 降级: 返回明文（标记未加密）
    return password
  }

  private decryptPassword(encrypted: string): string {
    if (!encrypted) return ''

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encrypted, 'base64')
        return safeStorage.decryptString(buffer)
      }
    } catch (error) {
      log.error('密码解密失败:', error)
    }

    // 降级: 返回原文
    return encrypted
  }

  // 导出配置（用于备份）
  exportConfig(): string {
    const config = this.store.store
    return JSON.stringify(config, null, 2)
  }

  // 导入配置（用于恢复）
  importConfig(jsonStr: string): boolean {
    try {
      const config = JSON.parse(jsonStr) as Partial<AppConfig>

      if (config.servers) this.store.set('servers', config.servers)
      if (config.schedules) this.store.set('schedules', config.schedules)
      if (config.watchers) this.store.set('watchers', config.watchers)
      if (config.settings) this.store.set('settings', config.settings)

      log.info('配置导入成功')
      return true
    } catch (error) {
      log.error('配置导入失败:', error)
      return false
    }
  }
}
