import { describe, expect, it } from 'vitest';
import { cobroEsperadoDelMes, cobrosEsperadosAbono, cuotaAPreguntar, debePreguntarAbono, totalAbonosEsperados } from './abonosEsperados';
import { calcularPendientes, totalPendiente } from './pendientes';
import { lunesDe, mostrarResumenSemanal, resumenSemanal, textoMejora, textoResumenSemanal } from './resumenSemanal';
import type { Cliente, Deuda, Movimiento, Visita } from './tipos';
import { avisoContextual, contadorHechas, lineaVisita, proximaPendiente, textoManana, textoServicio, tipoCobroVisita, visitasDeHoy } from './visitasHoy';

// Pruebas propias del frente C (ola 5): abonos esperados (criterio 12), resumen semanal, tarjetas y aviso de Hoy.

const comunes = (id: string, creado = '2026-08-15T10:00:00Z') => ({
  id, negocio_id: 'n', creado_en: creado, actualizado_en: creado, creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1,
});

const cliente = (id: string, d: Partial<Cliente> = {}): Cliente => ({
  ...comunes(id),
  nombre: id, tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: '', municipio: '', lat: null, lon: null,
  servicios: ['jardin'], modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, frecuencia_visitas: 'quincenal', dias_preferidos: [],
  hora_preferida: null, duracion_habitual: 60, tipos_trabajo_habituales: [], precio_habitual: null, requiere_vehiculo_por_defecto: false,
  ayudantes_por_defecto: 0, notas: '', activo: true, ...d,
});

const visita = (id: string, d: Partial<Visita> = {}): Visita => ({
  ...comunes(id),
  cliente_id: 'c', fecha: '2026-10-11', hora_inicio: '09:00', duracion: 60, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: 15000,
  incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0, estado: 'programada', serie_id: null, fecha_serie: null,
  reprogramada_desde: null, motivo_reprogramacion: null, motivo_cancelacion: '', hecha_en: null, ...d,
});

const mov = (id: string, d: Partial<Movimiento>): Movimiento => ({
  ...comunes(id),
  tipo: 'cobro', importe: 0, fecha: '2026-10-11T10:00:00Z', categoria_id: null, medio_pago: 'efectivo', cliente_id: 'c', nota: '', foto_id: null,
  es_inversion: false, con_iva: null, base: null, cuota_iva: null, saldos: [], ...d,
});

const deuda = (id: string, d: Partial<Deuda>): Deuda => ({
  ...comunes(id), cliente_id: 'c', concepto: 'Trabajo', importe: 15000, fecha: '2026-10-10T10:00:00Z', visita_id: null, ...d,
});

const madrid = (dia: string, hora = '12:00') => new Date(`${dia}T${hora}:00+02:00`);

