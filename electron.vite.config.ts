import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: [
          // Electron
          'electron',
          // Node.js 内置模块
          'path', 'fs', 'fs/promises', 'os', 'crypto', 'events', 'util',
          'buffer', 'stream', 'net', 'tls', 'child_process', 'url',
          'http', 'https', 'zlib', 'dns', 'assert', 'constants',
          'module', 'readline', 'string_decoder', 'tty', 'v8', 'vm',
          'worker_threads', 'perf_hooks',
          // 原生 addon（.node 二进制文件，Vite无法处理）
          'fsevents', 'cpu-features', 'nan',
        ],
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/main/preload/index.ts'),
      },
      rollupOptions: {
        external: ['electron', 'path', 'fs', 'os', 'events', 'util', 'buffer'],
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: './src/renderer',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer'),
      },
    },
  },
})
