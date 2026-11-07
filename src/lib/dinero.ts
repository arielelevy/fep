// Importes en céntimos enteros (§4.3). Nunca coma flotante en cálculos.
// Formato es-ES escrito a mano: Intl 'es-ES' no agrupa los números de 4 cifras ("1240"),
// y la especificación pide "1.240 €".

export const IMPORTE_MAXIMO = 9_999_999; // 99.999,99 € (§10.2.1.3)

function agrupar(entero: number): string {
  return String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export type ModoDecimales = 'resumen' | 'detalle';

/**
 * Formatea céntimos como euros es-ES.
 * - 'resumen': sin decimales si son ",00" ("1.240 €", "38,50 €").
 * - 'detalle': siempre con dos decimales ("1.240,00 €").
 */
export function formatearEuros(centimos: number, modo: ModoDecimales = 'resumen'): string {
  if (!Number.isInteger(centimos)) throw new Error('El importe debe estar en céntimos enteros');
  const abs = Math.abs(centimos);
  const euros = Math.floor(abs / 100);
  const cent = abs % 100;
  const signo = centimos < 0 ? '− ' : '';
  const decimales = modo === 'detalle' || cent !== 0 ? ',' + String(cent).padStart(2, '0') : '';
  return `${signo}${agrupar(euros)}${decimales} €`;
}

/** Con signo explícito: "+ 60 €", "− 38,50 €". */
export function formatearConSigno(centimos: number, modo: ModoDecimales = 'resumen'): string {
  if (centimos > 0) return '+ ' + formatearEuros(centimos, modo);
  return formatearEuros(centimos, modo);
}

/**
 * Convierte el texto del campo Importe a céntimos.
 * El campo usa coma decimal y punto de miles ("1.240,5"). Un punto solo seguido de 1 o 2 cifras
 * ("38.5") también se acepta como decimal. Devuelve null si no es válido o supera el máximo.
 */
export function parsearImporte(texto: string): number | null {
  const limpio = texto.replace(/[\s€]/g, '');
  if (!limpio) return null;
  let entero: string;
  let dec = '';
  if (limpio.includes(',')) {
    const partes = limpio.split(',');
    if (partes.length !== 2) return null;
    entero = partes[0].replace(/\./g, '');
    dec = partes[1];
  } else {
    const m = /^(\d+)\.(\d{1,2})$/.exec(limpio);
    if (m) {
      entero = m[1];
      dec = m[2];
    } else entero = limpio.replace(/\./g, '');
  }
  if (!/^\d*$/.test(entero) || !/^\d{0,2}$/.test(dec)) return null;
  if (!entero && !dec) return null;
  const centimos = Number(entero || '0') * 100 + Number(dec.padEnd(2, '0'));
  if (!Number.isSafeInteger(centimos) || centimos > IMPORTE_MAXIMO) return null;
  return centimos;
}

/**
 * Da formato al texto del importe mientras se escribe (§10.2.1.3): agrupa miles,
 * admite una coma (o un punto tecleado como decimal) y hasta 2 decimales, máximo 99.999,99.
 * Devuelve null si la tecla no se acepta: el campo conserva el texto anterior.
 */
export function formatearMientrasEscribe(texto: string, anterior = ''): string | null {
  let t = texto.replace(/[\s€]/g, '');
  if (t === '') return '';
  // Si el usuario acaba de teclear un punto (teclado decimal en inglés), es la coma decimal.
  if (!t.includes(',') && t.length === anterior.length + 1 && t.endsWith('.')) {
    t = t.slice(0, -1) + ',';
  }
  const partes = t.split(',');
  if (partes.length > 2) return null;
  const entero = partes[0].replace(/\./g, '');
  const dec = partes[1];
  if (!/^\d*$/.test(entero)) return null;
  if (dec !== undefined && !/^\d{0,2}$/.test(dec)) return null;
  const enteroNorm = entero.replace(/^0+(?=\d)/, '');
  if (enteroNorm.length > 5) return null;
  const agrupado = enteroNorm ? agrupar(Number(enteroNorm)) : dec !== undefined ? '0' : '';
  return dec !== undefined ? `${agrupado},${dec}` : agrupado;
}

/** Texto editable a partir de céntimos ("38,50", "1.240"). */
export function centimosATexto(centimos: number): string {
  const euros = Math.floor(centimos / 100);
  const cent = centimos % 100;
  return agrupar(euros) + (cent ? ',' + String(cent).padStart(2, '0') : '');
}
