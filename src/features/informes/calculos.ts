import { INGRESOS_NEGOCIO, activos, calcularGanado, margenCliente } from '../../domain/cifras';
import type { Categoria, Cliente, Movimiento } from '../../domain/tipos';
import { claveMes, desdeMadrid, sumarMeses } from '../../lib/fechas';

// Cálculos de Informes (§10.9) sobre céntimos enteros. Reutilizan las reglas de §9.1–9.3 de domain/cifras.ts:
// aquí sólo se agrupan por mes, categoría o cliente.

/** Los `n` meses que acaban en `mesFinal` (incluido), del más antiguo al más reciente. */
export function mesesHasta(mesFinal: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => sumarMeses(mesFinal, i - (n - 1)));
}

/** 1) Ganado por mes (§9.3): últimos 12 meses hasta `mesActual`. Puede haber meses negativos. */
export function ganadoPorMes(movs: Movimiento[], mesActual: string, n = 12): { mes: string; ganado: number }[] {
  return mesesHasta(mesActual, n).map((mes) => ({ mes, ganado: calcularGanado(movs, mes) }));
}

export interface GastoCategoria {
  categoriaId: string | null;
  nombre: string;
  grupo: string;
  importe: number;
  esInversion: boolean;
}

/** 2) Gasto por categoría del mes (todos los gastos, también los de equipo), de mayor a menor. */
export function gastoPorCategoria(movs: Movimiento[], categorias: Categoria[], mes: string): GastoCategoria[] {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const suma = new Map<string | null, number>();
  for (const m of activos(movs)) {
    if (m.tipo !== 'gasto' || claveMes(m.fecha) !== mes) continue;
    suma.set(m.categoria_id, (suma.get(m.categoria_id) ?? 0) + m.importe);
  }
  return [...suma.entries()]
    .map(([id, importe]) => {
      const c = id ? porId.get(id) : undefined;
      return { categoriaId: id, nombre: c?.nombre ?? 'Sin categoría', grupo: c?.grupo ?? '', importe, esInversion: c?.es_inversion ?? false };
    })
    .sort((a, b) => b.importe - a.importe || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Instante ISO del inicio (00:00 en Madrid) del mes "AAAA-MM": límite para comparar con `Movimiento.fecha`. */
export function inicioMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return desdeMadrid(a, m, 1, 0, 0).toISOString();
}

export interface MargenCliente {
  clienteId: string;
  nombre: string;
  cobrado: number;
  gastado: number;
  margen: number;
}

/**
 * 3) Margen por cliente (§9.5) en el año natural de `mesActual` (de enero al mes en curso, Madrid):
 * cobros del cliente − gastos imputados al cliente. Sólo clientes con algún movimiento; de mayor a menor.
 */
export function margenesPorCliente(movs: Movimiento[], clientes: Cliente[], mesActual: string): MargenCliente[] {
  const desde = inicioMes(`${mesActual.slice(0, 4)}-01`);
  const hasta = inicioMes(sumarMeses(mesActual, 1));
  const conMovimientos = new Set(activos(movs).map((m) => m.cliente_id).filter(Boolean));
  return clientes
    .filter((c) => !c.eliminado_en && conMovimientos.has(c.id))
    .map((c) => ({ clienteId: c.id, nombre: c.nombre, ...margenCliente(movs, c.id, desde, hasta) }))
    .filter((x) => x.cobrado !== 0 || x.gastado !== 0)
    .sort((a, b) => b.margen - a.margen || a.nombre.localeCompare(b.nombre, 'es'));
}

export const CLAVE_ALQUILER_FURGONETA = 'alquiler_furgoneta';

export interface TramoAlquiler {
  meses: 3 | 6 | 12;
  total: number;
  /** Media mensual del tramo, redondeada al céntimo. */
  media: number;
}

/** 4) Alquiler de furgoneta (§9.7): gasto de los últimos 3, 6 y 12 meses (incluido el actual) y su media mensual. */
export function alquilerFurgoneta(movs: Movimiento[], categorias: Categoria[], mesActual: string): TramoAlquiler[] {
  const ids = new Set(categorias.filter((c) => c.clave === CLAVE_ALQUILER_FURGONETA).map((c) => c.id));
  const porMes = new Map<string, number>();
  for (const m of activos(movs)) {
    if (m.tipo !== 'gasto' || !m.categoria_id || !ids.has(m.categoria_id)) continue;
    const k = claveMes(m.fecha);
    porMes.set(k, (porMes.get(k) ?? 0) + m.importe);
  }
  return ([3, 6, 12] as const).map((meses) => {
    const total = mesesHasta(mesActual, meses).reduce((s, k) => s + (porMes.get(k) ?? 0), 0);
    return { meses, total, media: Math.round(total / meses) };
  });
}

export interface Crecimiento {
  anio: string;
  /** Cobros + anticipos + otros ingresos del año hasta el mes actual (§9.8). */
  ingresosAnio: number;
  /** Ingresos del año / meses transcurridos (incluido el actual), redondeado al céntimo. */
  mediaMensual: number;
  clientesActivos: number;
  clientesAbono: number;
  /** Evolución mensual: ingresos de cada mes del año hasta el actual. */
  porMes: { mes: string; ingresos: number }[];
}

/** 5) Crecimiento (§9.8): sólo informativo. */
export function crecimiento(movs: Movimiento[], clientes: Cliente[], mesActual: string): Crecimiento {
  const anio = mesActual.slice(0, 4);
  const meses = mesesHasta(mesActual, Number(mesActual.slice(5, 7)));
  const porMesMap = new Map<string, number>();
  for (const m of activos(movs)) {
    if (!INGRESOS_NEGOCIO.includes(m.tipo)) continue;
    const k = claveMes(m.fecha);
    if (k.slice(0, 4) !== anio || k > mesActual) continue;
    porMesMap.set(k, (porMesMap.get(k) ?? 0) + m.importe);
  }
  const porMes = meses.map((mes) => ({ mes, ingresos: porMesMap.get(mes) ?? 0 }));
  const ingresosAnio = porMes.reduce((s, x) => s + x.ingresos, 0);
  const vivos = clientes.filter((c) => !c.eliminado_en && c.activo);
  return {
    anio,
    ingresosAnio,
    mediaMensual: Math.round(ingresosAnio / meses.length),
    clientesActivos: vivos.length,
    clientesAbono: vivos.filter((c) => c.modalidad === 'abono').length,
    porMes,
  };
}

/** Ancho de una barra en % respecto al mayor valor absoluto (mínimo visible 2 % si no es cero). */
export function anchoBarra(valor: number, maximo: number): number {
  if (valor === 0 || maximo <= 0) return 0;
  return Math.max(2, Math.round((Math.abs(valor) / maximo) * 100));
}