describe('Abonos esperados por día de cobro (criterio 12)', () => {
  const c = cliente('c', { creado_en: '2026-08-15T10:00:00Z', dia_cobro_abono: 1 });

  it('el día de cobro se genera el cobro esperado del mes y suma a «Te deben»', () => {
    const ultimoDeSeptiembre = madrid('2026-09-30');
    const primeroDeOctubre = madrid('2026-10-01', '00:30');
    expect(cobroEsperadoDelMes(c, [], ultimoDeSeptiembre)?.periodo).toBe('2026-09');
    expect(cobroEsperadoDelMes(c, [], madrid('2026-09-30'))?.vence).toBe('2026-09-01');
    const octubre = cobroEsperadoDelMes(c, [], primeroDeOctubre);
    expect(octubre).toMatchObject({ periodo: '2026-10', vence: '2026-10-01', cuota: 9000, pendiente: 9000 });
    const antes = totalPendiente(calcularPendientes([c], [], [], ultimoDeSeptiembre));
    const despues = totalPendiente(calcularPendientes([c], [], [], primeroDeOctubre));
    expect(despues - antes).toBe(9000);
    expect(totalAbonosEsperados(cobrosEsperadosAbono([c], [], primeroDeOctubre))).toBe(despues);
  });

  it('respeta el día de cobro: con día 15, el 14 no hay esperado del mes y el 15 sí', () => {
    const c15 = cliente('c', { dia_cobro_abono: 15 });
    expect(cobroEsperadoDelMes(c15, [], madrid('2026-10-14'))).toBeNull();
    expect(cobroEsperadoDelMes(c15, [], madrid('2026-10-15'))?.vence).toBe('2026-10-15');
  });

  it('un cobro con periodo_abono lo salda; uno parcial deja el resto; los inactivos y puntuales no generan', () => {
    const pagado = mov('m1', { importe: 9000, periodo_abono: '2026-10', saldos: [{ clave: 'abono:2026-10', importe: 9000 }] });
    expect(cobroEsperadoDelMes(c, [pagado], madrid('2026-10-11'))).toBeNull();
    const parcial = mov('m2', { importe: 4000, periodo_abono: '2026-10', saldos: [{ clave: 'abono:2026-10', importe: 4000 }] });
    expect(cobroEsperadoDelMes(c, [parcial], madrid('2026-10-11'))?.pendiente).toBe(5000);
    expect(cobroEsperadoDelMes(c, [{ ...pagado, eliminado_en: '2026-10-11T11:00:00Z' }], madrid('2026-10-11'))?.pendiente).toBe(9000);
    expect(cobrosEsperadosAbono([cliente('x', { activo: false }), cliente('y', { modalidad: 'puntual', cuota_abono: null })], [], madrid('2026-10-11'))).toEqual([]);
  });

  it('pregunta por la cuota más antigua, solo en la primera visita tras el vencimiento', () => {
    const ahora = madrid('2026-10-11');
    expect(cuotaAPreguntar(c, [], ahora)?.periodo).toBe('2026-09');
    const esta = visita('v2', { estado: 'hecha', hecha_en: '2026-10-11T08:00:00Z', incluida_en_abono: true, precio: null });
    const anteriorAlVencimiento = visita('v0', { estado: 'hecha', hecha_en: '2026-08-20T08:00:00Z' });
    expect(debePreguntarAbono(c, [], [esta, anteriorAlVencimiento], 'v2', ahora)?.periodo).toBe('2026-09');
    const otraTrasVencer = visita('v1', { estado: 'hecha', hecha_en: '2026-09-10T08:00:00Z' });
    expect(debePreguntarAbono(c, [], [esta, otraTrasVencer], 'v2', ahora)).toBeNull();
  });
});

