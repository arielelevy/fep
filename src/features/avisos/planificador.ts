// Planificador de avisos (§12.1–§12.4). Función pura: dado «ahora», los ajustes, las visitas y las alertas activas,
// decide qué notificaciones tocan. En la app final lo ejecuta el servidor cada 5 minutos y envía Web Push (§12.4);
// en esta versión no hay servidor ni push real: `envio.ts` lo ejecuta en el móvil y deja el envío SIMULADO y registrado.
//
// Reglas:
//   - Un único RESUMEN DIARIO a la hora configurada (21:00) con todo lo de planificación: título «Mañana: 3 visitas»
//     (o «Mañana no tienes visitas» solo si hay otra cosa que contar) y como mucho 3 líneas, primero lo que pide
//     decisión. Si no hay visitas mañana ni nada nuevo que contar, NO se envía (criterio 28).
//   - Cada asunto se cuenta una sola vez (§12.1.4): las líneas ya incluidas no vuelven a salir (criterio 19).
//   - Inmediatos solo para lo operativo: aviso oficial AEMET, recordatorio antes de la visita y los de preparación de
//     la ola 8 (recogida y devolución de la furgoneta, recordatorio de compra).
//   - Nada en horas de silencio (22:00 a 08:00), salvo lo que el usuario programó (recordatorio de compra, horas de
//     recogida y devolución) y el resumen si se configuró dentro de esas horas (§12.1.3, criterio 29). Lo que cae en
//     silencio sale en el siguiente momento permitido (sigue pendiente hasta entonces).
//   - Cada aviso lleva acción directa y enlace profundo a la pantalla donde se resuelve (§12.1.5).

import type { AlertaClima } from '../../dominio/alertas';
import type { Cliente, Visita } from '../../domain/tipos';
import { TIPOS_TRABAJO } from '../../domain/tipos';
import { claveDia, desdeMadrid, diaSemanaDeClave, partesMadrid, sumarDias } from '../../lib/fechas';
import type { AlertaPreparacion } from '../alertas/preparacion/motor';
import { avisosInmediatos, claveResumen, enSilencio } from '../alertas/preparacion/planificador';
import type { ConfigAvisos } from './config';
import { enlaceA } from './enlaces';

export interface AccionAviso {
  texto: string;
  enlace: string;
}

export interface Notificacion {
  /** Clave del envío (no se repite). */
  clave: string;
  canal: 'resumen' | 'inmediata';
  tipo: 'RESUMEN_DIARIO' | 'CLIMA_AEMET' | 'VISITA_PREVIA' | 'PRUEBA' | AlertaPreparacion['tipo'];
  titulo: string;
  cuerpo: string;
  /** Enlace profundo (§12.1.5). */
  enlace: string;
  acciones: AccionAviso[];
  /** Claves que quedan avisadas al enviarla: las propias del registro y las del estado de preparación (ola 8). */
  marcar: { registro: string[]; preparacion: string[]; clima: string[] };
}

export interface EntradaPlan {
  ahora: Date;
  config: ConfigAvisos;
  visitas: Visita[];
  clientes: Pick<Cliente, 'id' | 'nombre' | 'telefono'>[];
  /** Alertas de clima activas (motor de la ola 7). */
  alertasClima: AlertaClima[];
  /** Alertas de preparación (motor de la ola 8). */
  alertasPreparacion: AlertaPreparacion[];
  /** Lo ya avisado de preparación (estado de la ola 8). */
  avisadosPreparacion: Record<string, string>;
  /** Lo ya avisado por este planificador: clave → instante ISO. */
  registro: Record<string, string>;
  /** Línea del resumen semanal positivo de esta semana («Esta semana cobraste 640 € en 6 trabajos.») o null. */
  lineaSemanal?: string | null;
}

const PESO = { urgente: 0, decision: 1, info: 2 } as const;
const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const nombreTipo = (t: string) => TIPOS_TRABAJO.find((x) => x.id === t)?.nombre ?? t;

