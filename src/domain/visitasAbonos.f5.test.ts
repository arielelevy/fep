import { describe, expect, it } from 'vitest';
import { fechasSerie, estadoCobroVisita } from './agenda';
import { cobroEsperadoDelMes, cobrosEsperadosAbono, cuotaAPreguntar, totalAbonosEsperados } from './abonosEsperados';
import { calcularPendientes, cuotasVencidas, totalPendiente } from './pendientes';
import type { Cliente, Deuda, Movimiento, SerieRecurrente, Visita } from './tipos';
import { desdeMadrid, diaSemanaDeClave } from '../lib/fechas';

// Ola 5 · frente B. Pruebas puras contra la especificación §18 (criterios 12 y 13) y §8.4, §8.5, §9.4.

const comunes = { negocio_id: 'n', actualizado_en: '', creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1 };

const cliente = (extra: Partial<Cliente> = {}): Cliente => ({
  id: 'c1', ...comunes, creado_en: '2026-09-15T10:00:00Z', nombre: 'Fam. García', tipo: 'particular', telefono: null, telefono_2: null,
  contacto: '', direccion: '', municipio: '', lat: null, lon: null, servicios: ['jardin'], modalidad: 'abono', cuota_abono: 9000,
  dia_cobro_abono: 1, frecuencia_visitas: 'quincenal', dias_preferidos: [], hora_preferida: null, duracion_habitual: 120,
  tipos_trabajo_habituales: [], precio_habitual: null, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0,
  notas: '', activo: true, ...extra,
});

