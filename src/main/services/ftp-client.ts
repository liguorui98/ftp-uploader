import * as ftp from 'basic-ftp'
import SftpClient from 'ssh2-sftp-client'
import { PassThrough } from 'stream'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import { ServerConfig } from './config-store'

export type ProgressCallback = (transferred: number, total: number) => void

export interface TransferClient {
  connect(config: ServerConfig): Promise<void>
  upload(localPath: string, remotePath: string, onProgress?: ProgressCallback): Promise<void>
  download(remotePath: string, localPath: string, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<void>
  list(remotePath: string): Promise<FileInfo[]>
  mkdir(remotePath: string, recursive?: boolean): Promise<void>
  exists(remotePath: string): Promise<boolean>
  delete(remotePath: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  cancel(): void
  disconnect(): Promise<void>
  testConnection(): Promise<boolean>
}

export interface FileInfo {
  name: string
  type: 'file' | 'directory' | 'symbolicLink'
  size: number
  modifyTime: Date
  permissions: string
}

// FTP客户端实现
class FTPClient implements TransferClient {
  private client: ftp.Client
  private config: ServerConfig | null = null

  constructor() {
    this.client = new ftp.Client()
    this.client.ftp.verbose = false
  }

  async connect(config: ServerConfig): Promise<void> {
    this.config = config

    const timeout = config.timeout || 30000

    // 按配置的超时时间重建客户端（basic-ftp 仅在构造函数中接受 timeout）
    this.client.close()
    this.client = new ftp.Client(timeout)
    this.client.ftp.verbose = false

    const options: ftp.AccessOptions = {
      host: config.host,
      port: config.port || 21,
      user: config.username,
      password: config.password,
      secure: config.ftpOptions?.secure || false,
      secureOptions: undefined,
    }

    try {
      await this.client.access(options)

      // 设置传输模式
      if (config.ftpOptions?.passive !== false) {
        await this.client.send('PASV')
      }

      // 切换到指定目录
      if (config.remotePath) {
        try {
          await this.client.ensureDir(config.remotePath)
        } catch (error) {
          log.warn(`无法切换到远程目录: ${config.remotePath}`, error)
        }
      }

      log.info(`FTP连接成功: ${config.host}:${config.port}`)
    } catch (error) {
      log.error('FTP连接失败:', error)
      throw error
    }
  }

  async upload(localPath: string, remotePath: string, onProgress?: ProgressCallback): Promise<void> {
    if (this.client.closed) {
      throw new Error('FTP客户端未连接')
    }

    const fileName = path.basename(localPath)
    const remoteDir = path.dirname(remotePath)

    try {
      // 确保远程目录存在
      await this.client.ensureDir(remoteDir)

      // 获取文件大小
      const stats = fs.statSync(localPath)
      const totalSize = stats.size

      if (onProgress && totalSize > 0) {
        // 流式上传以支持进度追踪
        const readStream = fs.createReadStream(localPath, { highWaterMark: 256 * 1024 })
        let transferred = 0

        readStream.on('data', (chunk: string | Buffer) => {
          transferred += Buffer.byteLength(chunk)
          onProgress(transferred, totalSize)
        })

        await this.client.uploadFrom(readStream, remotePath)
      } else {
        await this.client.uploadFrom(localPath, remotePath)
      }

      // 确保最终进度回调为100%
      if (onProgress) {
        onProgress(totalSize, totalSize)
      }

      log.info(`FTP上传完成: ${fileName} -> ${remotePath}`)
    } catch (error) {
      log.error(`FTP上传失败: ${fileName}`, error)
      throw error
    }
  }

  async download(remotePath: string, localPath: string, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<void> {
    if (this.client.closed) {
      throw new Error('FTP客户端未连接')
    }

    try {
      const localDir = path.dirname(localPath)
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true })
      }

      const size = await this.client.size(remotePath)
      const writeStream = fs.createWriteStream(localPath)

      if (onProgress && size > 0) {
        const passThrough = new PassThrough()
        let transferred = 0

        passThrough.on('data', (chunk: Buffer) => {
          transferred += chunk.length
          onProgress(transferred, size)
        })

        // 监听取消信号 → 销毁 data socket 中断传输
        if (signal) {
          const onAbort = () => { try { this.cancel() } catch {} }
          if (signal.aborted) {
            onAbort()
          } else {
            signal.addEventListener('abort', onAbort, { once: true })
          }
        }

        passThrough.pipe(writeStream)
        await this.client.downloadTo(passThrough, remotePath)
      } else {
        await this.client.downloadTo(writeStream, remotePath)
      }

      log.info(`FTP下载完成: ${remotePath} -> ${localPath}`)
    } catch (error) {
      log.error(`FTP下载失败: ${remotePath}`, error)
      throw error
    }
  }

