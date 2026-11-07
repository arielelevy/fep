import { claveDia, sumarDias } from '../lib/fechas';
import { HORA_POR_DEFECTO, claveHora, hhmm, horasDeFranja, minutos, sumarHoras } from './horas';
import type { AvisoOficial, Causa, HoraClima, NivelSemaforo, Prevision, Semaforo, Ubicacion, VisitaClima } from './tipos';
import { esTormenta, textoWmo } from './wmo';

// Motor del semáforo de visitas por reglas (§11.2, §11.3, §11.4). Función pura: no consulta nada; recibe la
// previsión (o null) y devuelve nivel, textos y consejo. Valores iniciales de §11.3 («configurables en servidor»):
// todos los umbrales están en UMBRALES para poder ajustarlos tras el primer mes de uso (§20.8).
//
// SUPUESTOS (la especificación no los fija; documentados en el informe de la ola):
// - S1 «Hay lluvia» en una hora = precipitación ≥ 0,1 mm.
// - S2 «Prob. ≥ X % con ≥ Y mm/h» se cumple en una misma hora de la franja.
// - S3 «Prob. de lluvia» de una franja = la máxima de sus horas.
// - S4 Las 12 h previas para césped mojado aplican a toda la fila «Corte de césped, desbroce».
// - S5 «La noche siguiente» de plantación = hasta las 08:00 del día siguiente; «el día» = de 00:00 a 23:59.
// - S6 «Lluvia ≥ 10 mm en el día» (plantación) = suma de las 24 horas del día de la visita.
// - S7 Viento «12 a 19 km/h» y «medio ≥ 20» usan el viento medio a 10 m; las rachas sólo donde la tabla las nombra.
// - S8 Una visita es «a más de 7 días vista» si su día es hoy + 7 o posterior (días 8 a 14 de la franja, §10.5).
// - S9 Consejo «Empieza a las …» sólo si esa hora es a partir de las 07:00 (y el hueco está libre, si se sabe).

export const UMBRALES = {
  lluviaHora: 0.1,
  cesped: { probRojo: 60, mmRojo: 1, mmPreviasRojo: 5, probAmbar: 30 },
  setos: { rachasRojo: 50, vientoRojo: 40, rachasAmbar: 30, probAmbar: 60 },
  fitosanitarios: { vientoRojo: 20, probRojo: 50, horasDespues: 6, vientoAmbar: 12, tempAmbar: 30 },
  plantacion: { minRojo: 0, mmDiaAmbar: 10, finNocheSiguiente: 8 },
  abonado: { probRojo: 70, mmRojo: 5, probAmbar: 40 },
  riego: { probAmbar: 60 },
  piscina: { mmAmbar: 2.5 },
  general: { probRojo: 70, mmRojo: 2, probAmbar: 40 },
  calor: { rojo: 40, ambar: 35 },
  horasPreviasCesped: 12,
  diasSemaforo: 7,
  horaMinimaConsejo: '07:00',
  horaPrimeraHora: '08:00',
} as const;

export const ESTADOS: Record<NivelSemaforo | 'orientativo', string> = {
  verde: 'Se puede ir',
  ambar: 'Con cuidado',
  rojo: 'Mejor mover',
  gris: 'Sin previsión',
  orientativo: 'Previsión orientativa',
};

export const MOTIVOS = {
  sinUbicacion: 'Falta la dirección del cliente',
  sinConexion: 'Sin conexión',
  sinDatosDia: 'Aún no hay previsión para ese día',
} as const;

const ORDEN: Record<NivelSemaforo, number> = { gris: -1, verde: 0, ambar: 1, rojo: 2 };
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
const hora = (h: HoraClima) => `${h.hora.slice(11, 13)}:00`;
const conLluvia = (h: HoraClima) => h.precipitacion >= UMBRALES.lluviaHora;

interface Contexto {
  franja: HoraClima[];
  porClave: Map<string, HoraClima>;
  visita: VisitaClima;
  avisos: AvisoOficial[];
}

const tramo = (ctx: Contexto, desde: string, horas: number): HoraClima[] => {
  const salida: HoraClima[] = [];
  for (let i = 0; i < horas; i++) {
    const h = ctx.porClave.get(sumarHoras(desde, i));
    if (h) salida.push(h);
  }
  return salida;
};

