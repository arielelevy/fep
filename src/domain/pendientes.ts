import { claveDia, claveMes, nombreMes, sumarMeses } from '../lib/fechas';
import { activos } from './cifras';
import type { Cliente, Deuda, Movimiento } from './tipos';

// "Te deben" (§9.3, §9.4). Funciones puras: todo sale de clientes, deudas y cobros activos, de modo que
// borrar o deshacer un cobro devuelve el pendiente sin tocar nada más.

export type Nivel = 'neutro' | 'ambar' | 'rojo';

export interface Pendiente {
  clave: string; // 'abono:AAAA-MM' o 'deuda:<id>'
  cliente_id: string;
  concepto: string; // "Abono de septiembre", "Poda de setos"
  importe: number; // lo que se debía
  cobrado: number;
  pendiente: number; // importe − cobrado (> 0)
  desde: string; // día (AAAA-MM-DD) en que se debe
  periodo: string | null; // mes del abono
}

/** Días entre dos claves de día (AAAA-MM-DD). */
export function diasEntre(desde: string, hasta: string): number {
  const f = (c: string) => {
    const [a, m, d] = c.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((f(hasta) - f(desde)) / 86_400_000);
}

/** Antigüedad (§9.4): hasta 6 días neutro; de 7 a 14 ámbar; 15 o más rojo. */
export function nivelAntiguedad(dias: number): Nivel {
  if (dias >= 15) return 'rojo';
  if (dias >= 7) return 'ambar';
  return 'neutro';
}

/** "hoy", "hace 1 día", "hace 11 días" */
export function textoAntiguedad(dias: number): string {
  if (dias <= 0) return 'hoy';
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

const dos = (n: number) => String(n).padStart(2, '0');

/** Lo cobrado por cada clave de pendiente, a partir de los cobros activos. */
export function cobradoPorClave(movs: Movimiento[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const m of activos(movs)) {
    if (!m.saldos || !m.cliente_id) continue;
    for (const s of m.saldos) {
      const k = s.clave.startsWith('abono:') ? `${m.cliente_id}|${s.clave}` : s.clave;
      mapa.set(k, (mapa.get(k) ?? 0) + s.importe);
    }
  }
  return mapa;
}

/**
 * Cuotas de abono vencidas de un cliente (§9.4): el día `dia_cobro_abono` de cada mes, desde la primera
 * fecha de cobro posterior al alta del cliente hasta hoy.
 */
export function cuotasVencidas(c: Cliente, hoy: string): { periodo: string; vence: string }[] {
  if (c.modalidad !== 'abono' || !c.activo || c.eliminado_en || !c.cuota_abono || c.cuota_abono <= 0) return [];
  const dia = Math.min(Math.max(c.dia_cobro_abono ?? 1, 1), 28);
  const alta = claveDia(c.creado_en);
  const vence = (mes: string) => `${mes}-${dos(dia)}`;
  let mes = claveMes(c.creado_en);
  if (vence(mes) < alta) mes = sumarMeses(mes, 1);
  const salida: { periodo: string; vence: string }[] = [];
  while (vence(mes) <= hoy) {
    salida.push({ periodo: mes, vence: vence(mes) });
    mes = sumarMeses(mes, 1);
  }
  return salida;
}

const conceptoAbono = (periodo: string) => `Abono de ${nombreMes(periodo)}`;

/** Pendientes de todos los clientes (o de uno), del más antiguo al más reciente. */
export function calcularPendientes(
  clientes: Cliente[],
  deudas: Deuda[],
  movs: Movimiento[],
  ahora: Date = new Date(),
  clienteId?: string,
): Pendiente[] {
  const hoy = claveDia(ahora);
  const cobrado = cobradoPorClave(movs);
  const salida: Pendiente[] = [];
  for (const c of clientes) {
    if (clienteId && c.id !== clienteId) continue;
    for (const { periodo, vence } of cuotasVencidas(c, hoy)) {
      const clave = `abono:${periodo}`;
      const pagado = cobrado.get(`${c.id}|${clave}`) ?? 0;
      const pendiente = c.cuota_abono! - pagado;
      if (pendiente > 0)
        salida.push({ clave, cliente_id: c.id, concepto: conceptoAbono(periodo), importe: c.cuota_abono!, cobrado: pagado, pendiente, desde: vence, periodo });
    }
  }
  for (const d of deudas) {
    if (d.eliminado_en || (clienteId && d.cliente_id !== clienteId)) continue;
    const clave = `deuda:${d.id}`;
    const pagado = cobrado.get(clave) ?? 0;
    const pendiente = d.importe - pagado;
    if (pendiente > 0)
      salida.push({ clave, cliente_id: d.cliente_id, concepto: d.concepto, importe: d.importe, cobrado: pagado, pendiente, desde: claveDia(d.fecha), periodo: null });
  }
  return salida.sort((a, b) => a.desde.localeCompare(b.desde) || a.clave.localeCompare(b.clave));
}

/** "Te deben": suma de lo pendiente. */
export const totalPendiente = (p: Pendiente[]) => p.reduce((s, x) => s + x.pendiente, 0);

/**
 * Reparte un cobro entre los pendientes marcados, del más antiguo al más reciente (§9.4 cobro parcial).
 * Lo que sobra no se asigna.
 */
export function repartirCobro(importe: number, marcados: Pendiente[]): { clave: string; importe: number }[] {
  let resto = importe;
  const saldos: { clave: string; importe: number }[] = [];
  for (const p of [...marcados].sort((a, b) => a.desde.localeCompare(b.desde))) {
    if (resto <= 0) break;
    const parte = Math.min(resto, p.pendiente);
    saldos.push({ clave: p.clave, importe: parte });
    resto -= parte;
  }
  return saldos;
}
