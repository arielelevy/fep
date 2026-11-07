// Auditor automático de accesibilidad para jsdom (ola 9; §5.6 y criterios 32 y 33 de §18).
// jsdom no maqueta, así que se mide lo que el CSS declara:
//   - Zonas táctiles: alto = max(min-height, height) declarados; si no hay, estimado por relleno + línea de texto.
//     Ancho = max(min-width, width) o, si no hay, relleno + texto (0,55 em por letra). Ancho completo (100 %, flex)
//     cuenta como suficiente. Umbral 44 × 44 px (pt CSS).
//   - Contraste: pares color/fondo declarados en la misma regla CSS, resolviendo los tokens de tokens.css.
//   - Nombre accesible en todo control, sin tabindex positivo, y puntos de color siempre con texto al lado.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeAccessibleName } from 'dom-accessibility-api';

const RAIZ = join(__dirname, '..', '..');

function archivosCss(dir: string): string[] {
  const r: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) r.push(...archivosCss(p));
    else if (e.name.endsWith('.css')) r.push(p);
  }
  return r;
}

export const CSS = archivosCss(join(RAIZ, 'src')).map((f) => ({ archivo: f.slice(RAIZ.length + 1).replace(/\\/g, '/'), texto: readFileSync(f, 'utf8') }));

/** Tokens de color (`--verde-oscuro: #12391f`). */
export const TOKENS: Record<string, string> = Object.fromEntries(
  [...readFileSync(join(RAIZ, 'src/styles/tokens.css'), 'utf8').matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)].map((m) => [m[1], m[2].toLowerCase()]),
);

/** Inyecta todo el CSS del proyecto (sin @font-face ni @import) para que getComputedStyle lo aplique. */
export function cargarCss(): void {
  if (document.getElementById('css-auditoria')) return;
  const s = document.createElement('style');
  s.id = 'css-auditoria';
  s.textContent = CSS.map((c) => c.texto.replace(/@import[^;]+;/g, '').replace(/var\((--[\w-]+)\)/g, (_, t: string) => TOKENS[t] ?? `var(${t})`)).join('\n');
  document.head.appendChild(s);
}

const px = (v: string | null | undefined): number => {
  if (!v) return 0;
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(v.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
};

const INTERACTIVOS = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"]';

function oculto(el: Element): boolean {
  for (let x: Element | null = el; x; x = x.parentElement) {
    if (x.getAttribute('aria-hidden') === 'true' || x.hasAttribute('hidden') || x.classList.contains('sr-only')) return true;
    if (getComputedStyle(x).display === 'none') return true;
  }
  return false;
}

/**
 * La zona táctil real de un control: el <label> que envuelve un input de archivo (botón de cámara), o el contenedor
 * cuando el control lo cubre entero (position: absolute con 100 % de alto, como el selector de fecha de Registrar).
 */
function zonaTactil(el: HTMLElement): HTMLElement {
  const label = el.closest('label');
  if (label && el instanceof HTMLInputElement && el.type === 'file') return label;
  const cs = getComputedStyle(el);
  if (cs.position === 'absolute' && cs.height === '100%' && el.parentElement) return el.parentElement;
  return el;
}

const enLinea = (el: Element) => ['inline', ''].includes(getComputedStyle(el).display);
const tieneTextoPropio = (el: Element) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());

/** Tamaño de letra efectivo (jsdom no hereda font-size: se busca en los ancestros). */
function fuenteDe(x: Element): number {
  for (let y: Element | null = x; y; y = y.parentElement) {
    const f = px(getComputedStyle(y).fontSize);
    if (f) return f;
  }
  return 15;
}

/**
 * Alto del contenido: el texto se agrupa por su bloque contenedor (el ancestro más cercano que no va en línea); cada
 * bloque es una línea con la letra mayor que tenga. Así «En caja» + la cifra grande cuentan como dos líneas.
 */
function altoContenido(el: HTMLElement): number {
  const conTexto = [el, ...Array.from(el.querySelectorAll('*'))].filter(tieneTextoPropio);
  const lineas = new Map<Element, number>();
  for (const x of conTexto) {
    let b: Element = x;
    while (b !== el && enLinea(b) && b.parentElement) b = b.parentElement;
    lineas.set(b, Math.max(lineas.get(b) ?? 0, fuenteDe(x)));
  }
  const total = [...lineas.values()].reduce((s, f) => s + f * 1.35, 0);
  return total || fuenteDe(el) * 1.35;
}
function medidas(el: HTMLElement): { alto: number; ancho: number; completo: boolean } {
  const cs = getComputedStyle(el);
  const fuente = fuenteDe(el);
  const vertical = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) * 2;
  const horizontal = px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) * 2;
  const declaradoAlto = Math.max(px(cs.minHeight), px(cs.height));
  const declaradoAncho = Math.max(px(cs.minWidth), px(cs.width));
  const texto = (el.textContent ?? '').trim().length || (el instanceof HTMLInputElement ? Math.max(5, el.value.length) : 0);
  const iconos = el.querySelectorAll('svg').length * 22;
  const padre = el.parentElement ? getComputedStyle(el.parentElement).display : '';
  const completo =
    cs.width === '100%' || (cs.flex !== '' && !cs.flex.startsWith('0') && cs.flex !== 'none') || cs.flexGrow === '1' || cs.display === 'block' ||
    padre === 'grid' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
  return {
    alto: declaradoAlto || vertical + altoContenido(el),
    ancho: declaradoAncho || horizontal + texto * fuente * 0.55 + iconos,
    completo,
  };
}

