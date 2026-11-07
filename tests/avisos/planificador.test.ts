// Planificador de avisos (ola 9; §12.1–§12.4). Función pura, sin base de datos. Criterios 28 y 29 de §18, resumen
// diario único, una sola vez por asunto, horas de silencio configurables, recordatorio antes de la visita y enlaces
// profundos.
import { describe, expect, it } from 'vitest';
import type { AlertaClima } from '../../src/dominio/alertas';
import type { Visita } from '../../src/domain/tipos';
import type { AlertaPreparacion } from '../../src/features/alertas/preparacion/motor';
import { CONFIG_POR_DEFECTO, type ConfigAvisos } from '../../src/features/avisos/config';
import { destinoDeUrl, enlaceA } from '../../src/features/avisos/enlaces';
import { planificar, type EntradaPlan, type Notificacion } from '../../src/features/avisos/planificador';
import { desdeMadrid, partesMadrid } from '../../src/lib/fechas';

const visita = (d: Partial<Visita>): Visita =>
  ({ id: 'v1', cliente_id: 'c1', fecha: '2026-11-08', hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['corte_cesped'], estado: 'programada', eliminado_en: null, ...d }) as Visita;
const clientes = [{ id: 'c1', nombre: 'Fam. García', telefono: '+34611566779' }, { id: 'c2', nombre: 'Sra. Morales', telefono: null }];

const clima = (d: Partial<AlertaClima>): AlertaClima =>
  ({
    id: 'a1', tipo: 'CLIMA_DECIDIR', nivel: 'decision', canal: 'resumen_diario', estado: 'activa', eliminado_en: null, clave_dedupe: 'clima:v9:2026-11-09:CLIMA_DECIDIR:rojo',
    texto_resumen: 'Lunes 9: lluvia en Fam. García. ¿La movemos?', titulo: 'Lunes 9 · Fam. García', cuerpo: 'Césped a las 09:00.', ...d,
  }) as AlertaClima;

const prep = (d: Partial<AlertaPreparacion>): AlertaPreparacion =>
  ({
    id: 'p1', tipo: 'FURGO_RESERVAR', nivel: 'decision', canales: ['resumen_diario'], clave_dedupe: 'furgo:reservar:2026-11-11:4', fecha: '2026-11-11', dias: 4,
    titulo: 'Miércoles 11 · Urb. El Olivar', cuerpo: 'Aún no la tienes reservada.', texto: 'Alquila la furgoneta para el miércoles 11 (Urb. El Olivar).',
    aviso_desde: null, ignora_silencio: false, acciones: [{ id: 'ya_reservada', texto: 'Ya la reservé' }], destino: { pantalla: 'preparar', fecha: '2026-11-11' }, ...d,
  }) as AlertaPreparacion;

function entrada(d: Partial<EntradaPlan>): EntradaPlan {
  return {
    ahora: desdeMadrid(2026, 11, 7, 21), config: CONFIG_POR_DEFECTO, visitas: [], clientes, alertasClima: [], alertasPreparacion: [],
    avisadosPreparacion: {}, registro: {}, lineaSemanal: null, ...d,
  };
}

/** Aplica lo enviado al registro, como hace envio.ts. */
function aplicar(e: EntradaPlan, plan: Notificacion[]): EntradaPlan {
  const iso = e.ahora.toISOString();
  const registro = { ...e.registro };
  const avisados = { ...e.avisadosPreparacion };
  for (const n of plan) {
    for (const c of n.marcar.registro) registro[c] = iso;
    for (const c of n.marcar.preparacion) avisados[c] = iso;
  }
  return { ...e, registro, avisadosPreparacion: avisados };
}

