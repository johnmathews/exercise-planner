import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // In development the API runs separately (docs/development.md); the browser still sees one
  // origin, as it does behind nginx. The API's PUBLIC_ORIGIN must be the dev server's origin.
  server: { proxy: { '/api': process.env.API_URL ?? 'http://127.0.0.1:8000' } },
  preview: { proxy: { '/api': process.env.API_URL ?? 'http://127.0.0.1:8000' } },
})
