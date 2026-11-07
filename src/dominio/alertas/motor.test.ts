// Motor de alertas de clima (ola 7, frente A): niveles, textos y deduplicación (§12, §5.2.3).
import { describe, expect, it } from 'vitest';
import type { AvisoOficial, Ubicacion } from '../../clima';
import type { Cliente, Visita } from '../../domain/tipos';
import { desdeMadrid } from '../../lib/fechas';
import { combinar, lluviaManana, previsionFija } from './fixtures/clima';
import { alertasActivas, contarParaDecidir, estadoVacio, marcarNotificadas, recalcularAlertas, type EntradaRecalculo } from './motor';
import type { ClimaCliente, EstadoAlertas } from './tipos';

const HOY = '2026-11-07'; // sábado
const AHORA = desdeMadrid(2026, 11, 7, 10);
const U: Ubicacion = { lat: 40.4, lon: -3.7 };

const cliente = (id: string, nombre: string): Cliente => ({ id, nombre, lat: U.lat, lon: U.lon }) as Cliente;
function visita(id: string, fecha: string, d: Partial<Visita> = {}): Visita {
  return {
    id, negocio_id: 'n', creado_en: '', actualizado_en: '', creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1,
    cliente_id: 'c1', fecha, hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: 15000,
    incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0, estado: 'programada', serie_id: null, fecha_serie: null,
    reprogramada_desde: null, motivo_reprogramacion: null, motivo_cancelacion: '', hecha_en: null, ...d,
  };
}
const clima = (cambios: Parameters<typeof previsionFija>[2], avisos: AvisoOficial[] = []): ClimaCliente => ({ ubicacion: U, prevision: previsionFija(U, HOY, cambios), avisos });

let n = 0;
function entrada(visitas: Visita[], c: ClimaCliente | undefined, estado: EstadoAlertas = estadoVacio(), ahora = AHORA): EntradaRecalculo {
  return {
    estado, visitas, clientes: [cliente('c1', 'Fam. García')], clima: new Map(c ? [['c1', c]] : []), ahora, usuario: 'u-felipe', negocio: 'n-fergo',
    nuevoId: () => `a${++n}`,
  };
}