function causaLluvia(nivel: 'ambar' | 'rojo', franja: HoraClima[], regla: string, cumple: (h: HoraClima) => boolean): Causa | null {
  const h = franja.find(cumple);
  return h ? { nivel, tipo: 'lluvia', valor: h.prob_precipitacion, hora: hora(h), regla } : null;
}

/** Reglas por tipo de trabajo (§11.3). Devuelve la causa más grave de ese tipo, o null si es verde. */
function reglasTipo(tipo: string, ctx: Contexto): Causa | null {
  const F = ctx.franja;
  const probMax = max(F.map((h) => h.prob_precipitacion));
  const horaProbMax = F.find((h) => h.prob_precipitacion === probMax);
  switch (tipo) {
    case 'corte_cesped':
    case 'desbroce': {
      const u = UMBRALES.cesped;
      const r = causaLluvia('rojo', F, 'cesped.rojo.lluvia', (h) => h.prob_precipitacion >= u.probRojo && h.precipitacion >= u.mmRojo);
      if (r) return r;
      const previas = tramo(ctx, sumarHoras(F[0].hora, -UMBRALES.horasPreviasCesped), UMBRALES.horasPreviasCesped);
      const acumulado = Math.round(previas.reduce((s, h) => s + h.precipitacion, 0) * 10) / 10;
      if (acumulado >= u.mmPreviasRojo) return { nivel: 'rojo', tipo: 'cesped_mojado', valor: acumulado, regla: 'cesped.rojo.mojado' };
      const parte = F.find(conLluvia);
      if (parte) return { nivel: 'ambar', tipo: 'lluvia', valor: parte.prob_precipitacion, hora: hora(parte), regla: 'cesped.ambar.lluvia' };
      if (probMax >= u.probAmbar) return { nivel: 'ambar', tipo: 'lluvia', valor: probMax, regla: 'cesped.ambar.prob', hora: horaProbMax && hora(horaProbMax) };
      return null;
    }
    case 'setos_poda': {
      const u = UMBRALES.setos;
      const rachas = F.find((h) => h.rachas >= u.rachasRojo);
      if (rachas) return { nivel: 'rojo', tipo: 'rachas', valor: rachas.rachas, hora: hora(rachas), regla: 'setos.rojo.rachas' };
      const viento = F.find((h) => h.viento >= u.vientoRojo);
      if (viento) return { nivel: 'rojo', tipo: 'viento', valor: viento.viento, hora: hora(viento), regla: 'setos.rojo.viento' };
      const rachasA = F.find((h) => h.rachas >= u.rachasAmbar);
      if (rachasA) return { nivel: 'ambar', tipo: 'rachas', valor: max(F.map((h) => h.rachas)), hora: hora(rachasA), regla: 'setos.ambar.rachas' };
      if (probMax >= u.probAmbar) return { nivel: 'ambar', tipo: 'lluvia', valor: probMax, regla: 'setos.ambar.prob', hora: horaProbMax && hora(horaProbMax) };
      return null;
    }
    case 'fitosanitarios': {
      const u = UMBRALES.fitosanitarios;
      const viento = F.find((h) => h.viento >= u.vientoRojo);
      if (viento) return { nivel: 'rojo', tipo: 'viento', valor: max(F.map((h) => h.viento)), hora: hora(viento), regla: 'fitosanitarios.rojo.viento' };
      // La lluvia que lava el producto: franja y las 6 horas siguientes (§11.2).
      const despues = [...F, ...tramo(ctx, sumarHoras(F[F.length - 1].hora, 1), u.horasDespues)];
      const lava = despues.find((h) => h.prob_precipitacion >= u.probRojo);
      if (lava) return { nivel: 'rojo', tipo: 'lluvia', valor: lava.prob_precipitacion, hora: hora(lava), regla: 'fitosanitarios.rojo.lluvia' };
      const vientoA = F.find((h) => h.viento >= u.vientoAmbar);
      if (vientoA) return { nivel: 'ambar', tipo: 'viento', valor: max(F.map((h) => h.viento)), hora: hora(vientoA), regla: 'fitosanitarios.ambar.viento' };
      const calor = F.find((h) => h.temperatura > u.tempAmbar);
      if (calor) return { nivel: 'ambar', tipo: 'calor', valor: Math.round(max(F.map((h) => h.temperatura))), hora: hora(calor), regla: 'fitosanitarios.ambar.calor' };
      return null;
    }
    case 'plantacion': {
      const u = UMBRALES.plantacion;
      // El día entero y la noche siguiente hasta las 08:00 (helada, §11.2).
      const diaYNoche = tramo(ctx, claveHora(ctx.visita.fecha, 0), 24 + u.finNocheSiguiente);
      const minima = Math.min(...diaYNoche.map((h) => h.temperatura));
      if (diaYNoche.length && minima <= u.minRojo) return { nivel: 'rojo', tipo: 'helada', valor: Math.round(minima), regla: 'plantacion.rojo.helada' };
      const dia = tramo(ctx, claveHora(ctx.visita.fecha, 0), 24);
      const mm = Math.round(dia.reduce((s, h) => s + h.precipitacion, 0) * 10) / 10;
      if (mm >= u.mmDiaAmbar) return { nivel: 'ambar', tipo: 'lluvia_dia', valor: mm, regla: 'plantacion.ambar.lluvia' };
      return null;
    }
    case 'abonado': {
      const u = UMBRALES.abonado;
      const r = causaLluvia('rojo', F, 'abonado.rojo.lluvia', (h) => h.prob_precipitacion >= u.probRojo && h.precipitacion >= u.mmRojo);
      if (r) return r;
      if (probMax >= u.probAmbar) return { nivel: 'ambar', tipo: 'lluvia', valor: probMax, regla: 'abonado.ambar.prob', hora: horaProbMax && hora(horaProbMax) };
      return null;
    }
    case 'riego': {
      // Rojo por tormenta: lo cubre la regla común.
      if (probMax >= UMBRALES.riego.probAmbar) return { nivel: 'ambar', tipo: 'lluvia', valor: probMax, regla: 'riego.ambar.prob', hora: horaProbMax && hora(horaProbMax) };
      return null;
    }
    case 'piscina': {
      // Rojo por tormenta o aviso naranja/rojo: lo cubren las reglas comunes.
      const h = F.find((x) => x.precipitacion >= UMBRALES.piscina.mmAmbar);
      if (h) return { nivel: 'ambar', tipo: 'lluvia', valor: h.prob_precipitacion, hora: hora(h), regla: 'piscina.ambar.lluvia' };
      return null;
    }
    default: {
      // limpieza_general, otro y cualquier tipo nuevo.
      const u = UMBRALES.general;
      const r = causaLluvia('rojo', F, 'general.rojo.lluvia', (h) => h.prob_precipitacion >= u.probRojo && h.precipitacion >= u.mmRojo);
      if (r) return r;
      if (probMax >= u.probAmbar) return { nivel: 'ambar', tipo: 'lluvia', valor: probMax, regla: 'general.ambar.prob', hora: horaProbMax && hora(horaProbMax) };
      return null;
    }
  }
}

