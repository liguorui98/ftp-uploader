import * as cron from 'node-cron'
import { nanoid } from 'nanoid'
import glob from 'fast-glob'
import path from 'path'
import log from 'electron-log'
import { ConfigStore, ScheduleConfig } from './config-store'
import { TransferManager } from './transfer-manager'

export class Scheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map()
  private configStore: ConfigStore
  private transferManager: TransferManager

  constructor(configStore: ConfigStore, transferManager: TransferManager) {
    this.configStore = configStore
    this.transferManager = transferManager
  }

  // 添加定时任务
  addSchedule(config: ScheduleConfig): void {
    // 如果已存在，先移除
    if (this.jobs.has(config.id)) {
      this.removeSchedule(config.id)
    }

    // 转换为cron表达式
    const cronExpression = this.toCronExpression(config)

    if (!cron.validate(cronExpression)) {
      log.error(`无效的cron表达式: ${cronExpression}`)
      return
    }

    const job = cron.schedule(cronExpression, async () => {
      await this.executeSchedule(config)
    })

    this.jobs.set(config.id, job)
    log.info(`定时任务已添加: ${config.name}, cron: ${cronExpression}`)
  }

  // 移除定时任务
  removeSchedule(id: string): void {
    const job = this.jobs.get(id)
    if (job) {
      job.stop()
      this.jobs.delete(id)
      log.info(`定时任务已移除: ${id}`)
    }
  }

  // 切换任务启用/禁用
  toggleSchedule(id: string, enabled: boolean): void {
    const config = this.configStore.getScheduleById(id)
    if (!config) return

    if (enabled) {
      this.addSchedule({ ...config, enabled: true })
    } else {
      this.removeSchedule(id)
    }
  }

  // 更新任务
  updateSchedule(config: ScheduleConfig): void {
    this.configStore.saveSchedule(config)

    if (config.enabled) {
      this.addSchedule(config)
    } else {
      this.removeSchedule(config.id)
    }
  }

  // 停止所有任务
  stopAll(): void {
    this.jobs.forEach((job) => job.stop())
    this.jobs.clear()
    log.info('所有定时任务已停止')
  }

  // 获取所有任务状态
  getJobStatuses(): Array<{ id: string; running: boolean }> {
    return Array.from(this.jobs.entries()).map(([id, job]) => ({
      id,
      running: true, // cron-schedule没有直接的running状态，简化处理
    }))
  }

  // 执行定时任务
  private async executeSchedule(config: ScheduleConfig): Promise<void> {
    log.info(`执行定时任务: ${config.name}`)

    try {
      // 获取要上传的文件列表
      const files = await this.getFilesToUpload(config)

      if (files.length === 0) {
        log.info(`没有需要上传的文件: ${config.name}`)
        return
      }

      // 构建上传参数
      const uploadParams = {
        serverId: config.serverId,
        files: files.map((localPath) => ({
          localPath,
          remotePath: this.buildRemotePath(localPath, config),
        })),
      }

      // 添加到传输队列
      const taskId = this.transferManager.enqueue(uploadParams)
      log.info(`定时任务已添加到传输队列: ${config.name}, 任务ID: ${taskId}, 文件数: ${files.length}`)

      // 如果配置了上传后删除
      if (config.deleteAfterUpload) {
        // TODO: 监听传输完成事件后删除本地文件
        log.info(`将在上传完成后删除本地文件`)
      }
    } catch (error) {
      log.error(`定时任务执行失败: ${config.name}`, error)
    }
  }

  // 获取要上传的文件
  private async getFilesToUpload(config: ScheduleConfig): Promise<string[]> {
    const files: string[] = []

    for (const sourcePath of config.sourcePaths) {
      try {
        // 检查是文件还是目录
        const stat = await import('fs').then((fs) => fs.promises.stat(sourcePath))

        if (stat.isDirectory()) {
          // 如果是目录，使用glob模式匹配
          const pattern = config.filePattern || '**/*'
          const matched = await glob(pattern, {
            cwd: sourcePath,
            absolute: true,
            onlyFiles: true,
            ignore: ['**/node_modules/**', '**/.git/**'],
          })
          files.push(...matched)
        } else if (stat.isFile()) {
          // 如果是文件，直接添加
          files.push(sourcePath)
        }
      } catch (error) {
        log.error(`读取源路径失败: ${sourcePath}`, error)
      }
    }

    return files
  }

  // 构建远程路径
  private buildRemotePath(localPath: string, config: ScheduleConfig): string {
    // 从第一个源路径推断相对路径
    const baseSourcePath = config.sourcePaths[0]
    let relativePath = localPath

    // 如果是目录中的文件，提取相对路径
    if (baseSourcePath && localPath.startsWith(baseSourcePath)) {
      relativePath = path.relative(baseSourcePath, localPath)
    } else {
      relativePath = path.basename(localPath)
    }

    // 构建远程路径
    return path.join(config.remotePath, relativePath).replace(/\\/g, '/')
  }

  // 将不同模式转换为cron表达式
  private toCronExpression(config: ScheduleConfig): string {
    switch (config.mode) {
      case 'interval':
        // 每 N 分钟（大于59分钟时转换为小时）
        const minutes = config.intervalMinutes || 5
        if (minutes > 59) {
          const hours = Math.floor(minutes / 60)
          const remainingMinutes = minutes % 60
          if (remainingMinutes === 0) {
            return `0 */${hours} * * *`
          }
          return `*/${remainingMinutes} */${hours} * * *`
        }
        return `*/${minutes} * * * *`

      case 'daily':
        // 每天 HH:mm
        const [dh, dm] = (config.dailyTime || '00:00').split(':')
        return `${dm} ${dh} * * *`

      case 'weekly':
        // 每周 X HH:mm
        const [wh, wm] = (config.weeklyTime || '00:00').split(':')
        const day = config.weeklyDay ?? 1 // 默认周一
        return `${wm} ${wh} * * ${day}`

      case 'cron':
        // 自定义cron表达式
        return config.cronExpression || '0 * * * *'

      default:
        return '0 * * * *' // 默认每小时
    }
  }
}

// 辅助函数：创建新的定时任务配置
export function createScheduleConfig(params: {
  name: string
  serverId: string
  sourcePaths: string[]
  remotePath: string
  filePattern?: string
  deleteAfterUpload?: boolean
  mode: ScheduleConfig['mode']
  intervalMinutes?: number
  cronExpression?: string
  dailyTime?: string
  weeklyDay?: number
  weeklyTime?: string
}): ScheduleConfig {
  return {
    id: nanoid(),
    name: params.name,
    enabled: true,
    serverId: params.serverId,
    sourcePaths: params.sourcePaths,
    remotePath: params.remotePath,
    filePattern: params.filePattern,
    deleteAfterUpload: params.deleteAfterUpload || false,
    mode: params.mode,
    intervalMinutes: params.intervalMinutes,
    cronExpression: params.cronExpression,
    dailyTime: params.dailyTime,
    weeklyDay: params.weeklyDay,
    weeklyTime: params.weeklyTime,
  }
}