describe('Niveles y textos (§12.2, §10.7)', () => {
  it('rojo a 2 días → CLIMA_DECIDIR con texto «Mejor mover», no sólo color', () => {
    const r = recalcularAlertas(entrada([visita('v1', '2026-11-09')], clima(lluviaManana('2026-11-09'))));
    expect(r.nuevas).toHaveLength(1);
    const a = r.nuevas[0];
    expect(a).toMatchObject({
      tipo: 'CLIMA_DECIDIR', nivel: 'decision', seccion: 'para_decidir', canal: 'resumen_diario', semaforo: 'rojo', estado_semaforo: 'Mejor mover',
      etiqueta_superior: 'MEJOR MOVER · EN 2 DÍAS', dato_clave: '80% lluvia', titulo: 'Lunes 9 · Fam. García', fecha: '2026-11-09', hora: '09:00',
      texto_resumen: 'Lunes 9: lluvia en Fam. García. ¿La movemos?', causa: 'lluvia', cliente_id: 'c1', entidad: { tipo: 'visita', id: 'v1' },
      clave_asunto: 'clima:v1:2026-11-09', clave_dedupe: 'clima:v1:2026-11-09:CLIMA_DECIDIR:rojo', estado: 'activa', notificada_en: null,
      accion_principal: { id: 'mover', texto: 'Mover y avisar por WhatsApp Business' }, accion_secundaria: { id: 'mantener', texto: 'Mantener la visita' },
      creado_por: 'u-felipe', modificado_por: 'u-felipe', negocio_id: 'n-fergo', eliminado_en: null, version: 1,
    });
    expect(a.cuerpo).toMatch(/^Césped a las 09:00\. /);
    expect(r.pendientes_de_aviso).toEqual([a]);
  });

  it('rojo con prob. ≥ 80 % a 4 días → decidir; con 70 % a 4 días o con 80 % a 5 días → sólo info', () => {
    const decidir = recalcularAlertas(entrada([visita('v1', '2026-11-11')], clima(lluviaManana('2026-11-11', 80))));
    expect(decidir.nuevas[0].tipo).toBe('CLIMA_DECIDIR');
    const info70 = recalcularAlertas(entrada([visita('v1', '2026-11-11')], clima(lluviaManana('2026-11-11', 70))));
    expect(info70.nuevas[0]).toMatchObject({ tipo: 'CLIMA_INFO', nivel: 'info', seccion: 'para_tener_en_cuenta', semaforo: 'rojo' });
    const info5 = recalcularAlertas(entrada([visita('v1', '2026-11-12')], clima(lluviaManana('2026-11-12', 80))));
    expect(info5.nuevas[0]).toMatchObject({ tipo: 'CLIMA_INFO', etiqueta_superior: 'MEJOR MOVER · EN 5 DÍAS', texto_resumen: 'Posible lluvia el jueves en Fam. García.' });
  });

  it('ámbar → CLIMA_INFO «Con cuidado»; nunca decidir', () => {
    const r = recalcularAlertas(entrada([visita('v1', '2026-11-08')], clima(lluviaManana('2026-11-08', 45, 0))));
    expect(r.nuevas[0]).toMatchObject({ tipo: 'CLIMA_INFO', semaforo: 'ambar', estado_semaforo: 'Con cuidado', etiqueta_superior: 'CON CUIDADO · MAÑANA', texto_resumen: 'Posible lluvia mañana en Fam. García.' });
  });

  it('sin alerta: verde, a 6 días, orientativo (≥ 7 días), «Sin previsión», hechas y canceladas', () => {
    const lluviaSiempre = () => ({ prob_precipitacion: 90, precipitacion: 4 });
    expect(recalcularAlertas(entrada([visita('v1', '2026-11-09')], clima(() => null))).nuevas).toEqual([]);
    expect(recalcularAlertas(entrada([visita('v1', '2026-11-13')], clima(lluviaSiempre))).nuevas).toEqual([]); // 6 días
    expect(recalcularAlertas(entrada([visita('v1', '2026-11-15')], clima(lluviaSiempre))).nuevas).toEqual([]); // 8 días
    expect(recalcularAlertas(entrada([visita('v1', '2026-11-09')], undefined)).nuevas).toEqual([]); // sin clima
    expect(recalcularAlertas(entrada([visita('v1', '2026-11-09')], { ubicacion: U, prevision: null, avisos: [], motivo: 'Sin conexión' })).nuevas).toEqual([]);
    expect(recalcularAlertas(entrada([visita('v1', '2026-11-09', { estado: 'hecha' }), visita('v2', '2026-11-09', { estado: 'cancelada' })], clima(lluviaSiempre))).nuevas).toEqual([]);
  });

  it('gana el más restrictivo: poda + fitosanitarios con viento de 25 km/h → rojo, causa viento', () => {
    const r = recalcularAlertas(entrada([visita('v1', '2026-11-09', { tipos_trabajo: ['setos_poda', 'fitosanitarios'] })], clima(() => ({ viento: 25, rachas: 30 }))));
    expect(r.nuevas[0]).toMatchObject({ tipo: 'CLIMA_DECIDIR', semaforo: 'rojo', causa: 'viento', dato_clave: 'Viento 25 km/h', texto_resumen: 'Lunes 9: viento en Fam. García. ¿La movemos?' });
    expect(r.nuevas[0].cuerpo).toMatch(/^Setos y poda y Fitosanitarios a las 09:00\./);
  });
});

