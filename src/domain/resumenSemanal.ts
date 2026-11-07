import { formatearEuros } from '../lib/dinero';
import { claveDia, diaSemanaDeClave, sumarDias } from '../lib/fechas';
import type { Deuda, Movimiento, Visita } from './tipos';

// Resumen semanal positivo (§10.1.2, §5 «nunca regañar»): «Esta semana cobraste 640 € en 6 trabajos» y la
// variación respecto a la semana anterior solo si es positiva. Semana de lunes a domingo en Madrid.

export interface ResumenSemanal {
  desde: string; // lunes AAAA-MM-DD
  hasta: string; // domingo AAAA-MM-DD
  cobrado: number; // céntimos: cobros (trabajo y abono) de la semana
  trabajos: number;
  anterior: number; // cobrado la semana anterior
  mejora: number | null; // cobrado − anterior, solo si es positiva
}

/** Lunes de la semana (Madrid) de un día. */
export function lunesDe(dia: string): string {
  return sumarDias(dia, -((diaSemanaDeClave(dia) + 6) % 7));
}

const enRango = (dia: string, desde: string, hasta: string) => dia >= desde && dia <= hasta;

function cobradoEntre(movs: Movimiento[], desde: string, hasta: string): Movimiento[] {
  return movs.filter((m) => !m.eliminado_en && m.tipo === 'cobro' && enRango(claveDia(m.fecha), desde, hasta));
}

/**
 * Trabajos de la semana: visitas hechas en la semana más trabajos anotados sin visita (hoja «Trabajo hecho»).
 * Sin visitas ni deudas, cuenta los cobros (cada cobro, un trabajo).
 */
export function resumenSemanal(
  movimientos: Movimiento[],
  ahora: Date = new Date(),
  trabajosDe?: { visitas: Visita[]; deudas: Deuda[] },
): ResumenSemanal {
  const desde = lunesDe(claveDia(ahora));
  const hasta = sumarDias(desde, 6);
  const estaSemana = cobradoEntre(movimientos, desde, hasta);
  const cobrado = estaSemana.reduce((s, m) => s + m.importe, 0);
  const anterior = cobradoEntre(movimientos, sumarDias(desde, -7), sumarDias(desde, -1)).reduce((s, m) => s + m.importe, 0);
  const trabajos = trabajosDe
    ? trabajosDe.visitas.filter((v) => !v.eliminado_en && v.estado === 'hecha' && v.hecha_en && enRango(claveDia(v.hecha_en), desde, hasta)).length +
      trabajosDe.deudas.filter((d) => !d.eliminado_en && !d.visita_id && enRango(claveDia(d.fecha), desde, hasta)).length
    : estaSemana.length;
  return { desde, hasta, cobrado, trabajos, anterior, mejora: cobrado > anterior ? cobrado - anterior : null };
}

/** «Esta semana cobraste 640 € en 6 trabajos» («en 1 trabajo»; sin trabajos contados, sin la coletilla). */
export function textoResumenSemanal(r: Pick<ResumenSemanal, 'cobrado' | 'trabajos'>): string {
  const base = `Esta semana cobraste ${formatearEuros(r.cobrado)}`;
  if (r.trabajos <= 0) return base;
  return `${base} en ${r.trabajos} ${r.trabajos === 1 ? 'trabajo' : 'trabajos'}`;
}

/** «120 € más que la semana pasada» o null si no mejora. */
export function textoMejora(r: Pick<ResumenSemanal, 'mejora'>): string | null {
  return r.mejora ? `${formatearEuros(r.mejora)} más que la semana pasada` : null;
}

/**
 * ¿Se muestra la tarjeta? Los domingos, o el primer día de la semana sin visitas (§10.1.2), y solo si hay
 * algo cobrado (es un resumen positivo: con 0 € no se enseña).
 */
export function mostrarResumenSemanal(r: Pick<ResumenSemanal, 'cobrado' | 'desde'>, visitas: Visita[], ahora: Date = new Date()): boolean {
  if (r.cobrado <= 0) return false;
  const hoy = claveDia(ahora);
  if (diaSemanaDeClave(hoy) === 0) return true;
  const conVisitas = (dia: string) => visitas.some((v) => !v.eliminado_en && v.estado !== 'cancelada' && v.fecha === dia);
  if (conVisitas(hoy)) return false;
  for (let d = r.desde; d < hoy; d = sumarDias(d, 1)) if (!conVisitas(d)) return false;
  return true;
}
