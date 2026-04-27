import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Force network-only for all fetches – no offline support
      workbox: {
        runtimeCaching: [],
        // Don't precache anything
        globPatterns: [],
        // Ensure the service worker doesn't serve stale content
        navigateFallback: null
      },
      manifest: {
        name: 'UpScale Resale Flow',
        short_name: 'UpScale',
        description: 'Event sales management for UpScale Resale',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})