describe('Deduplicación (§5.2.3, §12.1.4)', () => {
  const v = [visita('v1', '2026-11-09')];
  const rojo = clima(lluviaManana('2026-11-09'));
  const ambar = clima(lluviaManana('2026-11-09', 45, 0));

  it('recalcular varias veces con lo mismo no duplica ni vuelve a avisar', () => {
    let r = recalcularAlertas(entrada(v, rojo));
    const id = r.nuevas[0].id;
    let estado = marcarNotificadas(r.estado, [id], AHORA);
    for (let i = 0; i < 3; i++) {
      r = recalcularAlertas(entrada(v, rojo, estado));
      expect(r.nuevas).toEqual([]);
      expect(r.actualizadas).toEqual([]);
      expect(r.pendientes_de_aviso).toEqual([]);
      estado = r.estado;
    }
    expect(estado.alertas).toHaveLength(1);
    expect(estado.alertas[0].id).toBe(id);
  });

  it('si empeora (ámbar → rojo) se actualiza la misma alerta y se vuelve a avisar', () => {
    const r1 = recalcularAlertas(entrada(v, ambar));
    const estado = marcarNotificadas(r1.estado, [r1.nuevas[0].id], AHORA);
    const r2 = recalcularAlertas(entrada(v, rojo, estado));
    expect(r2.nuevas).toEqual([]);
    expect(r2.actualizadas).toHaveLength(1);
    expect(r2.estado.alertas).toHaveLength(1);
    expect(r2.actualizadas[0]).toMatchObject({ id: r1.nuevas[0].id, tipo: 'CLIMA_DECIDIR', semaforo: 'rojo', notificada_en: null, version: 2 });
    expect(r2.actualizadas[0].clave_dedupe).toBe('clima:v1:2026-11-09:CLIMA_DECIDIR:rojo');
    expect(r2.pendientes_de_aviso).toHaveLength(1);
  });

  it('si mejora (rojo → ámbar) se actualiza en silencio, sin volver a avisar', () => {
    const r1 = recalcularAlertas(entrada(v, rojo));
    const estado = marcarNotificadas(r1.estado, [r1.nuevas[0].id], AHORA);
    const r2 = recalcularAlertas(entrada(v, ambar, estado));
    expect(r2.actualizadas[0]).toMatchObject({ id: r1.nuevas[0].id, tipo: 'CLIMA_INFO', semaforo: 'ambar' });
    expect(r2.actualizadas[0].notificada_en).not.toBeNull();
    expect(r2.pendientes_de_aviso).toEqual([]);
  });

  it('al subir de escalón (info a 5 días → decidir a 2 días) es la misma alerta y vuelve a avisar', () => {
    const vj = [visita('v1', '2026-11-12')];
    const c = clima(lluviaManana('2026-11-12', 70));
    const r1 = recalcularAlertas(entrada(vj, c));
    expect(r1.nuevas[0].tipo).toBe('CLIMA_INFO');
    const estado = marcarNotificadas(r1.estado, [r1.nuevas[0].id], AHORA);
    // Tres días después (martes 10): la previsión del jueves sigue en rojo.
    const martes = desdeMadrid(2026, 11, 10, 10);
    const c2: ClimaCliente = { ubicacion: U, prevision: previsionFija(U, '2026-11-10', lluviaManana('2026-11-12', 70)), avisos: [] };
    const r2 = recalcularAlertas(entrada(vj, c2, estado, martes));
    expect(r2.estado.alertas).toHaveLength(1);
    expect(r2.actualizadas[0]).toMatchObject({ id: r1.nuevas[0].id, tipo: 'CLIMA_DECIDIR', etiqueta_superior: 'MEJOR MOVER · EN 2 DÍAS', notificada_en: null });
  });

  it('si mejora a verde se resuelve sin regañar y queda una sola «mejora» informativa', () => {
    const r1 = recalcularAlertas(entrada(v, rojo));
    const r2 = recalcularAlertas(entrada(v, clima(() => null), r1.estado));
    expect(r2.resueltas.map((a) => a.id)).toEqual([r1.nuevas[0].id]);
    expect(r2.nuevas).toHaveLength(1);
    expect(r2.nuevas[0]).toMatchObject({
      tipo: 'CLIMA_MEJORA', nivel: 'info', semaforo: 'verde', estado_semaforo: 'Se puede ir', accion_principal: { id: 'vale', texto: 'Vale' },
      texto_resumen: 'Ya no se prevé lluvia el lunes en Fam. García. Mantén la visita.', cuerpo: 'Ya no se prevé lluvia. Mantén la visita.',
    });
    expect(`${r2.nuevas[0].cuerpo} ${r2.nuevas[0].texto_resumen}`).not.toMatch(/!/);
    const r3 = recalcularAlertas(entrada(v, clima(() => null), r2.estado));
    expect(r3.nuevas).toEqual([]);
    expect(alertasActivas(r3.estado).map((a) => a.tipo)).toEqual(['CLIMA_MEJORA']);
    // Si vuelve a empeorar, la mejora caduca y vuelve la alerta.
    const r4 = recalcularAlertas(entrada(v, rojo, r3.estado));
    expect(r4.caducadas.map((a) => a.tipo)).toEqual(['CLIMA_MEJORA']);
    expect(alertasActivas(r4.estado).map((a) => a.tipo)).toEqual(['CLIMA_DECIDIR']);
  });

  it('«Mantener la visita» (descarte): no vuelve salvo que empeore por encima de lo descartado', () => {
    const r1 = recalcularAlertas(entrada(v, ambar));
    const asunto = r1.nuevas[0].clave_asunto;
    const conDescarte = (rango: number): EstadoAlertas => ({
      alertas: r1.estado.alertas.map((a) => ({ ...a, estado: 'descartada' as const })),
      descartes: [{ clave_asunto: asunto, rango, descartado_en: '', descartado_por: 'u-felipe' }],
    });
    expect(alertasActivas(recalcularAlertas(entrada(v, ambar, conDescarte(1))).estado)).toEqual([]);
    const peor = recalcularAlertas(entrada(v, rojo, conDescarte(1)));
    expect(peor.nuevas).toHaveLength(1);
    expect(peor.nuevas[0].semaforo).toBe('rojo');
    expect(alertasActivas(recalcularAlertas(entrada(v, rojo, conDescarte(2))).estado)).toEqual([]);
  });

  it('visita movida, cancelada o pasada: la alerta se cierra', () => {
    const r1 = recalcularAlertas(entrada(v, rojo));
    const movida = recalcularAlertas(entrada([visita('v1', '2026-11-10')], clima(() => null), r1.estado));
    expect(movida.resueltas).toHaveLength(1);
    expect(alertasActivas(movida.estado)).toEqual([]);
    const cancelada = recalcularAlertas(entrada([visita('v1', '2026-11-09', { estado: 'cancelada' })], rojo, r1.estado));
    expect(cancelada.resueltas).toHaveLength(1);
    const pasada = recalcularAlertas(entrada(v, rojo, r1.estado, desdeMadrid(2026, 11, 10, 10)));
    expect(pasada.caducadas).toHaveLength(1);
    expect(pasada.caducadas[0].estado).toBe('caducada');
  });
});

