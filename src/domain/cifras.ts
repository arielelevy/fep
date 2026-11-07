import { claveMes } from '../lib/fechas';
import type { MedioPago, Movimiento, TipoMovimiento } from './tipos';

// Reglas de §9.1 y cifras de §9.3. Funciones puras sobre céntimos enteros.

const ENTRADAS: TipoMovimiento[] = ['cobro', 'anticipo', 'otro_ingreso', 'aporte', 'prestamo', 'fianza_devuelta', 'saldo_inicial'];
const SALIDAS: TipoMovimiento[] = ['gasto', 'devolucion_prestamo', 'fianza_entregada'];
const INGRESOS_NEGOCIO: TipoMovimiento[] = ['cobro', 'anticipo', 'otro_ingreso'];

export const activos = (movs: Movimiento[]) => movs.filter((m) => !m.eliminado_en);

/** Efecto en "En caja" de un movimiento (positivo entra, negativo sale). */
export function efectoEnCaja(m: Pick<Movimiento, 'tipo' | 'importe'>): number {
  if (ENTRADAS.includes(m.tipo)) return m.importe;
  if (SALIDAS.includes(m.tipo)) return -m.importe;
  return 0;
}

/** Efecto en "Ganado": ingresos del negocio suman; gastos que no son inversión restan; el resto no cuenta. */
export function efectoEnGanado(m: Pick<Movimiento, 'tipo' | 'importe' | 'es_inversion'>): number {
  if (INGRESOS_NEGOCIO.includes(m.tipo)) return m.importe;
  if (m.tipo === 'gasto' && !m.es_inversion) return -m.importe;
  return 0;
}

/** "En caja": todo lo que entra menos todo lo que sale, desde el inicio (§9.3). */
export function calcularEnCaja(movs: Movimiento[]): number {
  return activos(movs).reduce((s, m) => s + efectoEnCaja(m), 0);
}

const esBanco = (medio: MedioPago) => medio !== 'efectivo';

/** Desglose de "En caja": efectivo y banco (Bizum, tarjeta y transferencia van a banco). */
export function desgloseEnCaja(movs: Movimiento[]): { efectivo: number; banco: number } {
  let efectivo = 0;
  let banco = 0;
  for (const m of activos(movs)) {
    if (esBanco(m.medio_pago)) banco += efectoEnCaja(m);
    else efectivo += efectoEnCaja(m);
  }
  return { efectivo, banco };
}

/** "Ganado en [mes]": cobros + anticipos + otros ingresos − gastos no inversión del mes natural (Madrid). */
export function calcularGanado(movs: Movimiento[], mes: string): number {
  return activos(movs)
    .filter((m) => claveMes(m.fecha) === mes)
    .reduce((s, m) => s + efectoEnGanado(m), 0);
}

/** Tarjetas de mes de Movimientos (§10.3.2). */
export function resumenMes(movs: Movimiento[], mes: string): { cobrado: number; gastado: number; inversion: number } {
  let cobrado = 0;
  let gastado = 0;
  let inversion = 0;
  for (const m of activos(movs)) {
    if (claveMes(m.fecha) !== mes) continue;
    if (INGRESOS_NEGOCIO.includes(m.tipo)) cobrado += m.importe;
    else if (m.tipo === 'gasto') {
      if (m.es_inversion) inversion += m.importe;
      else gastado += m.importe;
    }
  }
  return { cobrado, gastado, inversion };
}

/** "Aportes de [etiqueta]": total histórico de aportes de capital (§9.3). */
export function calcularAportes(movs: Movimiento[]): number {
  return activos(movs).filter((m) => m.tipo === 'aporte').reduce((s, m) => s + m.importe, 0);
}

/**
 * "En fianzas" (§9.3). En esta ola aún no hay entidad Fianza: se aproxima con los movimientos
 * de fianza entregada menos devuelta. Se sustituirá por el estado de cada fianza al construir Fianzas.
 */
export function calcularEnFianzas(movs: Movimiento[]): number {
  const a = activos(movs);
  const entregadas = a.filter((m) => m.tipo === 'fianza_entregada').reduce((s, m) => s + m.importe, 0);
  const devueltas = a.filter((m) => m.tipo === 'fianza_devuelta').reduce((s, m) => s + m.importe, 0);
  return Math.max(0, entregadas - devueltas);
}

/**
 * Importe atípico (§10.2.3.6): más de 5 veces la media de esa categoría.
 * Sin historial en la categoría no se pregunta. 'excluirId' deja fuera el movimiento que se está editando.
 */
export function esImporteAtipico(importe: number, categoriaId: string, movs: Movimiento[], excluirId?: string): boolean {
  const previos = activos(movs).filter((m) => m.tipo === 'gasto' && m.categoria_id === categoriaId && m.id !== excluirId);
  if (previos.length === 0) return false;
  const total = previos.reduce((s, m) => s + m.importe, 0);
  // importe > 5 · (total / n)  ⇔  importe · n > 5 · total, sin divisiones ni decimales.
  return importe * previos.length > 5 * total;
}
