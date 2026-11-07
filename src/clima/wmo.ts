// Códigos de tiempo WMO (los que usa Open-Meteo) → texto corto e icono de la franja de días (§10.5.2).

export type IconoTiempo = 'sol' | 'sol_nubes' | 'nubes' | 'niebla' | 'lluvia' | 'nieve' | 'tormenta';

/** Tormenta (§11.3): WMO 95, 96 y 99. */
export const CODIGOS_TORMENTA = [95, 96, 99];
export const esTormenta = (codigo: number) => CODIGOS_TORMENTA.includes(codigo);

export function iconoWmo(codigo: number): IconoTiempo {
  if (codigo === 0) return 'sol';
  if (codigo === 1 || codigo === 2) return 'sol_nubes';
  if (codigo === 3) return 'nubes';
  if (codigo === 45 || codigo === 48) return 'niebla';
  if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return 'nieve';
  if (codigo >= 95) return 'tormenta';
  if (codigo >= 51) return 'lluvia';
  return 'nubes';
}

/** Nombre de cada icono (etiqueta verde del semáforo y texto accesible de la franja). */
export const NOMBRE_ICONO: Record<IconoTiempo, string> = {
  sol: 'Sol',
  sol_nubes: 'Sol y nubes',
  nubes: 'Nublado',
  niebla: 'Niebla',
  lluvia: 'Lluvia',
  nieve: 'Nieve',
  tormenta: 'Tormenta',
};

/** "Sol", "Sol y nubes", "Nublado"… */
export const textoWmo = (codigo: number) => NOMBRE_ICONO[iconoWmo(codigo)];
