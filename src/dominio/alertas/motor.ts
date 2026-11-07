// Motor de alertas de clima (§12): función pura que, con las visitas, el clima de cada cliente y el estado anterior,
// devuelve el estado nuevo de las alertas sin duplicar nunca un asunto (§5.2.3, §12.1.4).
//
// Reglas (§12.2):
// - CLIMA_INFO: visita en ámbar o rojo, desde 5 días antes. Info, resumen diario.
// - CLIMA_DECIDIR: visita en rojo a 2 días o menos (o a 4 días si la probabilidad de lluvia es ≥ 80 %). Decisión.
// - CLIMA_AEMET: aviso oficial en la zona y fecha de la visita, hasta 3 días antes. Decisión, inmediata.
// - CLIMA_MEJORA: una visita con alerta activa pasa a verde. Info. La alerta anterior se resuelve, sin regañar.
// Deduplicación:
// - Una sola alerta viva por asunto (`clave_asunto` = familia + visita + día). Si cambia el nivel o el tipo, se
//   ACTUALIZA la misma alerta (mismo id, `clave_dedupe` nueva) en vez de crear otra.
// - Sólo vuelve a notificarse (notificada_en = null) si empeora, si sube de escalón (INFO → DECIDIR) o si es un
//   aviso oficial nuevo. Si mejora (rojo → ámbar) se actualiza en silencio.
// - «Mantener la visita» guarda un descarte: el asunto no vuelve salvo que empeore por encima de lo descartado.
// Sin previsión (gris) no se crea ni se resuelve nada: no se inventa el tiempo.

import { evaluarVisita, type AvisoOficial, type Semaforo } from '../../clima';
import { horaDe } from '../../domain/agenda';
import type { Cliente, Visita } from '../../domain/tipos';
import { claveDia } from '../../lib/fechas';
import { CATALOGO_CLIMA, RANGO_AVISO, RANGO_SEMAFORO, TEXTO_SEMAFORO, UMBRALES_ALERTAS } from './catalogo';
import { claveAsunto, claveDedupe } from './dedupe';
import { antelacionMayusculas, causaDe, cuandoCorto, datoClave, diaConNumero, diasEntre, mayuscula, NOMBRE_CAUSA, probLluvia, textoTrabajos } from './textos';
import type { AlertaClima, ClimaCliente, Descarte, EstadoAlertas, NivelSemaforoAlerta, ResultadoRecalculo, TipoAlertaClima } from './tipos';

export interface EntradaRecalculo {
  estado: EstadoAlertas;
  visitas: Visita[];
  clientes: Cliente[];
  /** Clima por id de cliente. Si falta, la visita queda «Sin previsión» y no genera alertas. */
  clima: Map<string, ClimaCliente> | ((clienteId: string) => ClimaCliente | undefined);
  ahora: Date;
  usuario: string;
  negocio: string;
  nuevoId?: () => string;
}

const ESTADO_VACIO: EstadoAlertas = { alertas: [], descartes: [] };
export const estadoVacio = (): EstadoAlertas => ({ alertas: [...ESTADO_VACIO.alertas], descartes: [...ESTADO_VACIO.descartes] });

/** Nombre del fenómeno de un aviso en frase: «viento», «lluvia», «tormentas», «calor», «nieve». */
const FENOMENO_FRASE: Record<AvisoOficial['fenomeno'], string> = { viento: 'viento', lluvia: 'lluvia', tormenta: 'tormentas', calor: 'calor', nieve: 'nieve' };

function avisoMasGrave(avisos: AvisoOficial[], fecha: string): AvisoOficial | null {
  return avisos.filter((a) => a.fecha === fecha).sort((a, b) => RANGO_AVISO[b.nivel] - RANGO_AVISO[a.nivel] || a.fenomeno.localeCompare(b.fenomeno))[0] ?? null;
}

