// Ajustes de avisos y horarios (§10.10.5, §12.1). Se guardan en la tabla `ajustes` (clave `config_avisos`).
// La antelación del aviso de furgoneta (3 a 5 días) la guarda el encargo de proveedores (ola 8) y se edita con sus
// funciones `leerAvisoFurgo` / `guardarAvisoFurgo`; aquí no se duplica.

import { db } from '../../db/db';
import { guardarAjuste, leerAjuste, SinPermiso, type Deshacer } from '../../db/repo';
import type { ConfigAvisos as ConfigSilencio } from '../alertas/preparacion/planificador';

export const CLAVE_CONFIG_AVISOS = 'config_avisos';

export type MinutosAntes = 0 | 30 | 60 | 90;

export interface ConfigAvisos extends ConfigSilencio {
  /** Recordatorio antes de cada visita (0 = desactivado). */
  recordatorioVisita: MinutosAntes;
  /** Resumen semanal positivo del domingo dentro del resumen diario (§5.5.2, §12.2 RESUMEN_SEMANAL). */
  resumenSemanal: boolean;
}

/** Valores por defecto de §10.10.5: resumen a las 21:00, 60 min antes, silencio de 22:00 a 08:00, resumen semanal sí. */
export const CONFIG_POR_DEFECTO: ConfigAvisos = {
  horaResumen: '21:00',
  silencioDesde: '22:00',
  silencioHasta: '08:00',
  recordatorioVisita: 60,
  resumenSemanal: true,
};

export const OPCIONES_RECORDATORIO: { valor: MinutosAntes; texto: string }[] = [
  { valor: 0, texto: 'Desactivado' },
  { valor: 30, texto: '30 min' },
  { valor: 60, texto: '60 min' },
  { valor: 90, texto: '90 min' },
];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validarConfig(c: ConfigAvisos): string | null {
  if (!HORA.test(c.horaResumen) || !HORA.test(c.silencioDesde) || !HORA.test(c.silencioHasta)) return 'Hora no válida';
  if (c.silencioDesde === c.silencioHasta) return 'Las horas de silencio tienen que ser distintas';
  if (![0, 30, 60, 90].includes(c.recordatorioVisita)) return 'Recordatorio no válido';
  return null;
}

export async function leerConfigAvisos(): Promise<ConfigAvisos> {
  const guardada = await leerAjuste<Partial<ConfigAvisos> | null>(CLAVE_CONFIG_AVISOS, null);
  const c = { ...CONFIG_POR_DEFECTO, ...(guardada ?? {}) };
  return validarConfig(c) ? CONFIG_POR_DEFECTO : c;
}

/** Guarda cambios de los ajustes de avisos. Solo el titular (§3). Devuelve «Deshacer». */
export async function guardarConfigAvisos(cambios: Partial<ConfigAvisos>): Promise<{ config: ConfigAvisos; deshacer: Deshacer }> {
  const usuario = await leerAjuste<string>('usuario_actual', '');
  if ((await db.usuarios.get(usuario))?.rol !== 'titular') throw new SinPermiso();
  const antes = await leerAjuste<Partial<ConfigAvisos> | null>(CLAVE_CONFIG_AVISOS, null);
  const config = { ...(await leerConfigAvisos()), ...cambios };
  const error = validarConfig(config);
  if (error) throw new Error(error);
  await guardarAjuste(CLAVE_CONFIG_AVISOS, config);
  return { config, deshacer: () => guardarAjuste(CLAVE_CONFIG_AVISOS, antes ?? CONFIG_POR_DEFECTO) };
}
