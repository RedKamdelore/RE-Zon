import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  server: { fs: { allow: [resolve(__dirname, 'src'), resolve(__dirname, 'resources')] } },
})
