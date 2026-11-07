// Configuración de vitest para las pruebas de tests/agenda-clima/ (ola 6, frente B).
// vite.config.ts sólo incluye src/**; estas pruebas se corren con:
//   node node_modules/vitest/vitest.mjs run --config tests/agenda-clima/vitest.config.ts
// (scripts/verificar.mjs las corre junto con las demás carpetas tests/*/).
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
    include: ['tests/agenda-clima/**/*.test.{ts,tsx}'],
    // Mismo arranque que la suite de src/ (IndexedDB falsa, localStorage en memoria, guía vista).
    setupFiles: [join(raiz, 'src/test/setup.ts')],
    testTimeout: 15000,
  },
});
