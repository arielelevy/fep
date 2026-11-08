// Publicación a producción (Cloudflare Pages, proyecto «fergo») sin intérprete de shell:
//   node scripts/publicar.mjs [sha]
// La corre Factory con «Pasar a prod» (o a mano). 1. build de producción (vite), 2. comprueba el manifiesto y el
// service worker de la PWA, 3. `wrangler pages deploy dist` a la rama de producción `main`.
// Cuenta: la del `wrangler login` de esta PC (Ariel, 2026-11-07). Dirección: https://fergo-40n.pages.dev
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = realpathSync.native(fileURLToPath(new URL('..', import.meta.url)));
const ruta = (...p) => join(raiz, ...p);
process.chdir(raiz);

const PROYECTO = 'fergo';
const CUENTA = 'b9deb7ba0a245a9b75d270edf70fa652'; // Account ID de Cloudflare (no es un secreto).
const WRANGLER = 'wrangler@4.14.0';
const sha = process.argv[2] || '';

function correr(nombre, cmd, args, opciones = {}) {
  console.log(`\n▶ ${nombre}`);
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...opciones });
  if (r.error || r.status !== 0) {
    console.error(`✗ ${nombre} falló (código ${r.status ?? r.error?.message})`);
    process.exit(1);
  }
}

correr('build de producción (vite)', process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn']);
for (const archivo of ['index.html', 'manifest.webmanifest', 'sw.js']) {
  if (!existsSync(ruta('dist', archivo))) {
    console.error(`✗ falta dist/${archivo}: no se publica`);
    process.exit(1);
  }
}
const args = ['--yes', WRANGLER, 'pages', 'deploy', 'dist', '--project-name', PROYECTO, '--branch', 'main'];
// Sin --commit-message: en Windows npx corre con shell y un mensaje con espacios se parte en varios argumentos.
if (sha) args.push('--commit-hash', sha);
// npx es un .cmd en Windows: sólo aquí se usa el shell, con argumentos fijos (nada viene del usuario salvo el sha).
if (sha && !/^[0-9a-f]{7,40}$/.test(sha)) {
  console.error('✗ sha inválido');
  process.exit(1);
}
correr('publicar en Cloudflare Pages', 'npx', args, {
  shell: process.platform === 'win32',
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: CUENTA },
});
console.log(`\nOK: publicado en https://fergo-40n.pages.dev${sha ? ` (${sha.slice(0, 7)})` : ''}`);
