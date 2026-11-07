// Propuesta de días y horas para mover una visita en alerta (§10.7 «¿A qué día?» / «¿A qué hora?»).
// - Días: a partir del día siguiente a la visita y dentro de la franja de 14 días, los 3 mejores que tengan un hueco
//   libre a una hora razonable: primero verde; si no hay, «Sin previsión» (la app real aún no tiene previsión,
//   decisión de Ariel: no se inventa el tiempo); después ámbar. Nunca rojo. Dentro de los días preferidos del
//   cliente si los tiene (si no alcanzan, se completan con otros y se marcan).
// - Horas: huecos libres de ese día; la hora original primero si está libre.
// - Hueco libre = no se solapa con otra visita contando su duración más 30 min de desplazamiento.

import { evaluarVisita, type Semaforo } from '../../clima';
import { horaDe } from '../../domain/agenda';
import type { Cliente, Visita } from '../../domain/tipos';
import { claveDia, diaSemanaDeClave, sumarDias } from '../../lib/fechas';
import { TEXTO_SEMAFORO, UMBRALES_ALERTAS } from './catalogo';
import { datoClave, diaConNumero, probLluvia } from './textos';
import type { ClimaCliente, OpcionDia, OpcionHora, PropuestaMover } from './tipos';

export const NOTA_HORAS = 'Solo se ofrecen huecos libres en tu agenda.';

const aMin = (h: string) => {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
};
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** ¿Está libre [inicio, inicio + duración) ese día? Cuenta las otras visitas programadas con 30 min de margen. */
export function esHuecoLibre(fecha: string, inicio: string, duracion: number, visitas: Visita[], excluirId?: string): boolean {
  const a = aMin(inicio);
  const b = a + duracion;
  const m = UMBRALES_ALERTAS.desplazamientoMinutos;
  return visitas
    .filter((o) => o.id !== excluirId && o.fecha === fecha && o.estado === 'programada' && !o.eliminado_en)
    .every((o) => {
      const oa = aMin(horaDe(o)) - m;
      const ob = aMin(horaDe(o)) + o.duracion + m;
      return b <= oa || a >= ob;
    });
}

export interface EntradaPropuesta {
  visita: Visita;
  visitas: Visita[];
  cliente: Pick<Cliente, 'dias_preferidos'> | undefined;
  /** Clima del cliente. Sin él (o sin previsión), todo sale «Sin previsión» y se proponen igual huecos libres. */
  clima?: ClimaCliente;
  ahora: Date;
}

interface Evaluacion {
  semaforo: Semaforo;
  categoria: number; // 0 verde, 1 sin previsión / orientativa, 2 ámbar, 3 rojo (excluido)
  tiempo: string;
}

function evaluar(e: EntradaPropuesta, fecha: string, hora: string): Evaluacion {
  const s = evaluarVisita({
    visita: { fecha, hora_inicio: hora, duracion: e.visita.duracion, tipos_trabajo: e.visita.tipos_trabajo },
    ubicacion: e.clima?.ubicacion ?? null,
    prevision: e.clima?.prevision ?? null,
    avisos: e.clima?.avisos ?? [],
    motivoSinPrevision: e.clima?.motivo,
    ahora: e.ahora,
  });
  if (s.orientativo) return { semaforo: s, categoria: 1, tiempo: 'Previsión orientativa' };
  if (s.nivel === 'gris') return { semaforo: s, categoria: 1, tiempo: TEXTO_SEMAFORO.gris };
  if (s.nivel === 'verde') {
    const detalle = s.etiqueta.startsWith(s.estado) ? s.etiqueta.slice(s.estado.length).replace(/^\s*·\s*/, '') : s.etiqueta;
    return { semaforo: s, categoria: 0, tiempo: detalle.split(',')[0] || TEXTO_SEMAFORO.verde };
  }
  const p = probLluvia(s);
  return { semaforo: s, categoria: s.nivel === 'ambar' ? 2 : 3, tiempo: p !== null ? `${Math.round(p)}% lluvia` : (datoClave(s) ?? s.estado) };
}

