import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://www.joshcocciardi.com/projects/workbook by the portfolio
// hosting target (apps/workbook/dist is copied into
// apps/portfolio/public/projects/workbook at deploy time — see deploy.sh).
//
// NOTE: unlike moment-capture, this app deliberately does NOT set COOP/COEP
// headers — they would break the Google sign-in popup, and nothing here needs
// SharedArrayBuffer. The service worker caches Firebase Storage audio so words
// Bodhi has already tapped will still play when the device is offline.
// https://vite.dev/config/
export default defineConfig({
  base: '/projects/workbook',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['book.svg'],
      manifest: {
        name: 'Workbook Reader',
        short_name: 'Workbook',
        description: 'Snap a workbook page and tap any word to hear it read aloud.',
        theme_color: '#4f46e5',
        background_color: '#eef2ff',
        display: 'standalone',
        start_url: '/projects/workbook',
        icons: [
          { src: 'book.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'book.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/projects/workbook/index.html',
        navigateFallbackAllowlist: [/^\/projects\/workbook/],
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            // Cached word audio + page images play/show offline once fetched.
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'workbook-storage-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
