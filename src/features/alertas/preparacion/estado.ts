// Estado guardado de las alertas de preparación (ola 8, encargo B): lo ya avisado (para no repetir, §12.1.4) y lo
// pospuesto («Aún no», «Posponer»). Va en la tabla `ajustes` existente, clave `alertas_preparacion`, sin cambiar el
// esquema. Las alertas en sí no se guardan: se recalculan siempre desde los datos (motor.ts).

import { db } from '../../../db/db';
import { guardarAjuste, leerAjuste, type Deshacer } from '../../../db/repo';
import { titular } from '../../ajustes/plantillas/datos';

export const CLAVE_ESTADO = 'alertas_preparacion';

export interface EstadoAlertasPreparacion {
  /** clave de aviso → instante ISO en que se avisó. */
  avisados: Record<string, string>;
  /** asunto → instante ISO hasta el que no se muestra. */
  pospuestas: Record<string, string>;
}

export const estadoVacio = (): EstadoAlertasPreparacion => ({ avisados: {}, pospuestas: {} });

export async function leerEstado(): Promise<EstadoAlertasPreparacion> {
  return { ...estadoVacio(), ...(await leerAjuste<Partial<EstadoAlertasPreparacion>>(CLAVE_ESTADO, {})) };
}

async function cambiar(f: (e: EstadoAlertasPreparacion) => void): Promise<Deshacer> {
  let antes = estadoVacio();
  await db.transaction('rw', db.ajustes, async () => {
    antes = await leerEstado();
    const nuevo = structuredClone(antes);
    f(nuevo);
    await guardarAjuste(CLAVE_ESTADO, nuevo);
  });
  const copia = structuredClone(antes);
  return () => guardarAjuste(CLAVE_ESTADO, copia);
}

/** Marca avisos como enviados (resumen diario o aviso inmediato). */
export async function marcarAvisados(claves: string[], ahora: Date = new Date()): Promise<void> {
  if (!claves.length) return;
  await cambiar((e) => {
    for (const c of claves) e.avisados[c] = ahora.toISOString();
  });
}

/** No mostrar un asunto hasta `hasta`. Solo el titular (§3). */
export async function posponer(asunto: string, hasta: Date): Promise<{ deshacer: Deshacer }> {
  await titular();
  const deshacer = await cambiar((e) => {
    e.pospuestas[asunto] = hasta.toISOString();
  });
  return { deshacer };
}