export const claveClima = (a: Pick<AlertaClima, 'clave_dedupe'>) => `clima|${a.clave_dedupe}`;
export const claveResumenDia = (dia: string) => `resumen|${dia}`;
export const claveVisitaPrevia = (v: Pick<Visita, 'id' | 'fecha' | 'hora_inicio'>) => `visita|${v.id}|${v.fecha}|${v.hora_inicio ?? '09:00'}`;

/** ¿La hora del resumen de hoy cae en horas de silencio? Entonces sale igual (§12.1.3). */
function resumenEnSilencio(dia: string, cfg: ConfigAvisos): boolean {
  const [a, m, d] = dia.split('-').map(Number);
  return enSilencio(desdeMadrid(a, m, d, Number(cfg.horaResumen.slice(0, 2)), Number(cfg.horaResumen.slice(3, 5))), cfg);
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** Resumen diario (§12.3). null si no toca o no hay nada que contar. */
function resumenDiario(e: EntradaPlan): Notificacion | null {
  const hoy = claveDia(e.ahora);
  const p = partesMadrid(e.ahora);
  const ahoraMin = p.hora * 60 + p.minuto;
  const clave = claveResumenDia(hoy);
  if (ahoraMin < minutos(e.config.horaResumen) || e.registro[clave]) return null;
  if (enSilencio(e.ahora, e.config) && !resumenEnSilencio(hoy, e.config)) return null;

  const manana = sumarDias(hoy, 1);
  const visitasManana = e.visitas
    .filter((v) => v.fecha === manana && v.estado === 'programada' && !v.eliminado_en)
    .sort((a, b) => (a.hora_inicio ?? '09:00').localeCompare(b.hora_inicio ?? '09:00'));

  const lineas: { texto: string; peso: number; registro?: string; preparacion?: string; clima?: string }[] = [];
  for (const a of e.alertasClima) {
    if (a.estado !== 'activa' || a.eliminado_en || a.canal !== 'resumen_diario' || e.registro[claveClima(a)]) continue;
    lineas.push({ texto: a.texto_resumen, peso: PESO[a.nivel], registro: claveClima(a), clima: a.id });
  }
  for (const a of e.alertasPreparacion) {
    if (!a.canales.includes('resumen_diario') || e.avisadosPreparacion[claveResumen(a)]) continue;
    lineas.push({ texto: a.texto, peso: PESO[a.nivel], preparacion: claveResumen(a) });
  }
  const claveSemanal = `semanal|${hoy}`;
  if (e.config.resumenSemanal && diaSemanaDeClave(hoy) === 0 && e.lineaSemanal && !e.registro[claveSemanal]) {
    lineas.push({ texto: e.lineaSemanal, peso: 3, registro: claveSemanal });
  }

  // Criterio 28: sin visitas mañana ni nada nuevo que contar, no se envía.
  if (!visitasManana.length && !lineas.length) return null;

  lineas.sort((a, b) => a.peso - b.peso);
  const titulo = visitasManana.length ? `Mañana: ${plural(visitasManana.length, 'visita', 'visitas')}` : 'Mañana no tienes visitas';
  let cuerpo: string[];
  if (!lineas.length) {
    const v = visitasManana[0];
    const cliente = e.clientes.find((c) => c.id === v.cliente_id)?.nombre ?? 'un cliente';
    cuerpo = [`La primera, a las ${v.hora_inicio ?? '09:00'} en ${cliente}.`];
  } else if (lineas.length <= 3) {
    cuerpo = lineas.map((l) => l.texto);
  } else {
    cuerpo = [...lineas.slice(0, 2).map((l) => l.texto), `Y ${lineas.length - 2} cosas más en Alertas.`];
  }
  const enlace = enlaceA({ pantalla: 'alertas' });
  return {
    clave,
    canal: 'resumen',
    tipo: 'RESUMEN_DIARIO',
    titulo,
    cuerpo: cuerpo.join('\n'),
    enlace,
    acciones: [{ texto: 'Ver', enlace }],
    marcar: {
      registro: [clave, ...lineas.flatMap((l) => (l.registro ? [l.registro] : []))],
      preparacion: lineas.flatMap((l) => (l.preparacion ? [l.preparacion] : [])),
      clima: lineas.flatMap((l) => (l.clima ? [l.clima] : [])),
    },
  };
}

/** Recordatorio antes de cada visita de hoy (§12.2 VISITA_PREVIA, configurable en §10.10.5). */
function visitasPrevias(e: EntradaPlan, silencio: boolean): Notificacion[] {
  const antes = e.config.recordatorioVisita;
  if (!antes || silencio) return [];
  const hoy = claveDia(e.ahora);
  const [a, m, d] = hoy.split('-').map(Number);
  return e.visitas
    .filter((v) => v.fecha === hoy && v.estado === 'programada' && !v.eliminado_en && !e.registro[claveVisitaPrevia(v)])
    .filter((v) => {
      const h = v.hora_inicio ?? '09:00';
      const inicio = desdeMadrid(a, m, d, Number(h.slice(0, 2)), Number(h.slice(3, 5))).getTime();
      return e.ahora.getTime() >= inicio - antes * 60_000 && e.ahora.getTime() < inicio;
    })
    .map((v) => {
      const c = e.clientes.find((x) => x.id === v.cliente_id);
      const enlace = enlaceA({ pantalla: 'visita', id: v.id });
      const trabajos = v.tipos_trabajo.map(nombreTipo).join(' y ');
      return {
        clave: claveVisitaPrevia(v),
        canal: 'inmediata' as const,
        tipo: 'VISITA_PREVIA' as const,
        titulo: `${v.hora_inicio ?? '09:00'} ${c?.nombre ?? 'Visita'}`,
        cuerpo: trabajos ? `${trabajos}.` : 'Visita de hoy.',
        enlace,
        acciones: [{ texto: 'Cómo llegar', enlace }, ...(c?.telefono ? [{ texto: 'Llamar', enlace: `tel:${c.telefono}` }] : [])],
        marcar: { registro: [claveVisitaPrevia(v)], preparacion: [], clima: [] },
      };
    });
}

/** Qué notificaciones tocan ahora. */
export function planificar(e: EntradaPlan): Notificacion[] {
  const silencio = enSilencio(e.ahora, e.config);
  const r: Notificacion[] = [];

  // Avisos oficiales AEMET: inmediatos, fuera de horas de silencio (§12.2 CLIMA_AEMET).
  if (!silencio) {
    for (const a of e.alertasClima) {
      if (a.estado !== 'activa' || a.eliminado_en || a.canal !== 'inmediata' || e.registro[claveClima(a)]) continue;
      const enlace = enlaceA({ pantalla: 'alertas' });
      r.push({
        clave: claveClima(a),
        canal: 'inmediata',
        tipo: 'CLIMA_AEMET',
        titulo: a.texto_resumen,
        cuerpo: `${a.titulo}. ${a.cuerpo}`,
        enlace,
        acciones: [{ texto: 'Ver opciones', enlace }],
        marcar: { registro: [claveClima(a)], preparacion: [], clima: [a.id] },
      });
    }
  }

  // Preparación (ola 8): su propia regla decide hora y silencio (lo programado por Felipe sale a su hora).
  for (const aviso of avisosInmediatos(e.alertasPreparacion, e.avisadosPreparacion, e.ahora, e.config)) {
    const alerta = e.alertasPreparacion.find((x) => x.tipo === aviso.tipo && x.texto === aviso.texto);
    const enlace = enlaceA({ pantalla: 'preparar', fecha: aviso.destino.fecha });
    r.push({
      clave: aviso.clave,
      canal: 'inmediata',
      tipo: aviso.tipo,
      titulo: aviso.texto,
      cuerpo: alerta ? `${alerta.titulo}. ${alerta.cuerpo}` : '',
      enlace,
      acciones: (alerta?.acciones ?? []).slice(0, 2).map((x) => ({ texto: x.texto, enlace: x.telefono ? `tel:${x.telefono}` : enlace })),
      marcar: { registro: [], preparacion: [aviso.clave], clima: [] },
    });
  }

  r.push(...visitasPrevias(e, silencio));
  const resumen = resumenDiario(e);
  if (resumen) r.push(resumen);
  return r;
}