  async list(remotePath: string): Promise<FileInfo[]> {
    if (this.client.closed) {
      throw new Error('FTP客户端未连接')
    }

    try {
      const items = await this.client.list(remotePath)

      return items.map((item) => ({
        name: item.name,
        type: item.isDirectory ? 'directory' : item.isSymbolicLink ? 'symbolicLink' : 'file',
        size: item.size,
        modifyTime: item.modifiedAt || new Date(),
        permissions: item.permissions?.toString() || '',
      }))
    } catch (error) {
      log.error(`FTP列表失败: ${remotePath}`, error)
      throw error
    }
  }

  async mkdir(remotePath: string, recursive: boolean = true): Promise<void> {
    if (this.client.closed) {
      throw new Error('FTP客户端未连接')
    }

    try {
      if (recursive) {
        await this.client.ensureDir(remotePath)
      } else {
        await this.client.send(`MKD ${remotePath}`)
      }
    } catch (error) {
      log.error(`FTP创建目录失败: ${remotePath}`, error)
      throw error
    }
  }

  async exists(remotePath: string): Promise<boolean> {
    try {
      await this.client.size(remotePath)
      return true
    } catch {
      try {
        await this.client.list(remotePath)
        return true
      } catch {
        return false
      }
    }
  }

  async delete(remotePath: string): Promise<void> {
    if (this.client.closed) {
      throw new Error('FTP客户端未连接')
    }

    try {
      await this.client.remove(remotePath)
      log.info(`FTP删除完成: ${remotePath}`)
    } catch (error) {
      log.error(`FTP删除失败: ${remotePath}`, error)
      throw error
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (this.client.closed) {
      throw new Error('FTP客户端未连接')
    }

    try {
      await this.client.rename(oldPath, newPath)
      log.info(`FTP重命名完成: ${oldPath} -> ${newPath}`)
    } catch (error) {
      log.error(`FTP重命名失败: ${oldPath}`, error)
      throw error
    }
  }

  cancel(): void {
    log.info('[FTPClient] cancel() called')
    try {
      const ds = this.client.ftp.dataSocket
      log.info(`[FTPClient] dataSocket exists: ${!!ds}, destroyed: ${ds?.destroyed}`)
      this.client.ftp.dataSocket?.destroy(new Error('下载已取消'))
      log.info('[FTPClient] dataSocket.destroy() done')
    } catch (e) {
      log.error('[FTPClient] dataSocket.destroy() error:', e)
    }
    try {
      this.client.close()
      log.info('[FTPClient] client.close() done')
    } catch (e) {
      log.error('[FTPClient] client.close() error:', e)
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.client.close()
      log.info('FTP连接已关闭')
    } catch (error) {
      log.error('FTP断开连接失败:', error)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.config) {
        await this.connect(this.config)
        await this.disconnect()
        return true
      }
      return false
    } catch {
      return false
    }
  }
}

// SFTP客户端实现
class SFTPClient implements TransferClient {
  private client: SftpClient
  private config: ServerConfig | null = null

  constructor() {
    this.client = new SftpClient()
  }

  async connect(config: ServerConfig): Promise<void> {
    this.config = config

    const options: SftpClient.ConnectOptions = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      readyTimeout: config.timeout || 30000,
      algorithms: {
        serverHostKey: [
          'ssh-rsa',
          'ssh-dss',
          'ssh-ed25519',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
        ],
      },
    }

    // 如果提供了私钥
    if (config.privateKeyPath && fs.existsSync(config.privateKeyPath)) {
      options.privateKey = fs.readFileSync(config.privateKeyPath)
      if (config.passphrase) {
        options.passphrase = config.passphrase
      }
    }

