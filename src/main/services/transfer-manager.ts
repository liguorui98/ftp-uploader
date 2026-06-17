import { BrowserWindow } from '../electron-shim'
import { nanoid } from 'nanoid'
import log from 'electron-log'
import { ConfigStore, TransferTask, ServerConfig } from './config-store'
import { createClient, TransferClient } from './ftp-client'

export class TransferManager {
  private queue: TransferTask[] = []
  private activeTasks: Map<string, TransferTask> = new Map()
  private maxConcurrency: number
  private maxRetries: number
  private retryDelayMs: number
  private mainWindow: BrowserWindow | null = null
  private configStore: ConfigStore
  private isPaused: boolean = false

  constructor(configStore: ConfigStore) {
    this.configStore = configStore
    const settings = configStore.getSettings()
    this.maxConcurrency = settings.maxConcurrency
    this.maxRetries = settings.maxRetries
    this.retryDelayMs = settings.retryDelayMs
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  // 添加传输任务
  enqueue(params: {
    serverId: string
    folderName?: string
    files: Array<{ localPath: string; remotePath: string }>
  }): string {
    const server = this.configStore.getServerById(params.serverId)
    if (!server) {
      throw new Error(`服务器不存在: ${params.serverId}`)
    }

    const task: TransferTask = {
      id: nanoid(),
      serverId: params.serverId,
      serverName: server.name,
      folderName: params.folderName,
      files: params.files.map((f) => ({
        ...f,
        fileName: f.localPath.split('/').pop() || f.localPath.split('\\').pop() || '',
        fileSize: 0, // 将在传输时获取
        transferred: 0,
        status: 'pending' as const,
      })),
      status: 'pending',
      progress: 0,
      retryCount: 0,
    }

    this.queue.push(task)
    this.configStore.addTransfer(task)

    log.info(`任务已加入队列: ${task.id}, 文件数: ${task.files.length}`)

    // 通知渲染进程
    this.sendToRenderer('transfer:queued', task)

    // 尝试处理队列
    this.processQueue()

    return task.id
  }

  // 取消传输
  cancel(taskId: string): void {
    // 从队列中移除
    this.queue = this.queue.filter((t) => t.id !== taskId)

    // 如果正在传输，标记为取消
    const activeTask = this.activeTasks.get(taskId)
    if (activeTask) {
      activeTask.status = 'cancelled'
      this.activeTasks.delete(taskId)
      this.configStore.updateTransfer(taskId, { status: 'cancelled' })
      this.sendToRenderer('transfer:cancelled', activeTask)
    }

    log.info(`任务已取消: ${taskId}`)

    // 处理队列中的下一个任务
    this.processQueue()
  }

  // 重试失败的任务
  retry(taskId: string): void {
    const transfers = this.configStore.getTransfers()
    const task = transfers.find((t) => t.id === taskId)

    if (task && task.status === 'failed') {
      const retryTask: TransferTask = {
        ...task,
        status: 'pending',
        progress: 0,
        error: undefined,
        startTime: undefined,
        endTime: undefined,
        files: task.files.map((f) => ({
          ...f,
          transferred: 0,
          status: 'pending' as const,
        })),
      }

      this.queue.push(retryTask)
      this.configStore.updateTransfer(taskId, retryTask)

      log.info(`任务已加入重试队列: ${taskId}`)
      this.processQueue()
    }
  }

  // 暂停所有传输
  pauseAll(): void {
    this.isPaused = true
    log.info('所有传输已暂停')
  }

  // 恢复所有传输
  resumeAll(): void {
    this.isPaused = false
    log.info('所有传输已恢复')
    this.processQueue()
  }

  // 获取传输历史
  getHistory(): TransferTask[] {
    return this.configStore.getTransfers()
  }

  // 获取队列状态
  getQueueStatus() {
    return {
      queued: this.queue.length,
      active: this.activeTasks.size,
      isPaused: this.isPaused,
    }
  }

  // 处理队列
  private async processQueue(): Promise<void> {
    if (this.isPaused) return
    if (this.activeTasks.size >= this.maxConcurrency) return
    if (this.queue.length === 0) return

    const task = this.queue.shift()
    if (!task) return

    this.activeTasks.set(task.id, task)
    task.status = 'connecting'
    task.startTime = Date.now()
    this.configStore.updateTransfer(task.id, task)
    this.sendToRenderer('transfer:started', task)

    try {
      await this.executeTask(task)
    } catch (error) {
      log.error(`任务执行失败: ${task.id}`, error)

      if (task.retryCount < this.maxRetries) {
        // 指数退避重试
        const delay = this.retryDelayMs * Math.pow(2, task.retryCount)
        task.retryCount++

        log.info(`将在 ${delay}ms 后重试: ${task.id}, 第 ${task.retryCount} 次重试`)

        setTimeout(() => {
          task.status = 'pending'
          this.queue.push(task)
          this.processQueue()
        }, delay)
      } else {
        task.status = 'failed'
        task.error = error instanceof Error ? error.message : String(error)
        task.endTime = Date.now()
        this.configStore.updateTransfer(task.id, task)
        this.sendToRenderer('transfer:error', { id: task.id, error: task.error })
      }
    } finally {
      this.activeTasks.delete(task.id)
      this.processQueue()
    }
  }

  // 执行传输任务
  private async executeTask(task: TransferTask): Promise<void> {
    const server = this.configStore.getServerById(task.serverId)
    if (!server) {
      throw new Error(`服务器不存在: ${task.serverId}`)
    }

    const client = createClient(server.type)

    // 速度追踪变量
    let lastTransferred = 0
    let lastTime = Date.now()
    let speed = 0
    let lastProgressEmitTime = 0
    const PROGRESS_THROTTLE_MS = 300

    try {
      // 连接服务器
      task.status = 'connecting'
      this.sendToRenderer('transfer:progress', {
        id: task.id,
        status: 'connecting',
        fileIndex: 0,
        transferred: 0,
        total: 0,
        speed: 0,
        elapsedTime: 0,
        estimatedTimeRemaining: 0,
        totalTransferred: 0,
        totalSize: 0,
      })

      await client.connect(server)

      // 传输文件
      task.status = 'transferring'
      this.configStore.updateTransfer(task.id, { status: 'transferring' })

      for (let i = 0; i < task.files.length; i++) {
        const file = task.files[i]
        file.status = 'transferring'

        try {
          await client.upload(
            file.localPath,
            file.remotePath,
            (transferred, total) => {
              file.transferred = transferred
              file.fileSize = total

              // 计算总体进度
              const totalTransferred = task.files.reduce((sum, f) => sum + f.transferred, 0)
              const totalSize = task.files.reduce((sum, f) => sum + f.fileSize, 0)
              task.progress = totalSize > 0 ? Math.round((totalTransferred / totalSize) * 100) : 0

              // 节流：最多每 300ms 发送一次进度到渲染进程
              const now = Date.now()
              if (now - lastProgressEmitTime >= PROGRESS_THROTTLE_MS) {
                lastProgressEmitTime = now

                // 计算速度（bytes/second）
                const timeDelta = now - lastTime
                if (timeDelta >= 200) {
                  const bytesDelta = totalTransferred - lastTransferred
                  speed = Math.round((bytesDelta / timeDelta) * 1000)
                  lastTransferred = totalTransferred
                  lastTime = now
                }

                // 计算已用时间和预计剩余时间
                const elapsedTime = task.startTime ? now - task.startTime : 0
                const estimatedTimeRemaining =
                  speed > 0 && totalSize > totalTransferred
                    ? Math.round(((totalSize - totalTransferred) / speed) * 1000)
                    : 0

                this.sendToRenderer('transfer:progress', {
                  id: task.id,
                  fileIndex: i,
                  transferred,
                  total,
                  speed,
                  elapsedTime,
                  estimatedTimeRemaining,
                  totalTransferred,
                  totalSize,
                })
              }
            }
          )

          file.status = 'completed'
          log.info(`文件传输完成: ${file.fileName}`)

          // 发送最终进度确保UI更新到100%
          {
            const totalTransferred = task.files.reduce((sum, f) => sum + f.transferred, 0)
            const totalSize = task.files.reduce((sum, f) => sum + f.fileSize, 0)
            task.progress = totalSize > 0 ? Math.round((totalTransferred / totalSize) * 100) : 0
            const now = Date.now()
            const elapsedTime = task.startTime ? now - task.startTime : 0
            this.sendToRenderer('transfer:progress', {
              id: task.id,
              fileIndex: i,
              transferred: file.transferred,
              total: file.fileSize,
              speed,
              elapsedTime,
              estimatedTimeRemaining: 0,
              totalTransferred,
              totalSize,
            })
          }
        } catch (error) {
          file.status = 'failed'
          throw error
        }
      }

      // 任务完成
      task.status = 'completed'
      task.progress = 100
      task.endTime = Date.now()
      this.configStore.updateTransfer(task.id, task)
      this.sendToRenderer('transfer:complete', task)

      log.info(`任务完成: ${task.id}, 耗时: ${task.endTime - task.startTime!}ms`)
    } finally {
      await client.disconnect()
    }
  }

  // 发送消息到渲染进程
  private sendToRenderer(channel: string, data: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }
}
