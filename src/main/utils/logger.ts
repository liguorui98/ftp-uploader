import log from 'electron-log'
import { app } from '../electron-shim'
import path from 'path'

// 配置日志
export function setupLogger() {
  // 设置日志文件路径
  log.transports.file.resolvePathFn = () => {
    return path.join(app.getPath('userData'), 'logs', 'main.log')
  }

  // 设置日志级别
  log.transports.file.level = 'info'
  log.transports.console.level = 'debug'

  // 日志格式
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.console.format = '[{level}] {text}'

  // 日志文件大小限制（10MB）
  log.transports.file.maxSize = 10 * 1024 * 1024

  return log
}

// 创建子日志器
export function createLogger(scope: string) {
  return {
    info: (message: string, ...args: any[]) => log.info(`[${scope}]`, message, ...args),
    warn: (message: string, ...args: any[]) => log.warn(`[${scope}]`, message, ...args),
    error: (message: string, ...args: any[]) => log.error(`[${scope}]`, message, ...args),
    debug: (message: string, ...args: any[]) => log.debug(`[${scope}]`, message, ...args),
  }
}

export default log
