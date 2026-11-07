import { useEffect } from 'react';
import { ejecutarPlanificador } from './envio';

/** Cada cuánto se ejecuta el planificador con la app abierta (§12.4: «cada 5 minutos» en el servidor). */
export const INTERVALO_PLANIFICADOR_MS = 5 * 60_000;

/**
 * Modo simulado (§12.4): mientras no haya servidor, el planificador corre en el móvil al abrir la app y cada 5 minutos.
 * Los fallos (p. ej. base cerrada al salir) no rompen nada: se reintenta en la siguiente vuelta.
 */
export function useAvisosSimulados(activo = true): void {
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const vuelta = () => {
      if (!vivo) return;
      ejecutarPlanificador().catch((e: unknown) => {
        const esperado = e instanceof Error && (e.name === 'DatabaseClosedError' || e.message === 'Base local sin preparar');
        if (!esperado) console.error('No se pudo revisar los avisos', e);
      });
    };
    vuelta();
    const t = setInterval(vuelta, INTERVALO_PLANIFICADOR_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [activo]);
}