describe('Resumen diario (§12.3)', () => {
  it('a las 21:00, una sola notificación con título «Mañana: N visitas», lo que pide decisión primero y enlace a Alertas', () => {
    const e = entrada({
      visitas: [visita({}), visita({ id: 'v2', cliente_id: 'c2', hora_inicio: '16:00' })],
      alertasClima: [clima({ nivel: 'info', tipo: 'CLIMA_INFO', texto_resumen: 'Posible lluvia el jueves en Sra. Morales.', clave_dedupe: 'x:info' }), clima({})],
      alertasPreparacion: [prep({})],
    });
    const plan = planificar(e);
    expect(plan).toHaveLength(1);
    const [r] = plan;
    expect(r).toMatchObject({ tipo: 'RESUMEN_DIARIO', canal: 'resumen', titulo: 'Mañana: 2 visitas', enlace: '/?ir=alertas' });
    expect(r.cuerpo.split('\n')).toEqual([
      'Lunes 9: lluvia en Fam. García. ¿La movemos?',
      'Alquila la furgoneta para el miércoles 11 (Urb. El Olivar).',
      'Posible lluvia el jueves en Sra. Morales.',
    ]);
    expect(r.acciones).toEqual([{ texto: 'Ver', enlace: '/?ir=alertas' }]);
    expect(destinoDeUrl(r.enlace)).toEqual({ pantalla: 'alertas' });
  });

  it('antes de la hora no sale; ese día no se repite; al día siguiente sale otro sin repetir lo ya contado', () => {
    const base = entrada({ visitas: [visita({}), visita({ id: 'v3', fecha: '2026-11-09' })], alertasClima: [clima({})] });
    expect(planificar({ ...base, ahora: desdeMadrid(2026, 11, 7, 20, 55) })).toEqual([]);
    const plan = planificar(base);
    expect(plan.map((n) => n.titulo)).toEqual(['Mañana: 1 visita']);
    const despues = aplicar(base, plan);
    expect(planificar({ ...despues, ahora: desdeMadrid(2026, 11, 7, 21, 5) })).toEqual([]);
    // Domingo 8 a las 21:00: hay visita el lunes; la alerta ya se contó y no se repite (§12.1.4).
    const otro = planificar({ ...despues, ahora: desdeMadrid(2026, 11, 8, 21) });
    expect(otro).toHaveLength(1);
    expect(otro[0].cuerpo).toBe('La primera, a las 09:00 en Fam. García.');
  });

  it('con más de 3 cosas, como mucho 3 líneas: 2 y «Y N cosas más en Alertas.»', () => {
    const e = entrada({
      visitas: [visita({})],
      alertasPreparacion: [1, 2, 3, 4].map((i) => prep({ id: `p${i}`, clave_dedupe: `k${i}`, texto: `Cosa ${i}.` })),
    });
    const [r] = planificar(e);
    expect(r.cuerpo.split('\n')).toEqual(['Cosa 1.', 'Cosa 2.', 'Y 2 cosas más en Alertas.']);
    expect(r.marcar.preparacion).toHaveLength(4);
  });

  it('«Mañana no tienes visitas» solo si hay otra cosa que contar', () => {
    const [r] = planificar(entrada({ alertasPreparacion: [prep({})] }));
    expect(r.titulo).toBe('Mañana no tienes visitas');
  });

  it('criterio 28: sin visitas mañana ni alertas activas, no se envía resumen', () => {
    expect(planificar(entrada({}))).toEqual([]);
    // Ni con alertas ya contadas antes (no hay nada nuevo).
    const a = clima({});
    expect(planificar(entrada({ alertasClima: [a], registro: { [`clima|${a.clave_dedupe}`]: 'x' } }))).toEqual([]);
    // Ni con visitas de otros días.
    expect(planificar(entrada({ visitas: [visita({ fecha: '2026-11-10' })] }))).toEqual([]);
  });

  it('la hora del resumen se puede cambiar, y si cae en horas de silencio sale igual', () => {
    const v = [visita({})];
    const a20: ConfigAvisos = { ...CONFIG_POR_DEFECTO, horaResumen: '20:00' };
    expect(planificar(entrada({ visitas: v, config: a20, ahora: desdeMadrid(2026, 11, 7, 20) }))).toHaveLength(1);
    const a23: ConfigAvisos = { ...CONFIG_POR_DEFECTO, horaResumen: '23:00' };
    expect(planificar(entrada({ visitas: v, config: a23, ahora: desdeMadrid(2026, 11, 7, 23) }))).toHaveLength(1);
    // Con 21:00 y la app abierta solo a las 23:00 (silencio), no se manda tarde.
    expect(planificar(entrada({ visitas: v, ahora: desdeMadrid(2026, 11, 7, 23) }))).toEqual([]);
  });

  it('resumen semanal del domingo, solo si está activado', () => {
    const domingo = desdeMadrid(2026, 11, 8, 21);
    const linea = 'Esta semana cobraste 640 € en 6 trabajos.';
    expect(planificar(entrada({ ahora: domingo, lineaSemanal: linea }))[0].cuerpo).toBe(linea);
    expect(planificar(entrada({ ahora: domingo, lineaSemanal: linea, config: { ...CONFIG_POR_DEFECTO, resumenSemanal: false } }))).toEqual([]);
    expect(planificar(entrada({ lineaSemanal: linea }))).toEqual([]); // sábado: no
  });
});

