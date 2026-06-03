import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // Electron
        'electron',
        'electron/main',
        'electron/common',
        // Node.js 内置模块
        'path',
        'fs',
        'fs/promises',
        'os',
        'crypto',
        'events',
        'util',
        'buffer',
        'stream',
        'net',
        'tls',
        'child_process',
        'url',
        'http',
        'https',
        'zlib',
        'dns',
        'assert',
        'constants',
        'module',
        'readline',
        'string_decoder',
        'tty',
        'v8',
        'vm',
        'worker_threads',
        'perf_hooks',
        // 原生 addon 模块 (含 .node 二进制文件，Vite无法打包)
        'fsevents',
        'cpu-features',
        'nan',
      ],
    },
  },
})
