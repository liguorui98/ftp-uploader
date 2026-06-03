import path from 'path'
import fs from 'fs'
import { app } from 'electron'

// 获取应用数据目录
export function getAppDataPath(): string {
  return app.getPath('userData')
}

// 获取日志目录
export function getLogPath(): string {
  return path.join(getAppDataPath(), 'logs')
}

// 获取配置文件路径
export function getConfigPath(): string {
  return path.join(getAppDataPath(), 'config.json')
}

// 确保目录存在
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// 获取文件扩展名
export function getExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase()
}

// 获取文件名（不含扩展名）
export function getFileNameWithoutExt(filePath: string): string {
  const basename = path.basename(filePath)
  const ext = path.extname(basename)
  return basename.slice(0, -ext.length)
}

// 规范化路径（处理Windows和macOS差异）
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

// 检查文件是否存在
export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

// 检查目录是否存在
export function dirExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

// 获取文件大小
export function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
