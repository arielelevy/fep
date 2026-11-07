// Configuración de vitest para las pruebas del clima (ola 6, frente A).
// vite.config.ts sólo incluye src/**; estas pruebas viven en tests/clima/ y se corren con:
//   node node_modules/vitest/vitest.mjs run --config tests/clima/vitest.config.ts
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Ruta real (no la corta ARIELL~1): misma razón que en vite.config.ts.
const raiz = realpathSync.native(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
if (realpathSync.native(process.cwd()) === raiz && process.cwd() !== raiz) process.chdir(raiz);

export default defineConfig({
  root: raiz,
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/clima/**/*.test.{ts,tsx}'],
    setupFiles: [join(raiz, 'tests/clima/setup.ts')],
    testTimeout: 15000,
  },
});
