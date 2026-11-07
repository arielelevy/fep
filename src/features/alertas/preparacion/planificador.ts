// Qué avisos de preparación tocan ahora (§12.1, §12.2, §12.4). Ola 8, encargo B. Función pura.
//
// En la app final, los avisos push los envía el servidor con un proceso cada 5 minutos (§12.4): una PWA en iOS no
// puede programarlos. Ese proceso no existe todavía (no hay servidor ni cuentas: fuera de alcance sin autorización), así
// que aquí queda la regla que usará, probada sin enviar nada:
//   - Inmediatos: los que tienen canal «inmediata» y ya llegó su hora, no avisados antes con la misma clave, y fuera
//     de horas de silencio salvo el recordatorio de compra (lo programa Felipe, criterio 29) y la recogida y la
//     devolución de la furgoneta (salen a su hora: decisión de Ariel del 2026-11-07).
//   - Resumen diario: las líneas de lo que va en el resumen de las 21:00, una sola vez por clave (§12.1.4).
// Lo avisado se guarda con `marcarAvisados` (estado.ts) para no repetir.

import { partesMadrid } from '../../../lib/fechas';
import type { AlertaPreparacion } from './motor';

export interface ConfigAvisos {
  /** Hora del resumen diario (§10.10.5, por defecto 21:00). */
  horaResumen: string;
  /** Horas de silencio (§12.1.3, por defecto 22:00 a 08:00). */
  silencioDesde: string;
  silencioHasta: string;
}

export const CONFIG_AVISOS: ConfigAvisos = { horaResumen: '21:00', silencioDesde: '22:00', silencioHasta: '08:00' };

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** ¿Es hora de silencio en Madrid? El tramo puede cruzar la medianoche (22:00 a 08:00). */
export function enSilencio(ahora: Date, cfg: ConfigAvisos = CONFIG_AVISOS): boolean {
  const p = partesMadrid(ahora);
  const t = p.hora * 60 + p.minuto;
  const desde = minutos(cfg.silencioDesde);
  const hasta = minutos(cfg.silencioHasta);
  return desde <= hasta ? t >= desde && t < hasta : t >= desde || t < hasta;
}

export interface Aviso {
  /** Clave con la que se marca como avisado (`inmediata|…` o `resumen|…`). */
  clave: string;
  tipo: AlertaPreparacion['tipo'];
  texto: string;
  destino: AlertaPreparacion['destino'];
}

export const claveInmediata = (a: AlertaPreparacion) => `inmediata|${a.clave_dedupe}`;
export const claveResumen = (a: AlertaPreparacion) => `resumen|${a.clave_dedupe}`;

/** Avisos inmediatos que tocan ahora. */
export function avisosInmediatos(alertas: AlertaPreparacion[], avisados: Record<string, string>, ahora: Date, cfg: ConfigAvisos = CONFIG_AVISOS): Aviso[] {
  const silencio = enSilencio(ahora, cfg);
  return alertas
    .filter((a) => a.canales.includes('inmediata') && a.aviso_desde && Date.parse(a.aviso_desde) <= ahora.getTime())
    .filter((a) => !avisados[claveInmediata(a)])
    .filter((a) => a.ignora_silencio || !silencio)
    .map((a) => ({ clave: claveInmediata(a), tipo: a.tipo, texto: a.texto, destino: a.destino }));
}

/** Líneas de preparación para el resumen diario: primero lo que pide decisión, después lo informativo. */
export function lineasResumen(alertas: AlertaPreparacion[], avisados: Record<string, string>): Aviso[] {
  const peso = { urgente: 0, decision: 1, info: 2 } as const;
  return alertas
    .filter((a) => a.canales.includes('resumen_diario') && !avisados[claveResumen(a)])
    .sort((a, b) => peso[a.nivel] - peso[b.nivel] || a.fecha.localeCompare(b.fecha))
    .map((a) => ({ clave: claveResumen(a), tipo: a.tipo, texto: a.texto, destino: a.destino }));
}
