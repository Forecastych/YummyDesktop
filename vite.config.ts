import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

// Tauri ожидает фиксированный порт; лишние файлы не следим, чтобы не будить HMR от cargo.
export default defineConfig({
  plugins: [svelte()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
    reportCompressedSize: false,
  },
  // DOMParser, localStorage и location нужны санитайзеру, хранилищу и роутеру.
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
})
