// FIXTURES DE PRUEBA. Previsiones fijas para probar el motor de alertas. Nunca se importan desde la app:
// la app instalada muestra «Sin previsión» mientras no haya proveedor real (decisión de Ariel).

import type { HoraClima, Prevision, Ubicacion } from '../../../clima';
import { sumarDias } from '../../../lib/fechas';

export const CALMA: Omit<HoraClima, 'hora'> = { prob_precipitacion: 0, precipitacion: 0, codigo_wmo: 0, temperatura: 18, viento: 5, rachas: 8 };

/**
 * Previsión horaria fija desde `desde` (incluido el día anterior, que el césped mira 12 h atrás) durante `dias`.
 * `cambios(hora)` sobrescribe valores de horas concretas ("AAAA-MM-DDTHH").
 */
export function previsionFija(
  ubicacion: Ubicacion,
  desde: string,
  cambios: (hora: string) => Partial<Omit<HoraClima, 'hora'>> | null | undefined = () => null,
  dias = 16,
  actualizado_en = '2026-11-07T09:00:00.000Z',
): Prevision {
  const horas: HoraClima[] = [];
  for (let i = -1; i < dias; i++) {
    const d = sumarDias(desde, i);
    for (let h = 0; h < 24; h++) {
      const hora = `${d}T${String(h).padStart(2, '0')}`;
      horas.push({ hora, ...CALMA, ...(cambios(hora) ?? {}) });
    }
  }
  const diasR = Array.from({ length: dias }, (_, i) => {
    const d = sumarDias(desde, i);
    const delDia = horas.filter((h) => h.hora.startsWith(d));
    return {
      fecha: d,
      max: Math.max(...delDia.map((h) => h.temperatura)),
      min: Math.min(...delDia.map((h) => h.temperatura)),
      prob_precipitacion: Math.max(...delDia.map((h) => h.prob_precipitacion)),
      precipitacion: delDia.reduce((s, h) => s + h.precipitacion, 0),
      codigo_wmo: Math.max(...delDia.map((h) => h.codigo_wmo)),
    };
  });
  return { ubicacion, horas, dias: diasR, actualizado_en, fuente: 'fixture' };
}

/** Lluvia de 07:00 a 14:00 de un día: 80 % y 3 mm/h (criterio 14). */
export const lluviaManana = (fecha: string, prob = 80, mm = 3) => (hora: string) =>
  hora.startsWith(fecha) && Number(hora.slice(11, 13)) >= 7 && Number(hora.slice(11, 13)) <= 14 ? { prob_precipitacion: prob, precipitacion: mm, codigo_wmo: 63 } : null;

/** Varios escenarios a la vez: el primero que diga algo gana. */
export const combinar =
  (...fs: ((hora: string) => Partial<Omit<HoraClima, 'hora'>> | null | undefined)[]) =>
  (hora: string) =>
    fs.reduce<Partial<Omit<HoraClima, 'hora'>> | null | undefined>((acc, f) => acc ?? f(hora), null);
