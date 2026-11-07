import { activos } from './cifras';
import { cobradoPorClave } from './pendientes';
import type { Deuda, EstadoCobro, Movimiento, SerieRecurrente, Visita } from './tipos';
import { diaSemanaDeClave, sumarDias } from '../lib/fechas';

// Reglas puras de la agenda (§8.4, §8.5, §9.4). Fechas como claves de día en Madrid (AAAA-MM-DD).

/** Si la visita no tiene hora, se considera 09:00 para clima y avisos (§8.4). */
export const HORA_POR_DEFECTO = '09:00';
/** Las visitas de una serie se materializan con 8 semanas de antelación (§8.5). */
export const SEMANAS_MATERIALIZADAS = 8;

export const horaDe = (v: Pick<Visita, 'hora_inicio'>) => v.hora_inicio ?? HORA_POR_DEFECTO;

/** "11:30" + 120 min → "13:30". */
export function horaFin(hora: string, minutos: number): string {
  const [h, m] = hora.split(':').map(Number);
  const t = h * 60 + m + minutos;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** "2 h", "1 h 30 min", "45 min". */
export function textoDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Visitas vivas (no borradas) de un día, ordenadas por hora. Las canceladas quedan al final. */
export function visitasDelDia(visitas: Visita[], dia: string): Visita[] {
  return visitas
    .filter((v) => !v.eliminado_en && v.fecha === dia)
    .sort((a, b) => Number(a.estado === 'cancelada') - Number(b.estado === 'cancelada') || horaDe(a).localeCompare(horaDe(b)));
}

/**
 * Días de una serie entre `desde` y `hasta` (incluidos).
 * - semanal: cada semana en los días de `dias_semana` (o el día de la semana del inicio).
 * - quincenal: igual, cada 2 semanas contando desde la semana de `fecha_inicio`.
 * - mensual: el mismo día del mes que `fecha_inicio` (si el mes no lo tiene, el último día).
 */
export function fechasSerie(serie: Pick<SerieRecurrente, 'regla' | 'fecha_inicio' | 'fecha_fin'>, desde: string, hasta: string): string[] {
  const inicio = serie.fecha_inicio;
  const fin = serie.fecha_fin && serie.fecha_fin < hasta ? serie.fecha_fin : hasta;
  const salida: string[] = [];
  const desdeReal = desde > inicio ? desde : inicio;
  if (desdeReal > fin) return salida;
  const { frecuencia } = serie.regla;
  if (frecuencia === 'mensual') {
    const dia = Number(inicio.slice(8, 10));
    let [a, m] = inicio.split('-').map(Number);
    for (let i = 0; i < 1200; i++) {
      const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
      const f = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
      if (f > fin) break;
      if (f >= desdeReal) salida.push(f);
      m += 1;
      if (m > 12) { m = 1; a += 1; }
    }
    return salida;
  }
  const dias = serie.regla.dias_semana.length ? serie.regla.dias_semana : [diaSemanaDeClave(inicio)];
  // Lunes de la semana del inicio (semanas de lunes a domingo).
  const lunesInicio = sumarDias(inicio, -((diaSemanaDeClave(inicio) + 6) % 7));
  const paso = frecuencia === 'quincenal' ? 14 : 7;
  for (let lunes = lunesInicio; lunes <= fin; lunes = sumarDias(lunes, paso)) {
    for (const d of [...dias].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7))) {
      const f = sumarDias(lunes, (d + 6) % 7);
      if (f >= desdeReal && f <= fin) salida.push(f);
    }
  }
  return salida;
}

/** Cobro de una visita (§8.4 estado_cobro): sale de su deuda y de los cobros activos que la saldan. */
export function estadoCobroVisita(v: Visita, deudas: Deuda[], movs: Movimiento[]): { estado: EstadoCobro; pendiente: number; cobrado: number } {
  if (v.estado !== 'hecha' || v.incluida_en_abono || !v.precio) return { estado: 'no_aplica', pendiente: 0, cobrado: 0 };
  const deuda = deudas.find((d) => d.visita_id === v.id && !d.eliminado_en);
  if (!deuda) return { estado: 'no_aplica', pendiente: 0, cobrado: 0 };
  const cobrado = Math.min(cobradoPorClave(activos(movs)).get(`deuda:${deuda.id}`) ?? 0, deuda.importe);
  const pendiente = deuda.importe - cobrado;
  return { estado: pendiente <= 0 ? 'cobrada' : cobrado > 0 ? 'parcial' : 'pendiente', pendiente, cobrado };
}

/** Texto de periodicidad de una serie: "Cada semana", "Cada 15 días", "Cada mes". */
export function textoFrecuencia(f: SerieRecurrente['regla']['frecuencia']): string {
  return f === 'semanal' ? 'Cada semana' : f === 'quincenal' ? 'Cada 15 días' : 'Cada mes';
}
