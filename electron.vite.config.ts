import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: { outDir: 'out/main' },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
  preload: {
    build: { outDir: 'out/preload' },
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
  renderer: {
    root: 'src/renderer',
    build: { outDir: 'out/renderer' },
    plugins: [react()],
    resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  },
})