    try {
      await this.client.connect(options)

      // 切换到指定目录
      if (config.remotePath) {
        try {
          await this.client.mkdir(config.remotePath, true)
        } catch (error) {
          // 目录可能已存在
          log.debug(`远程目录可能已存在: ${config.remotePath}`)
        }
      }

      log.info(`SFTP连接成功: ${config.host}:${config.port}`)
    } catch (error) {
      log.error('SFTP连接失败:', error)
      throw error
    }
  }

  async upload(localPath: string, remotePath: string, onProgress?: ProgressCallback): Promise<void> {
    if (!this.client) {
      throw new Error('SFTP客户端未连接')
    }

    const fileName = path.basename(localPath)
    const remoteDir = path.dirname(remotePath)

    try {
      // 确保远程目录存在
      await this.client.mkdir(remoteDir, true)

      // 获取文件大小
      const stats = fs.statSync(localPath)
      const totalSize = stats.size

      // 使用createReadStream支持进度回调
      const readStream = fs.createReadStream(localPath, { highWaterMark: 256 * 1024 })

      if (onProgress && totalSize > 0) {
        let transferred = 0
        readStream.on('data', (chunk: string | Buffer) => {
          transferred += Buffer.byteLength(chunk)
          onProgress(transferred, totalSize)
        })
      }

      // ssh2-sftp-client的上传方法
      await this.client.put(readStream, remotePath)

      // 确保最终进度回调为100%
      if (onProgress) {
        onProgress(totalSize, totalSize)
      }

      log.info(`SFTP上传完成: ${fileName} -> ${remotePath}`)
    } catch (error) {
      log.error(`SFTP上传失败: ${fileName}`, error)
      throw error
    }
  }

  async download(remotePath: string, localPath: string, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<void> {
    if (!this.client) {
      throw new Error('SFTP客户端未连接')
    }

    try {
      const localDir = path.dirname(localPath)
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true })
      }

      const stat = await this.client.stat(remotePath)
      const totalSize = stat.size

      if (onProgress && totalSize > 0) {
        const passThrough = new PassThrough()
        let transferred = 0

        passThrough.on('data', (chunk: Buffer) => {
          transferred += chunk.length
          onProgress(transferred, totalSize)
        })

        // 监听取消信号 → 关闭连接中断传输
        if (signal) {
          const onAbort = () => { try { this.cancel() } catch {} }
          if (signal.aborted) {
            onAbort()
          } else {
            signal.addEventListener('abort', onAbort, { once: true })
          }
        }

        const writeStream = fs.createWriteStream(localPath)
        passThrough.pipe(writeStream)
        await this.client.get(remotePath, passThrough)
      } else {
        await this.client.get(remotePath, localPath)
      }

      log.info(`SFTP下载完成: ${remotePath} -> ${localPath}`)
    } catch (error) {
      log.error(`SFTP下载失败: ${remotePath}`, error)
      throw error
    }
  }

  async list(remotePath: string): Promise<FileInfo[]> {
    if (!this.client) {
      throw new Error('SFTP客户端未连接')
    }

    try {
      const items = await this.client.list(remotePath)

      return items.map((item) => ({
        name: item.name,
        type: item.type === 'd' ? 'directory' : item.type === 'l' ? 'symbolicLink' : 'file',
        size: item.size,
        modifyTime: new Date(item.modifyTime),
        permissions: item.rights?.toString() || '',
      }))
    } catch (error) {
      log.error(`SFTP列表失败: ${remotePath}`, error)
      throw error
    }
  }

  async mkdir(remotePath: string, recursive: boolean = true): Promise<void> {
    if (!this.client) {
      throw new Error('SFTP客户端未连接')
    }

    try {
      await this.client.mkdir(remotePath, recursive)
    } catch (error) {
      log.error(`SFTP创建目录失败: ${remotePath}`, error)
      throw error
    }
  }

  async exists(remotePath: string): Promise<boolean> {
    try {
      await this.client.exists(remotePath)
      return true
    } catch {
      return false
    }
  }

  async delete(remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('SFTP客户端未连接')
    }

    try {
      const type = await this.client.exists(remotePath)
      if (type === 'd') {
        await this.client.rmdir(remotePath, true)
      } else {
        await this.client.delete(remotePath)
      }
      log.info(`SFTP删除完成: ${remotePath}`)
    } catch (error) {
      log.error(`SFTP删除失败: ${remotePath}`, error)
      throw error
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    if (!this.client) {
      throw new Error('SFTP客户端未连接')
    }

    try {
      await this.client.rename(oldPath, newPath)
      log.info(`SFTP重命名完成: ${oldPath} -> ${newPath}`)
    } catch (error) {
      log.error(`SFTP重命名失败: ${oldPath}`, error)
      throw error
    }
  }

  cancel(): void {
    log.info('[SFTPClient] cancel() called')
    try {
      this.client.end()
      log.info('[SFTPClient] client.end() done')
    } catch (e) {
      log.error('[SFTPClient] client.end() error:', e)
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.end()
      log.info('SFTP连接已关闭')
    } catch (error) {
      log.error('SFTP断开连接失败:', error)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.config) {
        await this.connect(this.config)
        await this.disconnect()
        return true
      }
      return false
    } catch {
      return false
    }
  }
}

// 工厂函数：创建客户端实例
export function createClient(type: 'ftp' | 'sftp'): TransferClient {
  switch (type) {
    case 'ftp':
      return new FTPClient()
    case 'sftp':
      return new SFTPClient()
    default:
      throw new Error(`不支持的客户端类型: ${type}`)
  }
}

// 测试连接
export async function testConnection(config: ServerConfig): Promise<boolean> {
  const client = createClient(config.type)

  try {
    await client.connect(config)
    await client.disconnect()
    return true
  } catch (error) {
    log.error('连接测试失败:', error)
    return false
  }
}
