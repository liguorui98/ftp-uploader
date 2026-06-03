import chokidar, { FSWatcher } from 'chokidar'
import { nanoid } from 'nanoid'
import { minimatch } from 'minimatch'
import path from 'path'
import log from 'electron-log'
import { ConfigStore, WatcherConfig } from './config-store'
import { TransferManager } from './transfer-manager'

export class FileWatcherService {
  private watchers: Map<string, FSWatcher> = new Map()
  private configStore: ConfigStore
  private transferManager: TransferManager
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor(configStore: ConfigStore, transferManager: TransferManager) {
    this.configStore = configStore
    this.transferManager = transferManager
  }

  // 添加文件监控
  addWatcher(config: WatcherConfig): void {
    // 如果已存在，先移除
    if (this.watchers.has(config.id)) {
      this.removeWatcher(config.id)
    }

    try {
      const watcher = chokidar.watch(config.watchPath, {
        ignored: /(^|[\/\\])\../, // 忽略隐藏文件
        persistent: true,
        ignoreInitial: true, // 不触发已有文件
        awaitWriteFinish: {
          stabilityThreshold: config.debounceMs || 2000,
          pollInterval: 100,
        },
      })

      // 监听文件添加事件
      watcher.on('add', (filePath) => {
        this.onFileAdded(filePath, config)
      })

      // 监听错误
      watcher.on('error', (error) => {
        log.error(`文件监控错误: ${config.name}`, error)
      })

      this.watchers.set(config.id, watcher)
      log.info(`文件监控已启动: ${config.name}, 路径: ${config.watchPath}`)
    } catch (error) {
      log.error(`启动文件监控失败: ${config.name}`, error)
    }
  }

  // 移除文件监控
  removeWatcher(id: string): void {
    const watcher = this.watchers.get(id)
    if (watcher) {
      watcher.close()
      this.watchers.delete(id)

      // 清理防抖定时器
      const timer = this.debounceTimers.get(id)
      if (timer) {
        clearTimeout(timer)
        this.debounceTimers.delete(id)
      }

      log.info(`文件监控已移除: ${id}`)
    }
  }

  // 切换监控启用/禁用
  toggleWatcher(id: string, enabled: boolean): void {
    const config = this.configStore.getWatcherById(id)
    if (!config) return

    if (enabled) {
      this.addWatcher({ ...config, enabled: true })
    } else {
      this.removeWatcher(id)
    }
  }

  // 停止所有监控
  stopAll(): void {
    this.watchers.forEach((watcher) => watcher.close())
    this.watchers.clear()

    this.debounceTimers.forEach((timer) => clearTimeout(timer))
    this.debounceTimers.clear()

    log.info('所有文件监控已停止')
  }

  // 获取监控状态
  getWatcherStatuses(): Array<{ id: string; watching: boolean }> {
    return Array.from(this.watchers.entries()).map(([id]) => ({
      id,
      watching: true,
    }))
  }

  // 文件添加事件处理
  private onFileAdded(filePath: string, config: WatcherConfig): void {
    const fileName = path.basename(filePath)

    // 检查是否匹配文件模式
    if (config.filePattern && !minimatch(fileName, config.filePattern)) {
      log.debug(`文件不匹配模式: ${fileName}, 模式: ${config.filePattern}`)
      return
    }

    // 使用防抖机制，避免重复触发
    const debounceKey = `${config.id}:${filePath}`

    if (this.debounceTimers.has(debounceKey)) {
      clearTimeout(this.debounceTimers.get(debounceKey))
    }

    this.debounceTimers.set(
      debounceKey,
      setTimeout(() => {
        this.debounceTimers.delete(debounceKey)
        this.handleNewFile(filePath, config)
      }, config.debounceMs || 2000)
    )
  }

  // 处理新文件
  private handleNewFile(filePath: string, config: WatcherConfig): void {
    if (!config.autoUpload) {
      log.info(`自动上传已禁用，跳过: ${filePath}`)
      return
    }

    const fileName = path.basename(filePath)

    // 构建远程路径
    const relativePath = path.relative(config.watchPath, filePath)
    const remotePath = path.join(config.remotePath, relativePath).replace(/\\/g, '/')

    log.info(`检测到新文件: ${fileName}, 准备上传到: ${remotePath}`)

    try {
      // 添加到传输队列
      const taskId = this.transferManager.enqueue({
        serverId: config.serverId,
        files: [
          {
            localPath: filePath,
            remotePath,
          },
        ],
      })

      log.info(`文件已添加到传输队列: ${fileName}, 任务ID: ${taskId}`)
    } catch (error) {
      log.error(`添加文件到传输队列失败: ${fileName}`, error)
    }
  }
}

// 辅助函数：创建新的监控配置
export function createWatcherConfig(params: {
  name: string
  watchPath: string
  serverId: string
  remotePath: string
  filePattern?: string
  autoUpload?: boolean
  debounceMs?: number
}): WatcherConfig {
  return {
    id: nanoid(),
    name: params.name,
    enabled: true,
    watchPath: params.watchPath,
    serverId: params.serverId,
    remotePath: params.remotePath,
    filePattern: params.filePattern,
    autoUpload: params.autoUpload !== false,
    debounceMs: params.debounceMs || 2000,
  }
}