describe('Criterio 29 · horas de silencio (22:00 a 08:00)', () => {
  it('en una noche entera, cada 5 minutos, solo salen en silencio los avisos que programó el usuario; el resto espera a las 08:00', () => {
    const aemet = clima({ id: 'aem', tipo: 'CLIMA_AEMET', canal: 'inmediata', clave_dedupe: 'aemet:v1:naranja', texto_resumen: 'Aviso naranja por viento el domingo en Fam. García.' });
    const compra = prep({
      id: 'c', tipo: 'COMPRA_RECORDATORIO', canales: ['inmediata'], clave_dedupe: 'compra:2026-11-11', ignora_silencio: true,
      aviso_desde: desdeMadrid(2026, 11, 7, 23).toISOString(), texto: 'Compra para el miércoles: gasolina de mezcla y sacos.',
    });
    const material = prep({ id: 'm', tipo: 'MATERIAL_REVISAR', canales: ['inmediata'], clave_dedupe: 'material:x', ignora_silencio: false, aviso_desde: desdeMadrid(2026, 11, 7, 22, 30).toISOString(), texto: 'Revisa el material.' });
    let e = entrada({
      visitas: [visita({ id: 'temprana', fecha: '2026-11-08', hora_inicio: '08:30' })],
      alertasClima: [aemet],
      alertasPreparacion: [compra, material],
      registro: { 'resumen|2026-11-07': 'ya' },
    });
    const enviados: { hora: number; minuto: number; tipo: string }[] = [];
    for (let t = desdeMadrid(2026, 11, 7, 21, 55).getTime(); t <= desdeMadrid(2026, 11, 8, 8, 30).getTime(); t += 5 * 60_000) {
      const ahora = new Date(t);
      const plan = planificar({ ...e, ahora });
      const p = partesMadrid(ahora);
      for (const n of plan) enviados.push({ hora: p.hora, minuto: p.minuto, tipo: n.tipo });
      e = aplicar({ ...e, ahora }, plan);
    }
    const enSilencio = (x: { hora: number }) => x.hora >= 22 || x.hora < 8;
    // AEMET, a las 21:55 (antes del silencio).
    expect(enviados.find((x) => x.tipo === 'CLIMA_AEMET')).toMatchObject({ hora: 21, minuto: 55 });
    // Lo que el usuario programó (recordatorio de compra) sale a su hora aunque sea de noche.
    expect(enviados.find((x) => x.tipo === 'COMPRA_RECORDATORIO')).toMatchObject({ hora: 23, minuto: 0 });
    // Lo demás que cae en silencio espera a las 08:00: material (22:30) y el recordatorio de la visita de las 08:30 (07:30).
    expect(enviados.find((x) => x.tipo === 'MATERIAL_REVISAR')).toMatchObject({ hora: 8, minuto: 0 });
    expect(enviados.find((x) => x.tipo === 'VISITA_PREVIA')).toMatchObject({ hora: 8, minuto: 0 });
    expect(enviados.filter(enSilencio).map((x) => x.tipo)).toEqual(['COMPRA_RECORDATORIO']);
    // Ninguno se repite.
    expect(new Set(enviados.map((x) => x.tipo)).size).toBe(enviados.length);
  });

  it('las horas de silencio se pueden cambiar (de 23:00 a 07:00)', () => {
    const material = prep({ tipo: 'MATERIAL_REVISAR', canales: ['inmediata'], aviso_desde: desdeMadrid(2026, 11, 7, 22, 30).toISOString() });
    const cfg: ConfigAvisos = { ...CONFIG_POR_DEFECTO, silencioDesde: '23:00', silencioHasta: '07:00' };
    const e = entrada({ alertasPreparacion: [material], ahora: desdeMadrid(2026, 11, 7, 22, 30), registro: { 'resumen|2026-11-07': 'ya' } });
    expect(planificar(e)).toEqual([]);
    expect(planificar({ ...e, config: cfg }).map((n) => n.tipo)).toEqual(['MATERIAL_REVISAR']);
  });
});