describe('Resumen semanal positivo (§10.1.2)', () => {
  const cobro = (id: string, importe: number, fecha: string) => mov(id, { importe, fecha });
  const movs = [
    cobro('a', 30000, '2026-10-05T09:00:00Z'), // lunes de esta semana
    cobro('b', 34000, '2026-10-10T18:00:00Z'), // sábado
    cobro('c', 50000, '2026-10-01T09:00:00Z'), // semana anterior
    mov('g', { tipo: 'gasto', importe: 2000, fecha: '2026-10-06T09:00:00Z' }),
    { ...cobro('d', 99900, '2026-10-07T09:00:00Z'), eliminado_en: '2026-10-07T10:00:00Z' },
  ];

  it('suma los cobros de lunes a domingo (Madrid) y da «Esta semana cobraste 640 € en N trabajos»', () => {
    const r = resumenSemanal(movs, madrid('2026-10-11'));
    expect(r).toMatchObject({ desde: '2026-10-05', hasta: '2026-10-11', cobrado: 64000, trabajos: 2, anterior: 50000, mejora: 14000 });
    expect(textoResumenSemanal(r)).toBe('Esta semana cobraste 640 € en 2 trabajos');
    expect(textoMejora(r)).toBe('140 € más que la semana pasada');
    expect(textoResumenSemanal({ cobrado: 6000, trabajos: 1 })).toBe('Esta semana cobraste 60 € en 1 trabajo');
  });

  it('cuenta como trabajos las visitas hechas y los trabajos sin visita de la semana', () => {
    const visitas = [
      visita('v1', { estado: 'hecha', hecha_en: '2026-10-06T09:00:00Z' }),
      visita('v2', { estado: 'hecha', hecha_en: '2026-10-08T09:00:00Z' }),
      visita('v3', { estado: 'hecha', hecha_en: '2026-09-30T09:00:00Z' }),
      visita('v4', { estado: 'programada' }),
    ];
    const deudas = [deuda('d1', { fecha: '2026-10-09T09:00:00Z' }), deuda('d2', { fecha: '2026-10-09T09:00:00Z', visita_id: 'v2' })];
    expect(resumenSemanal(movs, madrid('2026-10-11'), { visitas, deudas }).trabajos).toBe(3);
  });

  it('la variación solo aparece si es positiva', () => {
    const r = resumenSemanal([cobro('a', 1000, '2026-10-05T09:00:00Z'), cobro('c', 5000, '2026-10-01T09:00:00Z')], madrid('2026-10-11'));
    expect(r.mejora).toBeNull();
    expect(textoMejora(r)).toBeNull();
  });

  it('se muestra el domingo o el primer día sin visitas de la semana, y nunca con 0 €', () => {
    expect(lunesDe('2026-10-11')).toBe('2026-10-05');
    expect(lunesDe('2026-10-05')).toBe('2026-10-05');
    const r = resumenSemanal(movs, madrid('2026-10-11'));
    expect(mostrarResumenSemanal(r, [], madrid('2026-10-11'))).toBe(true);
    expect(mostrarResumenSemanal({ ...r, cobrado: 0 }, [], madrid('2026-10-11'))).toBe(false);
    const miercoles = madrid('2026-10-07');
    const rMie = resumenSemanal(movs, miercoles);
    const lunesYMartes = [visita('a', { fecha: '2026-10-05' }), visita('b', { fecha: '2026-10-06' })];
    expect(mostrarResumenSemanal(rMie, lunesYMartes, miercoles)).toBe(true);
    expect(mostrarResumenSemanal(rMie, [...lunesYMartes, visita('c', { fecha: '2026-10-07' })], miercoles)).toBe(false);
    expect(mostrarResumenSemanal(rMie, [visita('a', { fecha: '2026-10-05' })], miercoles)).toBe(false);
  });
});

describe('Visitas de hoy (§10.1.1.4)', () => {
  const lista = [
    visita('tarde', { hora_inicio: '16:00' }),
    visita('cancelada', { hora_inicio: '08:00', estado: 'cancelada' }),
    visita('manana', { hora_inicio: '09:00', estado: 'hecha', hecha_en: '2026-10-11T08:00:00Z' }),
    visita('sinhora', { hora_inicio: null, fecha: '2026-10-11' }),
    visita('mediodia', { hora_inicio: '11:30' }),
    visita('otrodia', { fecha: '2026-10-12' }),
  ];

  it('ordena por hora (sin hora = 09:00), quita canceladas y cuenta «N de M hechas»', () => {
    const hoy = visitasDeHoy(lista, '2026-10-11');
    expect(hoy.map((v) => v.id)).toEqual(['manana', 'sinhora', 'mediodia', 'tarde']);
    expect(contadorHechas(hoy).texto).toBe('1 de 4 hechas');
    expect(proximaPendiente(hoy)?.id).toBe('sinhora');
    expect(textoManana(lista, '2026-10-11')).toBe('Mañana: 1 visita');
    expect(textoManana(lista, '2026-10-12')).toBeNull();
  });

  it('línea de la tarjeta: importe, abono o estado de cobro', () => {
    const c = cliente('c');
    expect(textoServicio(visita('x', { tipos_trabajo: ['corte_cesped', 'setos_poda'] }))).toBe('Césped y setos y poda');
    expect(textoServicio(visita('x', { descripcion: 'Poda de setos' }))).toBe('Poda de setos');
    expect(lineaVisita(visita('x', { descripcion: 'Poda de setos' }), c, [], [])).toBe('Poda de setos · 150 €');
    expect(lineaVisita(visita('x', { tipos_trabajo: ['piscina'], incluida_en_abono: true, precio: null }), c, [], [])).toBe('Piscina · Abono 90 €/mes');
    const hecha = visita('h', { estado: 'hecha', descripcion: 'Césped', precio: 6000 });
    const d = deuda('d', { visita_id: 'h', importe: 6000 });
    expect(lineaVisita(hecha, c, [d], [])).toBe('Césped · Pendiente de cobro');
    expect(lineaVisita(hecha, c, [d], [mov('m', { importe: 6000, saldos: [{ clave: 'deuda:d', importe: 6000 }] })])).toBe('Césped · Cobrado 60 €');
    expect(tipoCobroVisita({ incluida_en_abono: false, precio: null })).toBe('sin_precio');
  });
});