describe('Aviso oficial AEMET (CLIMA_AEMET)', () => {
  const aviso = (nivel: AvisoOficial['nivel'], fecha = '2026-11-09'): AvisoOficial => ({ fecha, nivel, fenomeno: 'viento' });
  const v = [visita('v1', '2026-11-09', { tipos_trabajo: ['piscina'] })];

  it('aviso naranja → alerta inmediata de decisión y, además, semáforo rojo', () => {
    const r = recalcularAlertas(entrada(v, clima(() => null, [aviso('naranja')])));
    const aemet = r.nuevas.find((a) => a.tipo === 'CLIMA_AEMET')!;
    expect(aemet).toMatchObject({
      nivel: 'decision', canal: 'inmediata', seccion: 'para_decidir', semaforo: 'rojo', estado_semaforo: 'Mejor mover',
      etiqueta_superior: 'AVISO AEMET · EN 2 DÍAS', dato_clave: 'Naranja por viento', texto_resumen: 'Aviso naranja por viento el lunes en Fam. García.',
      clave_dedupe: 'aemet:v1:2026-11-09:CLIMA_AEMET:viento-naranja', accion_principal: { id: 'ver_opciones' },
    });
    expect(r.nuevas.find((a) => a.tipo === 'CLIMA_DECIDIR')).toMatchObject({ semaforo: 'rojo' });
    expect(contarParaDecidir(r.estado)).toBe(2);
  });

  it('amarillo → ámbar; si sube a naranja es la misma alerta y vuelve a avisar; si desaparece, se resuelve', () => {
    const r1 = recalcularAlertas(entrada(v, clima(() => null, [aviso('amarillo')])));
    const a1 = r1.nuevas.find((a) => a.tipo === 'CLIMA_AEMET')!;
    expect(a1).toMatchObject({ semaforo: 'ambar', dato_clave: 'Amarillo por viento' });
    const estado = marcarNotificadas(r1.estado, r1.nuevas.map((a) => a.id), AHORA);
    const r2 = recalcularAlertas(entrada(v, clima(() => null, [aviso('naranja')]), estado));
    const a2 = r2.actualizadas.find((a) => a.tipo === 'CLIMA_AEMET')!;
    expect(a2).toMatchObject({ id: a1.id, dato_clave: 'Naranja por viento', notificada_en: null });
    const r3 = recalcularAlertas(entrada(v, clima(() => null, []), r2.estado));
    expect(r3.resueltas.some((a) => a.id === a1.id)).toBe(true);
  });

  it('más de 3 días antes no hay alerta de aviso oficial', () => {
    const r = recalcularAlertas(entrada([visita('v1', '2026-11-11', { tipos_trabajo: ['piscina'] })], clima(() => null, [aviso('naranja', '2026-11-11')])));
    expect(r.nuevas.some((a) => a.tipo === 'CLIMA_AEMET')).toBe(false);
  });
});

it('alertasActivas: primero «para decidir», después por fecha; la insignia no cuenta las informativas', () => {
  const vs = [visita('v1', '2026-11-12'), visita('v2', '2026-11-09'), visita('v3', '2026-11-08')];
  const c = clima(combinar(lluviaManana('2026-11-12', 70), lluviaManana('2026-11-09'), lluviaManana('2026-11-08', 45, 0)));
  const r = recalcularAlertas(entrada(vs, c));
  expect(alertasActivas(r.estado).map((a) => `${a.tipo}@${a.fecha}`)).toEqual(['CLIMA_DECIDIR@2026-11-09', 'CLIMA_INFO@2026-11-08', 'CLIMA_INFO@2026-11-12']);
  expect(contarParaDecidir(r.estado)).toBe(1);
});
