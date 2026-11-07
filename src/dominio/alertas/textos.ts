// Textos de las alertas (§10.7, §12.2, §17): español de España, tuteo, frases cortas, sin culpas ni «!».

import type { Causa, Semaforo } from '../../clima';
import { TIPOS_TRABAJO, type TipoTrabajo } from '../../domain/tipos';
import { DIAS_LARGOS, diaSemanaDeClave } from '../../lib/fechas';
import type { CausaClima } from './tipos';

/** Días entre dos claves de día (b − a). */
export function diasEntre(a: string, b: string): number {
  const t = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** «Jueves 15». */
export function diaConNumero(fecha: string): string {
  return `${DIAS_LARGOS[diaSemanaDeClave(fecha)]} ${Number(fecha.slice(8, 10))}`;
}

/** «jueves 15» (dentro de una frase). */
export const diaEnFrase = (fecha: string) => diaConNumero(fecha).toLowerCase();

/** «el jueves» (resumen), «mañana», «hoy». */
export function cuandoCorto(fecha: string, hoy: string): string {
  const d = diasEntre(hoy, fecha);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  return `el ${DIAS_LARGOS[diaSemanaDeClave(fecha)].toLowerCase()}`;
}

/** «HOY», «MAÑANA», «EN 4 DÍAS». */
export function antelacionMayusculas(dias: number): string {
  if (dias <= 0) return 'HOY';
  if (dias === 1) return 'MAÑANA';
  return `EN ${dias} DÍAS`;
}

/** Causa que se nombra a partir de las causas del semáforo (la principal primero). */
export function causaDe(s: Pick<Semaforo, 'causas' | 'nivel'>): CausaClima | null {
  const delNivel = s.causas.filter((c) => c.nivel === s.nivel);
  const principal = delNivel.find((c) => c.tipo === 'tormenta' || c.tipo === 'aviso') ?? delNivel[0];
  return principal ? causaDeTipo(principal) : null;
}

export function causaDeTipo(c: Causa): CausaClima {
  switch (c.tipo) {
    case 'viento':
    case 'rachas':
      return 'viento';
    case 'tormenta':
      return 'tormenta';
    case 'calor':
      return 'calor';
    case 'helada':
      return 'helada';
    case 'aviso':
      return c.fenomeno === 'nieve' ? 'nieve' : c.fenomeno === 'calor' ? 'calor' : c.fenomeno === 'viento' ? 'viento' : c.fenomeno === 'tormenta' ? 'tormenta' : 'lluvia';
    default:
      return 'lluvia';
  }
}

/** «lluvia», «viento fuerte», «tormenta», «calor», «helada», «nieve». */
export const NOMBRE_CAUSA: Record<CausaClima, string> = {
  lluvia: 'lluvia',
  viento: 'viento',
  tormenta: 'tormenta',
  calor: 'calor',
  helada: 'helada',
  nieve: 'nieve',
};

/** «Corte de césped», «Setos y poda y Fitosanitarios» → nombres visibles de los tipos de trabajo. */
export function textoTrabajos(tipos: TipoTrabajo[] | string[]): string {
  const nombres = tipos.map((t) => TIPOS_TRABAJO.find((x) => x.id === t)?.nombre ?? t);
  if (nombres.length <= 1) return nombres[0] ?? 'Visita';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/** Probabilidad de lluvia máxima entre las causas de lluvia (para «80% lluvia» y el umbral de 4 días). */
export function probLluvia(s: Pick<Semaforo, 'causas'>): number | null {
  const v = s.causas.filter((c) => c.tipo === 'lluvia' || c.tipo === 'cesped_mojado').map((c) => c.valor);
  return v.length ? Math.max(...v) : null;
}

/** Dato clave de la tarjeta (§10.7): «80% lluvia», «Viento 45 km/h», «Tormenta», «36°»… */
export function datoClave(s: Pick<Semaforo, 'causas' | 'nivel'>): string | null {
  const delNivel = s.causas.filter((c) => c.nivel === s.nivel);
  const c = delNivel.find((x) => x.tipo === 'tormenta' || x.tipo === 'aviso') ?? delNivel[0];
  if (!c) return null;
  switch (c.tipo) {
    case 'lluvia':
    case 'cesped_mojado':
      return `${Math.round(c.valor)}% lluvia`;
    case 'lluvia_dia':
      return `${Math.round(c.valor)} mm de lluvia`;
    case 'viento':
    case 'rachas':
      return `Viento ${Math.round(c.valor)} km/h`;
    case 'tormenta':
      return 'Tormenta';
    case 'calor':
      return `${Math.round(c.valor)}°`;
    case 'helada':
      return `Mínima ${Math.round(c.valor)}°`;
    case 'aviso':
      return c.nivelAviso && c.fenomeno ? `${mayuscula(c.nivelAviso)} por ${c.fenomeno}` : 'Aviso oficial';
  }
}

export const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