describe('Aviso contextual (§10.1.1.3): máximo uno, el más prioritario', () => {
  const ahora = madrid('2026-10-11');
  const c = cliente('c', { nombre: 'Sra. Morales', modalidad: 'puntual', cuota_abono: null });
  const ayer = visita('v', { fecha: '2026-10-10', estado: 'hecha', hecha_en: '2026-10-10T10:00:00Z', precio: 4500 });
  const deudaAyer = deuda('d', { visita_id: 'v', importe: 4500 });
  const fianza = mov('f', { tipo: 'fianza_entregada', importe: 15000, fecha: '2026-10-01T10:00:00Z', cliente_id: null });
  const abonoRojo = cliente('a', { nombre: 'Fam. García', creado_en: '2026-08-15T10:00:00Z', dia_cobro_abono: 1 });

  it('cobro sin registrar de ayer gana a todo: «Ayer en Sra. Morales: ¿cobraste?» / «Sí, 45 €»', () => {
    const a = avisoContextual({ visitas: [ayer], clientes: [c, abonoRojo], deudas: [deudaAyer], movimientos: [fianza] }, ahora);
    expect(a).toMatchObject({ tipo: 'cobro_visita', texto: 'Ayer en Sra. Morales: ¿cobraste?', boton: 'Sí, 45 €', deuda_id: 'd', importe: 4500 });
  });

  it('sin cobros pendientes de visitas: fianza vencida; luego abono vencido en rojo; luego nada', () => {
    expect(avisoContextual({ visitas: [], clientes: [abonoRojo], deudas: [], movimientos: [fianza] }, ahora)).toMatchObject({
      tipo: 'fianza', texto: 'La fianza de 150 € sigue sin volver.', boton: 'Me la devolvieron',
    });
    expect(avisoContextual({ visitas: [], clientes: [abonoRojo], deudas: [], movimientos: [] }, ahora)).toMatchObject({
      tipo: 'abono', periodo: '2026-09', texto: 'Fam. García te debe 90 € desde hace 40 días.',
    });
    expect(avisoContextual({ visitas: [], clientes: [c], deudas: [], movimientos: [] }, ahora)).toBeNull();
  });

  it('una visita cobrada, de hoy o de hace más de 6 días no avisa', () => {
    const cobrada = mov('m', { importe: 4500, saldos: [{ clave: 'deuda:d', importe: 4500 }] });
    expect(avisoContextual({ visitas: [ayer], clientes: [c], deudas: [deudaAyer], movimientos: [cobrada] }, ahora)).toBeNull();
    const vieja = { ...ayer, fecha: '2026-10-01' };
    expect(avisoContextual({ visitas: [vieja], clientes: [c], deudas: [deudaAyer], movimientos: [] }, ahora)).toBeNull();
    const deHoy = { ...ayer, fecha: '2026-10-11' };
    expect(avisoContextual({ visitas: [deHoy], clientes: [c], deudas: [deudaAyer], movimientos: [] }, ahora)).toBeNull();
  });
});