/** Reglas comunes a todos los tipos (§11.3). */
function reglasComunes(ctx: Contexto): Causa[] {
  const F = ctx.franja;
  const salida: Causa[] = [];
  const tormenta = F.find((h) => esTormenta(h.codigo_wmo));
  if (tormenta) salida.push({ nivel: 'rojo', tipo: 'tormenta', valor: tormenta.codigo_wmo, hora: hora(tormenta), regla: 'comun.rojo.tormenta' });
  const tMax = max(F.map((h) => h.temperatura));
  const caliente = F.find((h) => h.temperatura === tMax);
  if (tMax >= UMBRALES.calor.rojo) salida.push({ nivel: 'rojo', tipo: 'calor', valor: Math.round(tMax), hora: caliente && hora(caliente), regla: 'comun.rojo.calor' });
  else if (tMax >= UMBRALES.calor.ambar) salida.push({ nivel: 'ambar', tipo: 'calor', valor: Math.round(tMax), hora: caliente && hora(caliente), regla: 'comun.ambar.calor' });
  for (const a of ctx.avisos.filter((x) => x.fecha === ctx.visita.fecha)) {
    salida.push({ nivel: a.nivel === 'amarillo' ? 'ambar' : 'rojo', tipo: 'aviso', valor: 0, regla: `comun.aviso.${a.nivel}`, fenomeno: a.fenomeno, nivelAviso: a.nivel });
  }
  return salida;
}

