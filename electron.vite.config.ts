import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: { outDir: 'out/main' },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
  preload: {
    build: { outDir: 'out/preload', rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts'), tray: resolve(__dirname, 'src/preload/tray.ts') } } },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
  renderer: {
    root: 'src/renderer',
    build: { outDir: 'out/renderer', rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html'), tray: resolve(__dirname, 'src/renderer/tray.html') } } },
    plugins: [react()],
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
})
