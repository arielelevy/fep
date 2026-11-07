// Verificación de la ola 2 en un solo comando, sin intérprete de shell en la línea PRUEBA:
//   node scripts/verificar.mjs
// 1. Instala dependencias con `npm ci` si falta node_modules (copia limpia del repo).
// 2. Comprueba tipos (tsc), 3. corre todas las pruebas (vitest), 4. hace el build de producción
// y 5. comprueba que genera el manifiesto y el service worker de la PWA con lo que pide §4.1.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath decodifica la ruta: con `URL.pathname` el `~` de una ruta corta de Windows (ARIELL~1) quedaba
// como `%7E` y el chdir fallaba en la copia limpia de Factory, en la carpeta temporal.
// realpath: en la copia temporal la ruta corta (ARIELL~1) y la larga (ArielLevy) se mezclaban y Vite no encontraba
// src/test/setup.ts («Does the file exist?»). Con la ruta real, raíz y archivos resueltos coinciden.
const raiz = realpathSync.native(fileURLToPath(new URL('..', import.meta.url)));
const ruta = (...p) => join(raiz, ...p);
process.chdir(ruta());

function correr(nombre, cmd, args, opciones = {}) {
  console.log(`\n▶ ${nombre}`);
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...opciones });
  if (r.error || r.status !== 0) {
    console.error(`✗ ${nombre} falló (código ${r.status ?? r.error?.message})`);
    process.exit(1);
  }
}

if (!existsSync(ruta('node_modules', 'vitest'))) {
  // npm es un .cmd en Windows: sólo aquí se usa el shell, nunca desde la línea PRUEBA.
  correr('npm ci', 'npm', ['ci', '--no-audit', '--no-fund'], { shell: process.platform === 'win32' });
}

const node = process.execPath;
correr('tipos (tsc)', node, ['node_modules/typescript/bin/tsc', '-p', '.']);
correr('pruebas (vitest)', node, ['node_modules/vitest/vitest.mjs', 'run']);
correr('build de producción (vite)', node, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn']);

console.log('\n▶ PWA: manifiesto y service worker');
const fallos = [];
const dist = ruta('dist');
const manifiestoRuta = join(dist, 'manifest.webmanifest');
if (!existsSync(manifiestoRuta)) fallos.push('falta dist/manifest.webmanifest');
else {
  const m = JSON.parse(readFileSync(manifiestoRuta, 'utf8'));
  if (m.display !== 'standalone') fallos.push(`display = ${m.display}`);
  if (m.theme_color?.toUpperCase() !== '#12391F') fallos.push(`theme_color = ${m.theme_color}`);
  for (const tam of ['192x192', '512x512']) {
    const icono = m.icons?.find((i) => i.sizes === tam);
    if (!icono) fallos.push(`falta icono ${tam}`);
    else if (!existsSync(join(dist, icono.src))) fallos.push(`no existe ${icono.src}`);
  }
  if (!m.icons?.some((i) => i.purpose === 'maskable')) fallos.push('falta icono maskable');
}
const sw = join(dist, 'sw.js');
if (!existsSync(sw)) fallos.push('falta dist/sw.js');
else {
  const contenido = readFileSync(sw, 'utf8');
  if (!contenido.includes('index.html')) fallos.push('el service worker no precachea index.html');
  if (!/plus-jakarta-sans[^"']*\.woff2/.test(contenido)) fallos.push('la fuente autoalojada no está en el precache');
}
const html = existsSync(join(dist, 'index.html')) ? readFileSync(join(dist, 'index.html'), 'utf8') : '';
if (!html.includes('manifest.webmanifest')) fallos.push('index.html no enlaza el manifiesto');
if (!html.includes('registerSW.js')) fallos.push('index.html no registra el service worker');
const fuentes = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.woff2'));
if (fuentes.length < 5) fallos.push(`fuentes woff2 en dist: ${fuentes.length} (se esperan 5 pesos)`);

if (fallos.length) {
  console.error('✗ PWA:\n  - ' + fallos.join('\n  - '));
  process.exit(1);
}
console.log('✓ manifiesto (standalone, #12391F, iconos 192/512/maskable), service worker con precache de la app y la fuente');
console.log('\nOK: verificación completa');