describe('Recordatorio antes de la visita (VISITA_PREVIA)', () => {
  const hoy = (h: number, m = 0) => desdeMadrid(2026, 11, 8, h, m);
  const v = visita({ id: 'v7', fecha: '2026-11-08', hora_inicio: '11:30', cliente_id: 'c1', tipos_trabajo: ['piscina'] });
  it('60 minutos antes por defecto, con «Cómo llegar» y «Llamar» y enlace a la visita', () => {
    expect(planificar(entrada({ visitas: [v], ahora: hoy(10, 25) }))).toEqual([]);
    const [n] = planificar(entrada({ visitas: [v], ahora: hoy(10, 30) }));
    expect(n).toMatchObject({ tipo: 'VISITA_PREVIA', titulo: '11:30 Fam. García', cuerpo: 'Piscina.', enlace: '/?ir=visita&id=v7' });
    expect(n.acciones).toEqual([
      { texto: 'Cómo llegar', enlace: '/?ir=visita&id=v7' },
      { texto: 'Llamar', enlace: 'tel:+34611566779' },
    ]);
    expect(planificar(entrada({ visitas: [v], ahora: hoy(11, 30) }))).toEqual([]); // ya empezó
  });
  it('configurable (30 min) o desactivado', () => {
    expect(planificar(entrada({ visitas: [v], ahora: hoy(10, 30), config: { ...CONFIG_POR_DEFECTO, recordatorioVisita: 30 } }))).toEqual([]);
    expect(planificar(entrada({ visitas: [v], ahora: hoy(11), config: { ...CONFIG_POR_DEFECTO, recordatorioVisita: 30 } }))).toHaveLength(1);
    expect(planificar(entrada({ visitas: [v], ahora: hoy(11), config: { ...CONFIG_POR_DEFECTO, recordatorioVisita: 0 } }))).toEqual([]);
  });
});

describe('Enlaces profundos (§12.1.5)', () => {
  it('ida y vuelta de cada pantalla', () => {
    for (const d of [
      { pantalla: 'alertas' }, { pantalla: 'hoy' }, { pantalla: 'agenda' }, { pantalla: 'visita', id: 'abc' }, { pantalla: 'preparar', fecha: '2026-11-11' },
      { pantalla: 'movimientos', filtro: 'fianzas' }, { pantalla: 'ajustes', ajuste: 'avisos' },
    ] as const) {
      expect(destinoDeUrl(`https://fergo.app${enlaceA(d)}`)).toEqual(d);
    }
    expect(destinoDeUrl('/?ir=preparar&fecha=mañana')).toBeNull();
    expect(destinoDeUrl('/')).toBeNull();
  });
  it('los avisos de preparación abren Preparar trabajo de ese día', () => {
    const recoger = prep({ tipo: 'FURGO_RECOGER', canales: ['inmediata'], clave_dedupe: 'r', aviso_desde: desdeMadrid(2026, 11, 10, 19).toISOString(), ignora_silencio: true, texto: '¿Ya recogiste la furgoneta?' });
    const [n] = planificar(entrada({ alertasPreparacion: [recoger], ahora: desdeMadrid(2026, 11, 10, 19), registro: { 'resumen|2026-11-10': 'ya' } }));
    expect(n).toMatchObject({ tipo: 'FURGO_RECOGER', enlace: '/?ir=preparar&fecha=2026-11-11' });
  });
});
