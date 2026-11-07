import { activos } from './cifras';
import type { Categoria, Movimiento } from './tipos';

export const DIAS_FRECUENCIA = 60;
export const VISIBLES_EN_CUADRICULA = 8;

/** Usos por categoría en los últimos 60 días (§5.1.5). */
export function usosUltimos60Dias(movs: Movimiento[], ahora: Date = new Date()): Map<string, number> {
  const desde = ahora.getTime() - DIAS_FRECUENCIA * 24 * 60 * 60 * 1000;
  const usos = new Map<string, number>();
  for (const m of activos(movs)) {
    if (m.tipo !== 'gasto' || !m.categoria_id) continue;
    const t = new Date(m.fecha).getTime();
    if (t < desde || t > ahora.getTime()) continue;
    usos.set(m.categoria_id, (usos.get(m.categoria_id) ?? 0) + 1);
  }
  return usos;
}

/**
 * Orden de la cuadrícula de gastos: visibles, por usos de los últimos 60 días (desc),
 * desempate por el orden inicial (§9.2). Devuelve las 8 de la cuadrícula y el resto para "Más".
 */
export function ordenarCategoriasGasto(
  categorias: Categoria[],
  movs: Movimiento[],
  ahora: Date = new Date(),
): { cuadricula: Categoria[]; resto: Categoria[] } {
  const usos = usosUltimos60Dias(movs, ahora);
  const ordenadas = categorias
    .filter((c) => c.tipo === 'gasto' && c.visible && !c.eliminado_en)
    .sort((a, b) => (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0) || a.orden_manual - b.orden_manual);
  return { cuadricula: ordenadas.slice(0, VISIBLES_EN_CUADRICULA), resto: ordenadas.slice(VISIBLES_EN_CUADRICULA) };
}
