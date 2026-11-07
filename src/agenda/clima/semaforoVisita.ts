// Ayudas puras de la interfaz del clima (ola 6, frente B). Las reglas del semáforo son del frente A
// (src/clima): aquí sólo se adaptan datos de la app y se arman textos para pantalla.
// Spec: §10.5 (Agenda), §10.6 (Detalle de visita), §11 (Clima y semáforo), §14.6 («Actualizado hace …»), §17.

import { NOMBRE_ICONO, type DiaPrevision, type Prevision, type Semaforo, type Ubicacion } from '../../clima';
import { hhmm, horasDeFranja, minutos } from '../../clima/horas';
import { horaDe } from '../../domain/agenda';
import type { Cliente, Visita } from '../../domain/tipos';
import { claveDia, partesMadrid, sumarDias } from '../../lib/fechas';

/** Texto del «i» y de los días 8 a 14 (§10.5.2). */
export const TEXTO_ORIENTATIVO = 'Más allá de una semana la previsión es poco fiable. Úsala para planificar, no para decidir.';

/** Coordenadas del cliente, o null si no las tiene (el semáforo dirá «Falta la dirección del cliente»). */
export function ubicacionDe(cliente: Pick<Cliente, 'lat' | 'lon'> | undefined | null): Ubicacion | null {
  if (!cliente || cliente.lat === null || cliente.lon === null) return null;
  if (!Number.isFinite(cliente.lat) || !Number.isFinite(cliente.lon)) return null;
  return { lat: cliente.lat, lon: cliente.lon };
}

/** Desplazamiento entre visitas (§10.7: duración más 30 minutos). */
export const MINUTOS_DESPLAZAMIENTO = 30;

/**
 * ¿Está libre el hueco [inicio, fin) del día de `visita`? Cuenta las otras visitas programadas de ese día con su
 * duración más 30 minutos de desplazamiento (§10.7). El motor lo usa para el consejo «Empieza a las …».
 */
export function huecoLibrePara(visita: Pick<Visita, 'id' | 'fecha'>, visitas: Visita[]): (inicio: string, fin: string) => boolean {
  const otras = visitas.filter((v) => v.id !== visita.id && v.fecha === visita.fecha && v.estado === 'programada' && !v.eliminado_en);
  return (inicio, fin) => {
    const a = minutos(inicio);
    const b = minutos(fin);
    return otras.every((o) => {
      const oa = minutos(horaDe(o)) - MINUTOS_DESPLAZAMIENTO;
      const ob = minutos(horaDe(o)) + o.duracion + MINUTOS_DESPLAZAMIENTO;
      return b <= oa || a >= ob;
    });
  };
}

/**
 * Texto de la línea de semáforo: siempre con el estado en palabras (§5.6.3, nunca sólo color).
 * «Se puede ir · Sol, 22°» tal cual; «Lluvia a partir de las 13:00» → «Con cuidado · Lluvia a partir de las 13:00»;
 * gris → «Sin previsión · Falta la dirección del cliente»; orientativo → «Previsión orientativa».
 */
export function textoLinea(s: Semaforo): { estado: string; detalle: string | null } {
  if (s.orientativo) return { estado: s.estado, detalle: null };
  if (s.nivel === 'gris') return { estado: s.estado, detalle: s.motivo ?? (s.etiqueta !== s.estado ? s.etiqueta : null) };
  const resto = s.etiqueta.startsWith(s.estado) ? s.etiqueta.slice(s.estado.length).replace(/^\s*·\s*/, '') : s.etiqueta;
  return { estado: s.estado, detalle: resto || null };
}

/** Texto plano completo para lectores de pantalla y pruebas: «Con cuidado · Lluvia a partir de las 13:00». */
export function textoLineaPlano(s: Semaforo): string {
  const t = textoLinea(s);
  return t.detalle ? `${t.estado} · ${t.detalle}` : t.estado;
}

/** «Actualizado hoy a las 10:15», «Actualizado ayer a las 21:00», «Actualizado el 5/11 a las 09:00». */
export function textoHoraActualizacion(iso: string | undefined | null, ahora: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const p = partesMadrid(t);
  const hora = hhmm(p.hora * 60 + p.minuto);
  const dia = claveDia(t);
  const hoy = claveDia(ahora);
  if (dia === hoy) return `Actualizado hoy a las ${hora}`;
  if (dia === sumarDias(hoy, -1)) return `Actualizado ayer a las ${hora}`;
  return `Actualizado el ${p.dia}/${p.mes} a las ${hora}`;
}

export interface DatosFranjaVisita {
  tempMin: number;
  tempMax: number;
  probLluvia: number; // % máxima
  lluvia: number; // mm acumulados
  viento: number; // km/h medio máximo
  rachas: number; // km/h máximas
}

/**
 * Temperatura, lluvia y viento en la franja horaria de la visita (§10.6.3), o null si la previsión no la cubre.
 * Usa las mismas horas que el motor (`horasDeFranja`), para que los datos cuadren con el color del semáforo.
 */
export function datosFranja(p: Prevision | null, visita: Pick<Visita, 'fecha' | 'hora_inicio' | 'duracion'>): DatosFranjaVisita | null {
  if (!p) return null;
  const claves = new Set(horasDeFranja(visita.fecha, visita.hora_inicio, visita.duracion));
  const horas = p.horas.filter((h) => claves.has(h.hora));
  if (!horas.length) return null;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    tempMin: Math.round(Math.min(...horas.map((h) => h.temperatura))),
    tempMax: Math.round(Math.max(...horas.map((h) => h.temperatura))),
    probLluvia: Math.round(Math.max(...horas.map((h) => h.prob_precipitacion))),
    lluvia: r1(horas.reduce((s, h) => s + h.precipitacion, 0)),
    viento: Math.round(Math.max(...horas.map((h) => h.viento))),
    rachas: Math.round(Math.max(...horas.map((h) => h.rachas))),
  };
}

/** Nombre del icono del tiempo para lectores de pantalla (el mismo del motor, src/clima/wmo.ts). */
export { NOMBRE_ICONO };

/** «Sol, máxima 22°, lluvia 10 %» para la etiqueta accesible del día de la franja. */
export function textoAccesibleDia(d: DiaPrevision | undefined): string {
  if (!d || d.icono === null) return 'sin previsión';
  const partes = [NOMBRE_ICONO[d.icono]];
  if (d.max !== null) partes.push(`máxima ${Math.round(d.max)}°`);
  if (d.probLluvia !== null) partes.push(`lluvia ${Math.round(d.probLluvia)} %`);
  return partes.join(', ');
}
