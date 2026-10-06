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
        // The calibration HUD, likewise its own document.
        hud: resolve(__dirname, 'hud.html'),
        // The tray icon's right-click menu (services/tray_menu.rs).
        traymenu: resolve(__dirname, 'traymenu.html'),
        // Drawing a trackpad's mouse area on the screen (services/area_picker.rs).
        areapicker: resolve(__dirname, 'areapicker.html'),
        keyboard: resolve(__dirname, 'keyboard.html'),
      },
    },
  },
  server: {
    host: process.env.TAURI_DEV_HOST ?? '127.0.0.1',
    port: 1420,
    strictPort: true,
    // Native builds lock Windows executables. Watching Cargo output can crash
    // the web preview halfway through a Rust test or Tauri build.
    watch: { ignored: ['**/src-tauri/target/**', '**/src-tauri/bin/**'] },
  },
})
