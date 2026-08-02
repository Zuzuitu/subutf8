import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SubUTF8',
        short_name: 'SubUTF8',
        description: 'Offline subtitle encoding converter',
        display: 'standalone',
        background_color: '#f5f5f7',
        theme_color: '#0a84ff'
      }
    })
  ]
})
