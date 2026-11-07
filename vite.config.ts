/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Raíz real del proyecto. Si se arranca desde una ruta corta de Windows (C:\Users\ARIELL~1\…), Vite resuelve
// los archivos con la ruta larga y no casa el setup de las pruebas («Does the file exist?»): con la ruta real,
// raíz y archivos coinciden con cualquier forma de invocar vite o vitest (QA de la ola 2).
const raiz = realpathSync.native(dirname(fileURLToPath(import.meta.url)));
// El cwd también: Vite toma de él las carpetas permitidas y vitest lo hereda en sus procesos de prueba.
if (realpathSync.native(process.cwd()) === raiz && process.cwd() !== raiz) process.chdir(raiz);

// Especificación §4.1: PWA instalable, display standalone, color de tema #12391F,
// icono con la F de FERGO sobre fondo blanco. La fuente va en el precache (§6.2: autoalojada).
export default defineConfig({
  root: raiz,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icono.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FERGO · Mantenimiento y Jardines',
        short_name: 'FERGO',
        description: 'Dinero, clientes y agenda de FERGO.',
        lang: 'es-ES',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFFFFF',
        theme_color: '#12391F',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [join(raiz, 'src/test/setup.ts')],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 15000,
  },
});
