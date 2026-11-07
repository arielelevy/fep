// Aritmética de horas locales de Madrid con claves "AAAA-MM-DDTHH" (sin pasar por UTC: la previsión ya viene
// en hora local, `timezone=Europe/Madrid`, §13.2).
import { claveDia, partesMadrid, sumarDias } from '../lib/fechas';

export const HORA_POR_DEFECTO = '09:00';

const dos = (n: number) => String(n).padStart(2, '0');

export const claveHora = (dia: string, hora: number) => `${dia}T${dos(hora)}`;

/** Suma horas a una clave "AAAA-MM-DDTHH". */
export function sumarHoras(clave: string, horas: number): string {
  const dia = clave.slice(0, 10);
  const total = Number(clave.slice(11, 13)) + horas;
  const dias = Math.floor(total / 24);
  return claveHora(sumarDias(dia, dias), ((total % 24) + 24) % 24);
}

/** Minutos desde medianoche de "HH:MM". */
export const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const hhmm = (min: number) => `${dos(Math.floor(min / 60) % 24)}:${dos(min % 60)}`;

/**
 * Horas que toca la franja [inicio, inicio + duración) de una visita: la hora en curso al empezar y las siguientes
 * hasta la que contiene el último minuto. 09:00 + 120 min → 09 y 10; 09:30 + 60 min → 09 y 10.
 */
export function horasDeFranja(fecha: string, horaInicio: string | null, duracion: number): string[] {
  const ini = minutos(horaInicio ?? HORA_POR_DEFECTO);
  const fin = ini + Math.max(1, duracion);
  const salida: string[] = [];
  for (let h = Math.floor(ini / 60); h * 60 < fin; h++) salida.push(sumarHoras(claveHora(fecha, 0), h));
  return salida;
}

/** Clave de la hora actual en Madrid. */
export function horaActual(ahora: Date): string {
  const p = partesMadrid(ahora);
  return claveHora(claveDia(ahora), p.hora);
}
