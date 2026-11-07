// Claves de deduplicación (§8.13 `clave_dedupe`, §12.1.4 «una alerta por entidad y nivel»).
//
// - clave_asunto: familia + visita + día afectado. Identifica «el asunto»: nunca hay dos alertas vivas con la misma.
//     clima:<visita>:<AAAA-MM-DD>   aemet:<visita>:<AAAA-MM-DD>   mejora:<visita>:<AAAA-MM-DD>
// - clave_dedupe: asunto + tipo + nivel. Estable mientras no cambie el nivel; si cambia, la misma alerta se
//   actualiza con la clave nueva (y sólo se vuelve a notificar si empeora o sube de escalón).
//     clima:<visita>:<día>:CLIMA_DECIDIR:rojo    aemet:<visita>:<día>:CLIMA_AEMET:viento-amarillo
// Si la visita se mueve a otro día, el asunto cambia: la alerta vieja se resuelve y el día nuevo se evalúa aparte.

import type { TipoAlertaClima } from './tipos';

export type FamiliaAsunto = 'clima' | 'aemet' | 'mejora';

export const claveAsunto = (familia: FamiliaAsunto, visitaId: string, fecha: string) => `${familia}:${visitaId}:${fecha}`;

export const claveDedupe = (asunto: string, tipo: TipoAlertaClima, nivel: string) => `${asunto}:${tipo}:${nivel}`;

/** Partes de una clave de asunto (para depurar y para la interfaz). */
export function leerClaveAsunto(clave: string): { familia: FamiliaAsunto; visitaId: string; fecha: string } | null {
  const m = /^(clima|aemet|mejora):(.+):(\d{4}-\d{2}-\d{2})$/.exec(clave);
  return m ? { familia: m[1] as FamiliaAsunto, visitaId: m[2], fecha: m[3] } : null;
}
