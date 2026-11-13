import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
    chunkSizeWarningLimit: 1500
  },
  worker: {
    format: 'es'
  }
})