const parteDelDia = (hh: string) => (minutos(hh) < 14 * 60 ? 'la mañana' : minutos(hh) < 21 * 60 ? 'la tarde' : 'la noche');

/** Etiqueta corta (≤ 40 caracteres, §11.4). */
function etiqueta(nivel: NivelSemaforo, c: Causa | undefined, ctx: Contexto): string {
  if (nivel === 'verde' || !c) {
    const inicio = ctx.franja[0];
    return `${ESTADOS.verde} · ${textoWmo(inicio.codigo_wmo)}, ${Math.round(max(ctx.franja.map((h) => h.temperatura)))}°`;
  }
  const todasLluvia = ctx.franja.every(conLluvia);
  let texto: string;
  switch (c.tipo) {
    case 'lluvia':
      if (nivel === 'rojo') texto = todasLluvia ? `Lluvia toda ${parteDelDia(hora(ctx.franja[0]))}` : `Lluvia desde las ${c.hora}`;
      else texto = ctx.franja.some(conLluvia) ? `Lluvia a partir de las ${c.hora}` : `Posible lluvia (${c.valor}%)`;
      break;
    case 'cesped_mojado': texto = `Césped mojado (${String(c.valor).replace('.', ',')} mm antes)`; break;
    case 'lluvia_dia': texto = `Lluvia en el día (${String(c.valor).replace('.', ',')} mm)`; break;
    case 'viento': texto = nivel === 'rojo' ? `Viento de ${c.valor} km/h` : `Viento de ${c.valor} km/h desde las ${c.hora}`; break;
    case 'rachas': texto = nivel === 'rojo' ? `Rachas de ${c.valor} km/h` : `Rachas de ${c.valor} km/h desde las ${c.hora}`; break;
    case 'tormenta': texto = c.hora ? `Tormenta a las ${c.hora}` : 'Tormenta'; break;
    case 'calor': texto = nivel === 'rojo' ? `${c.valor}° de calor` : `Calor de ${c.valor}°`; break;
    case 'helada': texto = `Helada (${c.valor}°)`; break;
    case 'aviso': texto = `Aviso ${c.nivelAviso} por ${c.fenomeno}`; break;
  }
  const t = nivel === 'rojo' ? `${ESTADOS.rojo} · ${texto}` : texto;
  return t.length <= 40 ? t : `${t.slice(0, 39)}…`;
}

/** Consejo por reglas, sin IA (§11.4). */
function consejo(nivel: NivelSemaforo, causas: Causa[], ctx: Contexto, huecoLibre?: (inicio: string, fin: string) => boolean): Pick<Semaforo, 'consejo' | 'propuesta'> {
  if (nivel === 'verde' || nivel === 'gris') return {};
  const calor = causas.find((c) => c.tipo === 'calor');
  if (calor) return { consejo: 'Pasa a primera hora por el calor', propuesta: { hora: UMBRALES.horaPrimeraHora } };
  const tipos = ctx.visita.tipos_trabajo;
  const viento = causas.find((c) => (c.tipo === 'viento' || c.tipo === 'rachas') && c.nivel === 'ambar');
  if (viento && nivel === 'ambar' && tipos.includes('fitosanitarios') && tipos.includes('setos_poda')) {
    const mitad = Math.ceil(ctx.franja.length / 2);
    const antes = max(ctx.franja.slice(0, mitad).map((h) => h.viento));
    const despues = max(ctx.franja.slice(mitad).map((h) => h.viento));
    if (despues > antes) return { consejo: 'Fumiga primero y deja la poda para el final' };
  }
  // Lluvia que empieza a mitad de la franja: empezar antes para acabar a tiempo.
  const inicioVisita = minutos(ctx.visita.hora_inicio ?? HORA_POR_DEFECTO);
  const primeraLluvia = ctx.franja.find(conLluvia);
  if (nivel === 'ambar' && primeraLluvia && minutos(hora(primeraLluvia)) > inicioVisita) {
    const empieza = minutos(hora(primeraLluvia)) - ctx.visita.duracion;
    const fin = hhmm(empieza + ctx.visita.duracion);
    if (empieza >= minutos(UMBRALES.horaMinimaConsejo) && empieza < inicioVisita && (huecoLibre?.(hhmm(empieza), fin) ?? true))
      return { consejo: `Empieza a las ${hhmm(empieza)} para acabar antes de la lluvia`, propuesta: { hora: hhmm(empieza) } };
  }
  return {};
}

