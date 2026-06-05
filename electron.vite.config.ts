import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function removeCrossoriginPlugin(): Plugin {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(=["'][^"']*["'])?/gi, '')
    },
  }
}

/**
 * 拦截 'electron' 模块导入，返回一个在运行时通过 process.mainModule.require
 * 获取 Electron 内置模块的 shim，避免被 node_modules/electron npm 包遮蔽。
 */
function electronShimPlugin(): Plugin {
  const ELECTRON_SHIM = '\0virtual:electron-shim'
  return {
    name: 'electron-shim',
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (source === 'electron') {
        return { id: ELECTRON_SHIM, moduleSideEffects: true }
      }
      return null
    },
    load(id) {
      if (id === ELECTRON_SHIM) {
        return `
          let electron
          try {
            if (process.mainModule && process.mainModule.require) {
              electron = process.mainModule.require('electron')
            } else {
              electron = require('electron')
            }
          } catch (e) {
            electron = require('electron')
          }
          module.exports = electron
        `
      }
      return null
    },
  }
}

export default defineConfig({
  main: {
    plugins: [electronShimPlugin()],
    build: {
      outDir: path.resolve(__dirname, '.vite/main'),
      rollupOptions: {
        external: [
          'path', 'fs', 'fs/promises', 'os', 'crypto', 'events', 'util',
          'buffer', 'stream', 'net', 'tls', 'child_process', 'url', 'node:url',
          'http', 'https', 'zlib', 'dns', 'assert', 'constants',
          'module', 'readline', 'string_decoder', 'tty', 'v8', 'vm',
          'worker_threads', 'perf_hooks',
          'fsevents', 'cpu-features', 'nan',
        ],
      },
    },
  },
  preload: {
    plugins: [electronShimPlugin()],
    build: {
      outDir: path.resolve(__dirname, '.vite/preload'),
      lib: {
        entry: path.resolve(__dirname, 'src/main/preload/index.ts'),
      },
      rollupOptions: {
        external: ['path', 'fs', 'os', 'events', 'util', 'buffer'],
      },
    },
  },
  renderer: {
    build: {
      outDir: path.resolve(__dirname, '.vite/renderer'),
    },
    plugins: [react(), removeCrossoriginPlugin()],
    root: './src/renderer',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer'),
      },
    },
  },
})