/** Horas razonables de un día (cada 30 min de 08:00 a 18:00, acabando a las 20:00 como tarde). */
function horasDelDia(duracion: number): string[] {
  const r: string[] = [];
  const fin = aMin(UMBRALES_ALERTAS.horaFinMaxima);
  for (let m = aMin(UMBRALES_ALERTAS.horaPrimera); m <= aMin(UMBRALES_ALERTAS.horaUltimaInicio); m += UMBRALES_ALERTAS.pasoMinutos) {
    if (m + duracion <= fin) r.push(aHora(m));
  }
  return r;
}

interface HoraEvaluada extends OpcionHora {
  categoria: number;
}

function horasEvaluadas(e: EntradaPropuesta, fecha: string): HoraEvaluada[] {
  const original = horaDe(e.visita);
  const candidatas = horasDelDia(e.visita.duracion);
  if (!candidatas.includes(original)) candidatas.unshift(original);
  return candidatas
    .filter((h) => esHuecoLibre(fecha, h, e.visita.duracion, e.visitas, e.visita.id))
    .map((h) => {
      const ev = evaluar(e, fecha, h);
      return { hora: h, original: h === original, tiempo: ev.tiempo, semaforo: ev.semaforo.nivel, categoria: ev.categoria };
    })
    .filter((h) => h.categoria < 3);
}

/** Horas libres de un día para el radio «¿A qué hora?»: la original primero si está libre, después las mejores. */
export function horasLibres(e: EntradaPropuesta, fecha: string, maximo: number = UMBRALES_ALERTAS.opcionesHora): OpcionHora[] {
  const hs = horasEvaluadas(e, fecha);
  const original = hs.find((h) => h.original);
  const resto = hs.filter((h) => !h.original).sort((a, b) => a.categoria - b.categoria || a.hora.localeCompare(b.hora));
  return [...(original ? [original] : []), ...resto].slice(0, maximo).map(({ categoria: _c, ...h }) => h);
}

/** Propuesta completa para mover una visita: 3 días (el primero «Sugerido») y las horas libres del primero. */
export function proponerMover(e: EntradaPropuesta): PropuestaMover {
  const hoy = claveDia(e.ahora);
  const ultimo = sumarDias(hoy, UMBRALES_ALERTAS.horizonteDias - 1);
  const preferidos = e.cliente?.dias_preferidos ?? [];
  const candidatos: (OpcionDia & { categoria: number; prefiere: number })[] = [];
  for (let d = sumarDias(e.visita.fecha < hoy ? hoy : e.visita.fecha, 1); d <= ultimo; d = sumarDias(d, 1)) {
    const hs = horasEvaluadas(e, d);
    if (!hs.length) continue;
    const mejor = Math.min(...hs.map((h) => h.categoria));
    const elegida = hs.find((h) => h.original && h.categoria === mejor) ?? hs.find((h) => h.categoria === mejor)!;
    const fuera = preferidos.length > 0 && !preferidos.includes(diaSemanaDeClave(d));
    candidatos.push({
      fecha: d,
      texto_dia: diaConNumero(d),
      hora: elegida.hora,
      tiempo: elegida.tiempo,
      semaforo: elegida.semaforo,
      sugerido: false,
      fuera_de_preferidos: fuera,
      categoria: mejor,
      prefiere: fuera ? 1 : 0,
    });
  }
  const elegidos = candidatos
    .sort((a, b) => a.prefiere - b.prefiere || a.categoria - b.categoria || a.fecha.localeCompare(b.fecha))
    .slice(0, UMBRALES_ALERTAS.opcionesDia)
    .map(({ categoria: _c, prefiere: _p, ...o }, i) => ({ ...o, sugerido: i === 0 }));
  return {
    visita_id: e.visita.id,
    dias: elegidos,
    horas: elegidos.length ? horasLibres(e, elegidos[0].fecha) : [],
    nota_horas: NOTA_HORAS,
  };
}
