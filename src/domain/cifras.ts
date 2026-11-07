import { claveMes } from '../lib/fechas';
import type { MedioPago, Movimiento, TipoMovimiento } from './tipos';

// Reglas de §9.1 y cifras de §9.3. Funciones puras sobre céntimos enteros.

const ENTRADAS: TipoMovimiento[] = ['cobro', 'anticipo', 'otro_ingreso', 'aporte', 'prestamo', 'fianza_devuelta', 'saldo_inicial'];
const SALIDAS: TipoMovimiento[] = ['gasto', 'devolucion_prestamo', 'fianza_entregada'];
export const INGRESOS_NEGOCIO: TipoMovimiento[] = ['cobro', 'anticipo', 'otro_ingreso'];

export const activos = (movs: Movimiento[]) => movs.filter((m) => !m.eliminado_en);

/** Efecto en "En caja" de un movimiento (positivo entra, negativo sale). */
export function efectoEnCaja(m: Pick<Movimiento, 'tipo' | 'importe'> & { fianza_id?: string | null }): number {
  // El descuento de una fianza (§9.1) ya salió de caja al entregarla: sólo resta en Ganado.
  if (m.tipo === 'gasto' && m.fianza_id) return 0;
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

/** Estado de una fianza (§8.8, §9.6). La fianza es su movimiento de entrega; el estado sale de los movimientos. */
export interface EstadoFianza {
  entrega: Movimiento;
  devuelto: number;
  descontado: number;
  estado: 'pendiente' | 'devuelta' | 'devuelta_parcial';
}

export function fianzas(movs: Movimiento[]): EstadoFianza[] {
  const a = activos(movs);
  return a
    .filter((m) => m.tipo === 'fianza_entregada')
    .map((entrega) => {
      const devuelto = a.filter((m) => m.tipo === 'fianza_devuelta' && m.fianza_id === entrega.id).reduce((s, m) => s + m.importe, 0);
      const descontado = a.filter((m) => m.tipo === 'gasto' && m.fianza_id === entrega.id).reduce((s, m) => s + m.importe, 0);
      const resuelto = devuelto + descontado >= entrega.importe;
      return { entrega, devuelto, descontado, estado: !resuelto ? 'pendiente' : descontado > 0 ? 'devuelta_parcial' : 'devuelta' };
    });
}

/** "En fianzas" (§9.3): lo entregado que aún no se ha resuelto (ni devuelto ni descontado). */
export function calcularEnFianzas(movs: Movimiento[]): number {
  return fianzas(movs).reduce((s, f) => s + Math.max(0, f.entrega.importe - f.devuelto - f.descontado), 0);
}

/** Préstamos de Pablo (§8.9): cada movimiento de préstamo es un préstamo; lo devuelto sale de sus devoluciones. */
export function prestamos(movs: Movimiento[]): { prestamo: Movimiento; devuelto: number; pendiente: number }[] {
  const a = activos(movs);
  return a
    .filter((m) => m.tipo === 'prestamo')
    .sort((x, y) => x.fecha.localeCompare(y.fecha))
    .map((prestamo) => {
      const devuelto = a.filter((m) => m.tipo === 'devolucion_prestamo' && m.prestamo_id === prestamo.id).reduce((s, m) => s + m.importe, 0);
      return { prestamo, devuelto, pendiente: Math.max(0, prestamo.importe - devuelto) };
    });
}

/** "Préstamo pendiente" / "Le debes a papá" (§9.1, §9.3). */
export function calcularPrestamoPendiente(movs: Movimiento[]): number {
  return prestamos(movs).reduce((s, p) => s + p.pendiente, 0);
}

/** Margen por cliente (§9.5): cobros del cliente − gastos imputados al cliente, en un periodo. */
export function margenCliente(movs: Movimiento[], clienteId: string, desde: string, hasta: string): { cobrado: number; gastado: number; margen: number } {
  let cobrado = 0;
  let gastado = 0;
  for (const m of activos(movs)) {
    if (m.cliente_id !== clienteId || m.fecha < desde || m.fecha >= hasta) continue;
    if (INGRESOS_NEGOCIO.includes(m.tipo)) cobrado += m.importe;
    else if (m.tipo === 'gasto') gastado += m.importe;
  }
  return { cobrado, gastado, margen: cobrado - gastado };
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