const gris = (motivo: string, ahora: Date, actualizado_en?: string): Semaforo => ({
  nivel: 'gris', estado: ESTADOS.gris, etiqueta: ESTADOS.gris, motivo, orientativo: false, causas: [], calculado_en: ahora.toISOString(), actualizado_en,
});

export interface EntradaSemaforo {
  visita: VisitaClima;
  /** Coordenadas del cliente; null si no tiene (sin dirección o sin geocodificar). */
  ubicacion: Ubicacion | null;
  /** Previsión de esa ubicación; null si no hay (sin conexión o el proveedor no responde). */
  prevision: Prevision | null;
  /** Avisos oficiales de la zona del cliente. */
  avisos?: AvisoOficial[];
  ahora?: Date;
  /** Motivo a mostrar cuando no hay previsión (por defecto "Sin conexión"). */
  motivoSinPrevision?: string;
  /** Para el consejo «Empieza a las …»: ¿está libre la agenda en ese hueco? */
  huecoLibre?: (inicio: string, fin: string) => boolean;
}

/** Semáforo de una visita (§11). Varios tipos de trabajo: gana el color más restrictivo. */
export function evaluarVisita(e: EntradaSemaforo): Semaforo {
  const ahora = e.ahora ?? new Date();
  const hoy = claveDia(ahora);
  if (e.visita.fecha >= sumarDias(hoy, UMBRALES.diasSemaforo)) {
    return { nivel: 'gris', estado: ESTADOS.orientativo, etiqueta: ESTADOS.orientativo, orientativo: true, causas: [], calculado_en: ahora.toISOString(), actualizado_en: e.prevision?.actualizado_en };
  }
  if (!e.ubicacion) return gris(MOTIVOS.sinUbicacion, ahora);
  if (!e.prevision) return gris(e.motivoSinPrevision ?? MOTIVOS.sinConexion, ahora);
  const porClave = new Map(e.prevision.horas.map((h) => [h.hora, h]));
  const claves = horasDeFranja(e.visita.fecha, e.visita.hora_inicio, e.visita.duracion);
  const franja = claves.map((k) => porClave.get(k)).filter((h): h is HoraClima => Boolean(h));
  if (franja.length !== claves.length) return gris(MOTIVOS.sinDatosDia, ahora, e.prevision.actualizado_en);

  const ctx: Contexto = { franja, porClave, visita: e.visita, avisos: e.avisos ?? [] };
  const tipos = e.visita.tipos_trabajo.length ? e.visita.tipos_trabajo : ['otro'];
  const causas = [...tipos.map((t) => reglasTipo(t, ctx)).filter((c): c is Causa => Boolean(c)), ...reglasComunes(ctx)];
  const nivel = causas.reduce<NivelSemaforo>((n, c) => (ORDEN[c.nivel] > ORDEN[n] ? c.nivel : n), 'verde');
  // La causa que se nombra: la primera del nivel ganador (reglas del tipo antes que las comunes, salvo tormenta/aviso).
  const delNivel = causas.filter((c) => c.nivel === nivel);
  const principal = delNivel.find((c) => c.tipo === 'tormenta' || c.tipo === 'aviso') ?? delNivel[0];
  return {
    nivel,
    estado: ESTADOS[nivel],
    etiqueta: etiqueta(nivel, principal, ctx),
    ...consejo(nivel, causas, ctx, e.huecoLibre),
    orientativo: false,
    causas,
    calculado_en: ahora.toISOString(),
    actualizado_en: e.prevision.actualizado_en,
    simulado: e.prevision.fuente === 'simulada' || undefined,
  };
}