/** Etiqueta del semáforo sin repetir el estado: «Mejor mover · Lluvia toda la mañana» → «Lluvia toda la mañana». */
function detalleSemaforo(s: Semaforo): string {
  return s.etiqueta.startsWith(s.estado) ? s.etiqueta.slice(s.estado.length).replace(/^\s*·\s*/, '') : s.etiqueta;
}

/** Datos variables de una alerta (lo que se recalcula); el resto (id, trazabilidad, estado) lo pone `fusionar`. */
type Datos = Omit<AlertaClima, keyof import('../../domain/tipos').Comunes | 'estado' | 'notificada_en' | 'resuelta_en'>;

function datosClima(tipo: 'CLIMA_INFO' | 'CLIMA_DECIDIR', v: Visita, cliente: Cliente | undefined, s: Semaforo, hoy: string): Datos {
  const nivel = s.nivel as NivelSemaforoAlerta;
  const cat = CATALOGO_CLIMA[tipo];
  const dias = diasEntre(hoy, v.fecha);
  const causa = causaDe(s);
  const nombre = cliente?.nombre ?? 'Cliente';
  const asunto = claveAsunto('clima', v.id, v.fecha);
  const cuando = cuandoCorto(v.fecha, hoy);
  const fenomeno = causa ? NOMBRE_CAUSA[causa] : 'mal tiempo';
  return {
    tipo,
    nivel: cat.nivel,
    seccion: cat.seccion,
    canal: cat.canal,
    clave_asunto: asunto,
    clave_dedupe: claveDedupe(asunto, tipo, nivel),
    entidad: { tipo: 'visita', id: v.id },
    cliente_id: v.cliente_id,
    fecha: v.fecha,
    hora: horaDe(v),
    dias_antelacion: dias,
    semaforo: nivel,
    estado_semaforo: TEXTO_SEMAFORO[nivel],
    etiqueta_superior: `${TEXTO_SEMAFORO[nivel].toUpperCase()} · ${antelacionMayusculas(dias)}`,
    dato_clave: datoClave(s),
    titulo: `${diaConNumero(v.fecha)} · ${nombre}`,
    cuerpo: `${textoTrabajos(v.tipos_trabajo)} a las ${horaDe(v)}. ${detalleSemaforo(s)}.`,
    texto_resumen:
      tipo === 'CLIMA_DECIDIR'
        ? `${diaConNumero(v.fecha)}: ${fenomeno} en ${nombre}. ¿La movemos?`
        : `Posible ${fenomeno} ${cuando} en ${nombre}.`,
    causa,
    aviso: null,
    accion_principal: cat.accion_principal,
    accion_secundaria: cat.accion_secundaria,
  };
}

function datosAemet(v: Visita, cliente: Cliente | undefined, aviso: AvisoOficial, s: Semaforo, hoy: string): Datos {
  const cat = CATALOGO_CLIMA.CLIMA_AEMET;
  const dias = diasEntre(hoy, v.fecha);
  const nombre = cliente?.nombre ?? 'Cliente';
  const asunto = claveAsunto('aemet', v.id, v.fecha);
  const nivel: NivelSemaforoAlerta = aviso.nivel === 'amarillo' ? (s.nivel === 'rojo' ? 'rojo' : 'ambar') : 'rojo';
  const fen = FENOMENO_FRASE[aviso.fenomeno];
  return {
    tipo: 'CLIMA_AEMET',
    nivel: cat.nivel,
    seccion: cat.seccion,
    canal: cat.canal,
    clave_asunto: asunto,
    clave_dedupe: claveDedupe(asunto, 'CLIMA_AEMET', `${aviso.fenomeno}-${aviso.nivel}`),
    entidad: { tipo: 'visita', id: v.id },
    cliente_id: v.cliente_id,
    fecha: v.fecha,
    hora: horaDe(v),
    dias_antelacion: dias,
    semaforo: nivel,
    estado_semaforo: TEXTO_SEMAFORO[nivel],
    etiqueta_superior: `AVISO AEMET · ${antelacionMayusculas(dias)}`,
    dato_clave: `${mayuscula(aviso.nivel)} por ${fen}`,
    titulo: `${diaConNumero(v.fecha)} · ${nombre}`,
    cuerpo: `${textoTrabajos(v.tipos_trabajo)} a las ${horaDe(v)}. Aviso ${aviso.nivel} por ${fen} en su zona.`,
    texto_resumen: `Aviso ${aviso.nivel} por ${fen} ${cuandoCorto(v.fecha, hoy)} en ${nombre}.`,
    causa: aviso.fenomeno === 'tormenta' ? 'tormenta' : aviso.fenomeno,
    aviso,
    accion_principal: cat.accion_principal,
    accion_secundaria: cat.accion_secundaria,
  };
}

