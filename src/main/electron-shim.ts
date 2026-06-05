// electron-shim.ts
// 解决 Vite 打包后 require('electron') 解析到 npm 包（返回路径字符串）而非 Electron 内置模块的问题。
// 在运行时动态检测并获取正确的 electron 模块。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let electron: any

function loadElectron(): any {
  // 尝试标准 require
  const mod = require('electron')
  // 如果返回的是字符串（npm 包导出的二进制路径），说明解析到了 npm 包
  if (typeof mod === 'string') {
    // 尝试通过 process.resourcesPath 定位内置模块
    // Electron 打包后，require 的内置模块通过 Electron 自身的模块加载器提供
    // 我们可以尝试删除缓存后重新 require
    const modPath = require.resolve('electron')
    delete require.cache[modPath]
    const retry = require('electron')
    if (typeof retry !== 'string') return retry
    // 最后兜底：直接使用全局 process 绑定
    throw new Error(
      'electron 模块解析到 npm 包而非内置模块。' +
      '请确保打包时排除 node_modules/electron 目录。'
    )
  }
  return mod
}

try {
  electron = loadElectron()
} catch (e) {
  // 如果所有方法都失败，记录错误并使用空对象避免后续崩溃
  console.error('[electron-shim] 加载 electron 模块失败:', e)
  electron = new Proxy({}, {
    get(_, prop) {
      throw new Error(`electron.${String(prop)} 不可用：electron 模块加载失败`)
    },
  })
}

export default electron
export const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  protocol,
  ipcMain,
  dialog,
  shell,
  safeStorage,
  Notification,
  systemPreferences,
  globalShortcut,
  net,
} = electron
