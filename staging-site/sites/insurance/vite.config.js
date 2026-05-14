import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Site is mounted at /insurance/ when deployed under staging-site/dist
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/insurance/',
})
