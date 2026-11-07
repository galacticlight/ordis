import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const dir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: dir,
  server: {
    port: 5179,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [path.resolve(dir, '..')] }
  },
  preview: { port: 5179, strictPort: true }
})
