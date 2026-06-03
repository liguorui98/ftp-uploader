import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron', 'path', 'fs', 'os', 'events', 'util', 'buffer'],
    },
  },
})
