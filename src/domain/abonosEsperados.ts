import { claveDia } from '../lib/fechas';
import { cobradoPorClave, cuotasVencidas } from './pendientes';
import type { Cliente, Movimiento, Visita } from './tipos';

// Cobros esperados de abono (§9.4): el día `dia_cobro_abono` de cada mes (Madrid) se genera un cobro esperado
// por la cuota de ese mes. Queda pendiente hasta que un cobro activo lo salda con la clave 'abono:AAAA-MM'
// (periodo_abono de ese mes). Funciones puras: el esperado no se guarda, sale de cliente + cobros, así que
// deshacer o borrar el cobro lo devuelve solo. "Te deben" ya lo suma vía calcularPendientes (pendientes.ts).

export interface CobroEsperado {
  cliente_id: string;
  periodo: string; // AAAA-MM
  vence: string; // AAAA-MM-DD: día de cobro de ese mes
  cuota: number; // céntimos
  cobrado: number;
  pendiente: number; // cuota − cobrado (> 0)
}

/** Cuotas vencidas y no cobradas del todo de un cliente, de la más antigua a la más reciente. */
export function cobrosEsperadosCliente(cliente: Cliente, movimientos: Movimiento[], ahora: Date = new Date()): CobroEsperado[] {
  const hoy = claveDia(ahora);
  const cobrado = cobradoPorClave(movimientos);
  const salida: CobroEsperado[] = [];
  for (const { periodo, vence, cuota } of cuotasVencidas(cliente, hoy)) {
    const pagado = cobrado.get(`${cliente.id}|abono:${periodo}`) ?? 0;
    const pendiente = cuota - pagado; // cuota vigente en ese mes (QA ola 4, hallazgo 2)
    if (pendiente > 0) salida.push({ cliente_id: cliente.id, periodo, vence, cuota, cobrado: pagado, pendiente });
  }
  return salida;
}

/** Todos los cobros esperados pendientes (clientes de abono activos), del más antiguo al más reciente. */
export function cobrosEsperadosAbono(clientes: Cliente[], movimientos: Movimiento[], ahora: Date = new Date()): CobroEsperado[] {
  return clientes
    .flatMap((c) => cobrosEsperadosCliente(c, movimientos, ahora))
    .sort((a, b) => a.vence.localeCompare(b.vence) || a.cliente_id.localeCompare(b.cliente_id));
}

/** El cobro esperado del mes en curso, si ya llegó su día y no está cobrado del todo. */
export function cobroEsperadoDelMes(cliente: Cliente, movimientos: Movimiento[], ahora: Date = new Date()): CobroEsperado | null {
  const mes = claveDia(ahora).slice(0, 7);
  return cobrosEsperadosCliente(cliente, movimientos, ahora).find((e) => e.periodo === mes) ?? null;
}

/** La cuota vencida más antigua sin cobrar: la que pregunta «¿Te pagó el abono de [mes]?». */
export function cuotaAPreguntar(cliente: Cliente, movimientos: Movimiento[], ahora: Date = new Date()): CobroEsperado | null {
  return cobrosEsperadosCliente(cliente, movimientos, ahora)[0] ?? null;
}

export const totalAbonosEsperados = (lista: CobroEsperado[]) => lista.reduce((s, e) => s + e.pendiente, 0);

/**
 * §9.4: las visitas de abono no preguntan por el cobro, salvo la primera visita tras el vencimiento.
 * Se pregunta si hay cuota vencida sin cobrar y ninguna otra visita del cliente se hizo desde ese vencimiento.
 */
export function debePreguntarAbono(
  cliente: Cliente,
  movimientos: Movimiento[],
  visitasCliente: Visita[],
  visitaId: string,
  ahora: Date = new Date(),
): CobroEsperado | null {
  const cuota = cuotaAPreguntar(cliente, movimientos, ahora);
  if (!cuota) return null;
  const otraTrasVencer = visitasCliente.some(
    (v) => v.id !== visitaId && !v.eliminado_en && v.estado === 'hecha' && v.hecha_en !== null && claveDia(v.hecha_en) >= cuota.vence,
  );
  return otraTrasVencer ? null : cuota;
}
