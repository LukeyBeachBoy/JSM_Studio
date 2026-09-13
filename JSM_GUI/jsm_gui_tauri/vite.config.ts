import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  build: {
    rollupOptions: {
      // The overlay is its own document so it loads none of the editor: it has
      // to be cheap enough to sit over a game at the display's refresh rate.
      input: {
        main: resolve(__dirname, 'index.html'),
        overlay: resolve(__dirname, 'overlay.html'),
      },
    },
  },
  server: {
    host: process.env.TAURI_DEV_HOST ?? '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
})