function datosMejora(v: Visita, cliente: Cliente | undefined, anterior: AlertaClima, hoy: string): Datos {
  const cat = CATALOGO_CLIMA.CLIMA_MEJORA;
  const dias = diasEntre(hoy, v.fecha);
  const nombre = cliente?.nombre ?? 'Cliente';
  const asunto = claveAsunto('mejora', v.id, v.fecha);
  const fenomeno = anterior.causa ? NOMBRE_CAUSA[anterior.causa] : 'mal tiempo';
  return {
    tipo: 'CLIMA_MEJORA',
    nivel: cat.nivel,
    seccion: cat.seccion,
    canal: cat.canal,
    clave_asunto: asunto,
    clave_dedupe: claveDedupe(asunto, 'CLIMA_MEJORA', 'verde'),
    entidad: { tipo: 'visita', id: v.id },
    cliente_id: v.cliente_id,
    fecha: v.fecha,
    hora: horaDe(v),
    dias_antelacion: dias,
    semaforo: 'verde',
    estado_semaforo: TEXTO_SEMAFORO.verde,
    etiqueta_superior: `${TEXTO_SEMAFORO.verde.toUpperCase()} · ${antelacionMayusculas(dias)}`,
    dato_clave: null,
    titulo: `${diaConNumero(v.fecha)} · ${nombre}`,
    cuerpo: `Ya no se prevé ${fenomeno}. Mantén la visita.`,
    texto_resumen: `Ya no se prevé ${fenomeno} ${cuandoCorto(v.fecha, hoy)} en ${nombre}. Mantén la visita.`,
    causa: anterior.causa,
    aviso: null,
    accion_principal: cat.accion_principal,
    accion_secundaria: cat.accion_secundaria,
  };
}

/** Rango de gravedad de unos datos de alerta (para comparar con descartes y decidir si se vuelve a avisar). */
function rangoDe(d: Pick<Datos, 'tipo' | 'semaforo' | 'aviso'>): number {
  if (d.tipo === 'CLIMA_AEMET' && d.aviso) return RANGO_AVISO[d.aviso.nivel];
  return RANGO_SEMAFORO[d.semaforo];
}
const ESCALON: Record<TipoAlertaClima, number> = { CLIMA_MEJORA: 0, CLIMA_INFO: 1, CLIMA_DECIDIR: 2, CLIMA_AEMET: 2 };

const CAMPOS_VISIBLES: (keyof Datos)[] = [
  'tipo', 'nivel', 'seccion', 'canal', 'clave_dedupe', 'fecha', 'hora', 'dias_antelacion', 'semaforo', 'estado_semaforo',
  'etiqueta_superior', 'dato_clave', 'titulo', 'cuerpo', 'texto_resumen', 'causa', 'cliente_id',
];
const igual = (a: Datos, b: AlertaClima) =>
  CAMPOS_VISIBLES.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k])) && JSON.stringify(a.aviso) === JSON.stringify(b.aviso);

