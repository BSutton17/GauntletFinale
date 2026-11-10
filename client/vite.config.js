import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.join(root, '..', 'shared') },
  },
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    fs: { allow: [path.join(root, '..')] },
  },
  build: {
    sourcemap: false, // no readable source shipped to the browser
  },
})