const cobroAbono = (periodo: string, importe: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m-${periodo}`, ...comunes, creado_en: '', tipo: 'cobro', importe, fecha: `${periodo}-02T10:00:00Z`, categoria_id: null,
  medio_pago: 'bizum', cliente_id: 'c1', nota: '', foto_id: null, es_inversion: false, con_iva: null, base: null, cuota_iva: null,
  saldos: [{ clave: `abono:${periodo}`, importe }], periodo_abono: periodo, ...extra,
});

describe('Criterio 12 · cobro esperado del abono el día de cobro (§9.4)', () => {
  // Alta el 15 de septiembre con día de cobro 1: la primera cuota es la de octubre.
  const c = cliente();

  it('el día 1 se genera el cobro esperado del mes y suma a «Te deben»', () => {
    const antes = calcularPendientes([c], [], [], desdeMadrid(2026, 10, 31, 23, 30));
    const dia1 = calcularPendientes([c], [], [], desdeMadrid(2026, 11, 1, 0, 5));
    expect(dia1.find((p) => p.periodo === '2026-11')).toMatchObject({ clave: 'abono:2026-11', importe: 9000, pendiente: 9000, desde: '2026-11-01', concepto: 'Abono de noviembre' });
    expect(antes.find((p) => p.periodo === '2026-11')).toBeUndefined();
    expect(totalPendiente(dia1) - totalPendiente(antes)).toBe(9000);
  });

  it('el día 1 cuenta en hora de Madrid, no en UTC', () => {
    // 31 oct 23:30 UTC = 1 nov 00:30 en Madrid (horario de invierno, UTC+1).
    const p = calcularPendientes([c], [], [], new Date('2026-10-31T23:30:00Z'));
    expect(p.map((x) => x.periodo)).toContain('2026-11');
  });

  it('se genera una sola vez por mes, aunque pasen los días', () => {
    const p = calcularPendientes([c], [], [], desdeMadrid(2026, 11, 20)).filter((x) => x.periodo === '2026-11');
    expect(p).toHaveLength(1);
    expect(cuotasVencidas(c, '2026-12-01').map((x) => x.periodo)).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('respeta otro día de cobro (el 10 no vence el 9)', () => {
    const c10 = cliente({ dia_cobro_abono: 10 });
    expect(cuotasVencidas(c10, '2026-11-09').map((x) => x.periodo)).toEqual(['2026-10']);
    expect(cuotasVencidas(c10, '2026-11-10').map((x) => x.periodo)).toEqual(['2026-10', '2026-11']);
  });

  it('queda pendiente hasta registrar el cobro con periodo_abono de ese mes; el parcial deja el resto', () => {
    const hoy = desdeMadrid(2026, 11, 5);
    const conOctubre = calcularPendientes([c], [], [cobroAbono('2026-10', 9000)], hoy);
    expect(conOctubre.map((p) => p.periodo)).toEqual(['2026-11']);
    expect(totalPendiente(conOctubre)).toBe(9000);
    const parcial = calcularPendientes([c], [], [cobroAbono('2026-10', 9000), cobroAbono('2026-11', 4000, { id: 'm-p' })], hoy);
    expect(totalPendiente(parcial)).toBe(5000);
    // Un cobro borrado (deshacer) devuelve el pendiente.
    const borrado = calcularPendientes([c], [], [cobroAbono('2026-10', 9000, { eliminado_en: '2026-11-02T11:00:00Z' })], hoy);
    expect(totalPendiente(borrado)).toBe(18000);
  });

  it('el cobro de otro cliente no salda este abono', () => {
    const p = calcularPendientes([c], [], [cobroAbono('2026-11', 9000, { cliente_id: 'otro' })], desdeMadrid(2026, 11, 1, 9));
    expect(totalPendiente(p)).toBe(18000);
  });

  it('clientes puntuales, inactivos o borrados no generan cobro esperado (§8.2)', () => {
    const hoy = desdeMadrid(2026, 11, 1, 9);
    expect(calcularPendientes([cliente({ modalidad: 'puntual', cuota_abono: null })], [], [], hoy)).toEqual([]);
    expect(calcularPendientes([cliente({ activo: false })], [], [], hoy)).toEqual([]);
    expect(calcularPendientes([cliente({ eliminado_en: '2026-10-20T10:00:00Z' })], [], [], hoy)).toEqual([]);
  });
});

describe('Criterio 13 · serie quincenal (§8.5), parte pura', () => {
  const serie: Pick<SerieRecurrente, 'regla' | 'fecha_inicio' | 'fecha_fin'> = {
    regla: { frecuencia: 'quincenal', dias_semana: [2], hora: '10:00', duracion: 120 }, // martes
    fecha_inicio: '2026-11-03',
    fecha_fin: null,
  };

  it('cada 15 días en el mismo día de la semana, desde el inicio', () => {
    const f = fechasSerie(serie, '2026-11-01', '2026-12-31');
    expect(f).toEqual(['2026-11-03', '2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29']);
    expect(f.every((d) => diaSemanaDeClave(d) === 2)).toBe(true);
  });

  it('una ventana que empieza a mitad de serie mantiene la cadencia (no se reinicia)', () => {
    expect(fechasSerie(serie, '2026-11-18', '2026-12-16')).toEqual(['2026-12-01', '2026-12-15']);
  });

  it('respeta fecha_fin (incluida) y no genera nada antes del inicio', () => {
    expect(fechasSerie({ ...serie, fecha_fin: '2026-12-01' }, '2026-10-01', '2026-12-31')).toEqual(['2026-11-03', '2026-11-17', '2026-12-01']);
    expect(fechasSerie(serie, '2026-10-01', '2026-11-02')).toEqual([]);
  });

  it('8 semanas de antelación dan 4 visitas quincenales', () => {
    expect(fechasSerie(serie, '2026-11-03', '2026-12-28')).toHaveLength(4);
  });
});

describe('Criterios 9 y 10 · estado de cobro de una visita hecha (§8.4, §9.4), parte pura', () => {
  const visita = (extra: Partial<Visita> = {}): Visita => ({
    id: 'v1', ...comunes, creado_en: '', cliente_id: 'c1', fecha: '2026-11-07', hora_inicio: '10:00', duracion: 120,
    tipos_trabajo: ['setos_poda'], descripcion: 'Poda de setos', precio: 15000, incluida_en_abono: false, requiere_vehiculo: false,
    ayudantes: 0, estado: 'hecha', serie_id: null, fecha_serie: null, reprogramada_desde: null, motivo_reprogramacion: null,
    motivo_cancelacion: '', hecha_en: '2026-11-07T11:00:00Z', ...extra,
  });
  const deuda: Deuda = { id: 'd1', ...comunes, creado_en: '', cliente_id: 'c1', concepto: 'Poda de setos', importe: 15000, fecha: '2026-11-07T11:00:00Z', visita_id: 'v1' };
  const cobro = (importe: number): Movimiento => ({
    id: 'm1', ...comunes, creado_en: '', tipo: 'cobro', importe, fecha: '2026-11-07T11:00:00Z', categoria_id: null, medio_pago: 'efectivo',
    cliente_id: 'c1', nota: '', foto_id: null, es_inversion: false, con_iva: null, base: null, cuota_iva: null, saldos: [{ clave: 'deuda:d1', importe }],
  });

  it('cobrada entera, parcial o pendiente', () => {
    expect(estadoCobroVisita(visita(), [deuda], [cobro(15000)])).toEqual({ estado: 'cobrada', pendiente: 0, cobrado: 15000 });
    expect(estadoCobroVisita(visita(), [deuda], [cobro(5000)])).toEqual({ estado: 'parcial', pendiente: 10000, cobrado: 5000 });
    expect(estadoCobroVisita(visita(), [deuda], [])).toEqual({ estado: 'pendiente', pendiente: 15000, cobrado: 0 });
  });

  it('no aplica a visitas de abono, sin precio o no hechas', () => {
    expect(estadoCobroVisita(visita({ incluida_en_abono: true, precio: null }), [], []).estado).toBe('no_aplica');
    expect(estadoCobroVisita(visita({ precio: null }), [], []).estado).toBe('no_aplica');
    expect(estadoCobroVisita(visita({ estado: 'programada' }), [deuda], []).estado).toBe('no_aplica');
  });

  it('la deuda pendiente de la visita suma a «Te deben» del cliente', () => {
    const c = cliente({ modalidad: 'puntual', cuota_abono: null });
    const p = calcularPendientes([c], [deuda], [], desdeMadrid(2026, 11, 7, 18));
    expect(totalPendiente(p)).toBe(15000);
  });
});

describe('Criterio 12 · cobros esperados de abono (abonosEsperados.ts, frente C)', () => {
  const c = cliente();

  it('el día 1 aparece el cobro esperado del mes; el 31 todavía no', () => {
    expect(cobroEsperadoDelMes(c, [], desdeMadrid(2026, 10, 31, 23, 30))?.periodo).toBe('2026-10');
    expect(cobroEsperadoDelMes(c, [], desdeMadrid(2026, 11, 1, 0, 5))).toMatchObject({ cliente_id: 'c1', periodo: '2026-11', vence: '2026-11-01', cuota: 9000, cobrado: 0, pendiente: 9000 });
    const lista = cobrosEsperadosAbono([c], [], desdeMadrid(2026, 11, 1, 0, 5));
    expect(lista.map((e) => e.periodo)).toEqual(['2026-10', '2026-11']);
    // Coincide con lo que suma «Te deben».
    expect(totalAbonosEsperados(lista)).toBe(totalPendiente(calcularPendientes([c], [], [], desdeMadrid(2026, 11, 1, 0, 5))));
  });

  it('el cobro con periodo_abono lo quita; el parcial deja el resto', () => {
    const hoy = desdeMadrid(2026, 11, 3);
    expect(cobroEsperadoDelMes(c, [cobroAbono('2026-11', 9000)], hoy)).toBeNull();
    expect(cobroEsperadoDelMes(c, [cobroAbono('2026-11', 4000)], hoy)?.pendiente).toBe(5000);
    // «¿Te pagó el abono de [mes]?» pregunta por la más antigua sin cobrar.
    expect(cuotaAPreguntar(c, [cobroAbono('2026-11', 9000)], hoy)?.periodo).toBe('2026-10');
    expect(cuotaAPreguntar(c, [cobroAbono('2026-10', 9000, { id: 'a' }), cobroAbono('2026-11', 9000, { id: 'b' })], hoy)).toBeNull();
  });

  it('clientes puntuales o inactivos no tienen cobros esperados', () => {
    const hoy = desdeMadrid(2026, 11, 1, 9);
    expect(cobrosEsperadosAbono([cliente({ modalidad: 'puntual', cuota_abono: null }), cliente({ id: 'c2', activo: false })], [], hoy)).toEqual([]);
  });
});