/** Recalcula todas las alertas de clima. Puro: no toca la base ni la red. Idempotente con la misma entrada. */
export function recalcularAlertas(e: EntradaRecalculo): ResultadoRecalculo {
  const ahoraIso = e.ahora.toISOString();
  const hoy = claveDia(e.ahora);
  const nuevoId = e.nuevoId ?? (() => crypto.randomUUID());
  const climaDe = typeof e.clima === 'function' ? e.clima : (id: string) => (e.clima as Map<string, ClimaCliente>).get(id);
  const clientes = new Map(e.clientes.map((c) => [c.id, c]));
  const visitas = new Map(e.visitas.map((v) => [v.id, v]));

  const alertas = e.estado.alertas.map((a) => ({ ...a }));
  const descartes: Descarte[] = [...e.estado.descartes];
  const nuevas: AlertaClima[] = [];
  const actualizadas: AlertaClima[] = [];
  const resueltas: AlertaClima[] = [];
  const caducadas: AlertaClima[] = [];

  const activaDe = (asunto: string) => alertas.find((a) => a.clave_asunto === asunto && a.estado === 'activa' && !a.eliminado_en);
  const descarteDe = (asunto: string) => descartes.filter((d) => d.clave_asunto === asunto).reduce((m, d) => Math.max(m, d.rango), -1);

  const tocar = (a: AlertaClima) => {
    a.actualizado_en = ahoraIso;
    a.modificado_por = e.usuario;
    a.version += 1;
  };
  const cerrar = (a: AlertaClima, estado: 'resuelta' | 'caducada') => {
    a.estado = estado;
    a.resuelta_en = ahoraIso;
    tocar(a);
    (estado === 'resuelta' ? resueltas : caducadas).push(a);
  };

  /** Crea o actualiza la alerta del asunto. Respeta los descartes y decide si hay que volver a avisar. */
  const fijar = (d: Datos) => {
    if (descarteDe(d.clave_asunto) >= rangoDe(d)) return;
    const previa = activaDe(d.clave_asunto);
    if (!previa) {
      const a: AlertaClima = {
        ...d,
        id: nuevoId(),
        negocio_id: e.negocio,
        creado_en: ahoraIso,
        actualizado_en: ahoraIso,
        creado_por: e.usuario,
        modificado_por: e.usuario,
        eliminado_en: null,
        version: 1,
        estado: 'activa',
        notificada_en: null,
        resuelta_en: null,
      };
      alertas.push(a);
      nuevas.push(a);
      return;
    }
    if (igual(d, previa)) return;
    const peor = rangoDe(d) > rangoDe(previa) || ESCALON[d.tipo] > ESCALON[previa.tipo] || (d.tipo === 'CLIMA_AEMET' && d.clave_dedupe !== previa.clave_dedupe && rangoDe(d) >= rangoDe(previa));
    Object.assign(previa, d);
    if (peor) previa.notificada_en = null;
    tocar(previa);
    actualizadas.push(previa);
  };

  // 1. Cerrar lo que ya no aplica: visita pasada, borrada, hecha, cancelada o movida a otro día.
  for (const a of alertas) {
    if (a.estado !== 'activa' || a.eliminado_en) continue;
    const v = visitas.get(a.entidad.id);
    if (a.fecha < hoy) cerrar(a, 'caducada');
    else if (!v || v.eliminado_en || v.estado !== 'programada' || v.fecha !== a.fecha) cerrar(a, a.tipo === 'CLIMA_MEJORA' ? 'caducada' : 'resuelta');
  }

  // 2. Evaluar cada visita programada de hoy a hoy + 6 (más allá no hay semáforo, §11.3).
  for (const v of e.visitas) {
    if (v.eliminado_en || v.estado !== 'programada') continue;
    const dias = diasEntre(hoy, v.fecha);
    if (dias < 0 || dias >= UMBRALES_ALERTAS.diasSemaforo) continue;
    const cliente = clientes.get(v.cliente_id);
    const clima = climaDe(v.cliente_id);
    const s = evaluarVisita({
      visita: { fecha: v.fecha, hora_inicio: v.hora_inicio, duracion: v.duracion, tipos_trabajo: v.tipos_trabajo },
      ubicacion: clima?.ubicacion ?? null,
      prevision: clima?.prevision ?? null,
      avisos: clima?.avisos ?? [],
      motivoSinPrevision: clima?.motivo,
      ahora: e.ahora,
    });

    // 2a. Aviso oficial (independiente del semáforo de lluvia/viento).
    const asuntoAemet = claveAsunto('aemet', v.id, v.fecha);
    const aviso = clima ? avisoMasGrave(clima.avisos, v.fecha) : null;
    if (aviso && dias <= UMBRALES_ALERTAS.diasAemet) fijar(datosAemet(v, cliente, aviso, s, hoy));
    else if (!aviso && clima) {
      const previa = activaDe(asuntoAemet);
      if (previa) cerrar(previa, 'resuelta');
    }

    // 2b. Semáforo. Gris («Sin previsión») u orientativo: no se crea ni se resuelve nada.
    if (s.nivel === 'gris' || s.orientativo) continue;
    const asunto = claveAsunto('clima', v.id, v.fecha);
    if (s.nivel === 'verde') {
      const previa = activaDe(asunto);
      if (previa) {
        cerrar(previa, 'resuelta');
        const asuntoMejora = claveAsunto('mejora', v.id, v.fecha);
        if (!alertas.some((a) => a.clave_asunto === asuntoMejora && a.estado === 'activa')) fijar(datosMejora(v, cliente, previa, hoy));
      }
      continue;
    }
    const prob = probLluvia(s) ?? 0;
    const decidir =
      s.nivel === 'rojo' &&
      (dias <= UMBRALES_ALERTAS.diasDecidir || (dias <= UMBRALES_ALERTAS.diasDecidirFuerte && prob >= UMBRALES_ALERTAS.probLluviaFuerte));
    const tipo = decidir ? 'CLIMA_DECIDIR' : dias <= UMBRALES_ALERTAS.diasInfo ? 'CLIMA_INFO' : null;
    if (!tipo) continue;
    // Si empeora otra vez, la mejora anterior ya no vale.
    const mejora = activaDe(claveAsunto('mejora', v.id, v.fecha));
    if (mejora) cerrar(mejora, 'caducada');
    fijar(datosClima(tipo, v, cliente, s, hoy));
  }

  const estado = { alertas, descartes };
  return {
    estado,
    nuevas,
    actualizadas,
    resueltas,
    caducadas,
    pendientes_de_aviso: alertas.filter((a) => a.estado === 'activa' && !a.eliminado_en && a.notificada_en === null),
  };
}

/** Marca como notificadas (tras incluirlas en el resumen diario o enviar la inmediata). */
export function marcarNotificadas(estado: EstadoAlertas, ids: string[], ahora: Date): EstadoAlertas {
  const iso = ahora.toISOString();
  return { ...estado, alertas: estado.alertas.map((a) => (ids.includes(a.id) ? { ...a, notificada_en: iso } : a)) };
}

/** Alertas visibles en la pantalla (§10.7): activas, ordenadas por sección, fecha y hora. */
export function alertasActivas(estado: EstadoAlertas): AlertaClima[] {
  const orden = { para_decidir: 0, para_tener_en_cuenta: 1 } as const;
  return estado.alertas
    .filter((a) => a.estado === 'activa' && !a.eliminado_en)
    .sort((a, b) => orden[a.seccion] - orden[b.seccion] || a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));
}

/** Número de la insignia de la campana: alertas activas que requieren decisión (§10.1.1: no cuenta las info). */
export function contarParaDecidir(estado: EstadoAlertas): number {
  return estado.alertas.filter((a) => a.estado === 'activa' && !a.eliminado_en && a.nivel !== 'info').length;
}
