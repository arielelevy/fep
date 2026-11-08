import { useEffect } from 'react';
import { db } from '../db/db';
import { useLive } from '../lib/hooks';
import { hayServidor, INTERVALO_SYNC_MS, sincronizar } from './sincronizacion';

/** §14.3: sincroniza al abrir la app, al recuperar la conexión y cada 60 segundos con la app abierta. */
export function useSincronizacion(): void {
  useEffect(() => {
    let vivo = true;
    const vuelta = () => {
      if (!vivo) return;
      sincronizar().catch((e: unknown) => {
        const esperado = e instanceof Error && (e.name === 'DatabaseClosedError' || e.message === 'Base local sin preparar');
        if (!esperado) console.error('No se pudo sincronizar', e);
      });
    };
    vuelta();
    window.addEventListener('online', vuelta);
    const t = setInterval(vuelta, INTERVALO_SYNC_MS);
    return () => {
      vivo = false;
      window.removeEventListener('online', vuelta);
      clearInterval(t);
    };
  }, []);
}

/** Fotos de tickets aún sin subir (§14.5: indicador en el movimiento hasta que se sube). Sin servidor enchufado no hay
 *  adónde subirlas: «Ticket sin subir» quedaría fijo en todas las fotos, así que no se marca ninguna. */
export function useFotosSinSubir(): Set<string> {
  const ids = useLive(async () => (hayServidor() ? (await db.fotos.filter((f) => !f.subida).toArray()).map((f) => f.id) : []));
  return new Set(ids ?? []);
}