export interface Defecto {
  regla: string;
  elemento: string;
  detalle: string;
}

const describir = (el: Element) => {
  const nombre = computeAccessibleName(el) || (el.textContent ?? '').trim().slice(0, 30);
  return `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}"> «${nombre}»`;
};

/** Audita lo que hay montado en el documento. */
export function auditar(raiz: ParentNode = document.body): Defecto[] {
  const d: Defecto[] = [];
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>(INTERACTIVOS))) {
    if (oculto(el) && !(el instanceof HTMLInputElement && el.type === 'file')) continue;
    const zona = zonaTactil(el);
    if (zona !== el && oculto(zona)) continue;
    // Nombre accesible (botones solo con icono con aria-label, §5.6.4).
    if (!(el instanceof HTMLInputElement && el.type === 'file') && !computeAccessibleName(el).trim()) d.push({ regla: 'nombre', elemento: describir(el), detalle: 'sin nombre accesible' });
    // Orden de foco: sin tabindex positivo.
    if (Number(el.getAttribute('tabindex')) > 0) d.push({ regla: 'foco', elemento: describir(el), detalle: `tabindex=${el.getAttribute('tabindex')}` });
    // Zona táctil 44 × 44.
    const m = medidas(zona);
    if (m.alto < 44) d.push({ regla: 'tactil-alto', elemento: describir(zona), detalle: `alto ≈ ${Math.round(m.alto)} px` });
    if (!m.completo && m.ancho < 44) d.push({ regla: 'tactil-ancho', elemento: describir(zona), detalle: `ancho ≈ ${Math.round(m.ancho)} px` });
  }
  // Estados nunca solo por color: cada punto de color va con texto a su lado (§5.6.3).
  for (const p of Array.from(raiz.querySelectorAll<HTMLElement>('.punto-semaforo, .leyenda-bloques .punto'))) {
    const contenedor = p.parentElement?.closest('li, button, p, div, span, article') ?? p.parentElement;
    if (!(contenedor?.textContent ?? '').trim()) d.push({ regla: 'solo-color', elemento: describir(p), detalle: 'punto de color sin texto' });
  }
  return d;
}

// ---------- Contraste (§5.6.2) ----------

const hexARgb = (h: string): [number, number, number] => {
  const x = h.replace('#', '');
  const t = x.length === 3 ? x.split('').map((c) => c + c).join('') : x;
  return [0, 2, 4].map((i) => parseInt(t.slice(i, i + 2), 16)) as [number, number, number];
};
const luminancia = (h: string) => {
  const [r, g, b] = hexARgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const NOMBRES: Record<string, string> = { white: '#ffffff', '#fff': '#ffffff', black: '#000000' };
function color(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  const t = /^var\((--[\w-]+)\)$/.exec(s);
  if (t) return TOKENS[t[1]] ?? null;
  if (NOMBRES[s]) return NOMBRES[s];
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(s)) return s;
  return null;
}

export interface ParContraste {
  archivo: string;
  selector: string;
  texto: string;
  fondo: string;
  ratio: number;
  minimo: number;
}

/** Pares color/fondo declarados en la misma regla de cualquier CSS del proyecto. */
export function paresCss(): ParContraste[] {
  const r: ParContraste[] = [];
  for (const { archivo, texto } of CSS) {
    const limpio = texto.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of limpio.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim();
      if (selector.startsWith('@')) continue;
      const decl = Object.fromEntries(
        m[2].split(';').map((x) => x.split(':')).filter((x) => x.length >= 2).map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
      );
      const c = color(decl.color);
      const f = color(decl['background-color'] ?? decl.background);
      if (!c || !f) continue;
      const tam = px(decl['font-size']);
      const grande = tam >= 24 || (tam >= 18.66 && Number(decl['font-weight']) >= 700);
      r.push({ archivo, selector, texto: c, fondo: f, ratio: contraste(c, f), minimo: grande ? 3 : 4.5 });
    }
  }
  return r;
}
