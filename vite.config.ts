import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: '.',
  build: {
    target: 'es2022',
    sourcemap: true
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.ts']
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Finance Tracker',
        short_name: 'Finance',
        description: 'Finance and inventory tracker for household and business workspaces',
        theme_color: '#0e1420',
        background_color: '#0e1420',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ]
});
