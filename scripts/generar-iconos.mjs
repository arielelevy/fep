// Genera los iconos PNG de la PWA (logo F de FERGO sobre fondo blanco, §4.1) sin dependencias.
// Uso: node scripts/generar-iconos.mjs  → escribe en public/. Las formas son las mismas que src/components/Logo.tsx.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const VERDE_OSCURO = [0x12, 0x39, 0x1f];
const VERDE_MEDIO = [0x1f, 0x5a, 0x30];

// Formas en un lienzo de 100 × 100 (idénticas al SVG de Logo.tsx).
const RECTS = [
  { x: 26, y: 20, w: 50, h: 14, r: 7 },
  { x: 26, y: 20, w: 14, h: 62, r: 7 },
  { x: 26, y: 44, w: 34, h: 13, r: 6.5 },
];
const HOJA = { cx: 64, cy: 71, rx: 15, ry: 8, rot: (-35 * Math.PI) / 180 };

function enRect(px, py, { x, y, w, h, r }) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}
function enHoja(px, py) {
  const dx = px - HOJA.cx, dy = py - HOJA.cy;
  const c = Math.cos(-HOJA.rot), s = Math.sin(-HOJA.rot);
  const u = dx * c - dy * s, v = dx * s + dy * c;
  return (u / HOJA.rx) ** 2 + (v / HOJA.ry) ** 2 <= 1;
}
function color(px, py) {
  if (RECTS.some((r) => enRect(px, py, r))) return VERDE_OSCURO;
  if (enHoja(px, py)) return VERDE_MEDIO;
  return null;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(tipo, datos) {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(tam, escala) {
  const SS = 4;
  const filas = [];
  for (let y = 0; y < tam; y++) {
    const fila = Buffer.alloc(1 + tam * 3);
    for (let x = 0; x < tam; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        // Coordenadas en el lienzo de 100, centradas y escaladas (zona segura para maskable).
        const px = ((x + (sx + 0.5) / SS) / tam - 0.5) * 100 / escala + 50;
        const py = ((y + (sy + 0.5) / SS) / tam - 0.5) * 100 / escala + 50;
        const c = color(px, py) ?? [255, 255, 255];
        r += c[0]; g += c[1]; b += c[2];
      }
      const n = SS * SS;
      fila[1 + x * 3] = Math.round(r / n); fila[2 + x * 3] = Math.round(g / n); fila[3 + x * 3] = Math.round(b / n);
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(filas), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icono-192.png', png(192, 1));
writeFileSync('public/icono-512.png', png(512, 1));
writeFileSync('public/icono-maskable-512.png', png(512, 0.72));
writeFileSync('public/apple-touch-icon.png', png(180, 0.86));
writeFileSync('public/icono.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#fff"/><g fill="#12391F"><rect x="26" y="20" width="50" height="14" rx="7"/><rect x="26" y="20" width="14" height="62" rx="7"/><rect x="26" y="44" width="34" height="13" rx="6.5"/></g><ellipse cx="64" cy="71" rx="15" ry="8" transform="rotate(-35 64 71)" fill="#1F5A30"/></svg>\n`);
console.log('Iconos generados en public/');
