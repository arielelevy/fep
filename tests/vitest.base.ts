// Configuración común de vitest para las carpetas tests/*/ (QA de la ola 9: los nueve vitest.config.ts eran casi
// idénticos). vite.config.ts sólo incluye src/**; cada carpeta conserva su vitest.config.ts propio, porque
// scripts/verificar.mjs corre una por una:
//   node node_modules/vitest/vitest.mjs run --config tests/<carpeta>/vitest.config.ts
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Ruta real (no la corta ARIELL~1): misma razón que en vite.config.ts.
const raiz = realpathSync.native(join(dirname(fileURLToPath(import.meta.url)), '..'));
if (realpathSync.native(process.cwd()) === raiz && process.cwd() !== raiz) process.chdir(raiz);

/** Config de tests/<carpeta>/. Por defecto, el mismo arranque que la suite de src/ (IndexedDB falsa, localStorage en
 *  memoria, guía vista); `setup` lo cambia por otro archivo relativo a la raíz del repo. */
export function configCarpeta(carpeta: string, setup = 'src/test/setup.ts') {
  return defineConfig({
    root: raiz,
    test: {
      environment: 'jsdom',
      globals: true,
      include: [`tests/${carpeta}/**/*.test.{ts,tsx}`],
      setupFiles: [join(raiz, setup)],
      testTimeout: 15000,
    },
  });
}
