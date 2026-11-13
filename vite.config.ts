/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/rotation/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a forced auto-reload would abort in-flight CSV imports
      // and Last.fm backfills; the app shows an update pill instead
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Rotation',
        short_name: 'Rotation',
        description: 'Your music listening stats, for Apple Music and Spotify',
        start_url: '/rotation/',
        scope: '/rotation/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#101014',
        theme_color: '#101014',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // link-preview image is for crawlers, not the offline app
        globIgnores: ['og.png'],
        navigateFallback: '/rotation/index.html',
        runtimeCaching: [
          {
            // Last.fm album artwork: cache-first, capped
            urlPattern: /^https:\/\/lastfm\.freetls\.fastly\.net\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'artwork',
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
