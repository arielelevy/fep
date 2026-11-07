import { beforeEach, describe, expect, it } from 'vitest';
import { db, reiniciarBase } from './db';
import {
  SinPermiso, cancelarVisita, completarVisita, crearCliente, crearSerie, crearVisita, editarSerieDesde, editarVisita,
  materializarSeries, moverVisita, usarComo, type DatosCliente, type DatosVisita,
} from './repo';
import { estadoCobroVisita, fechasSerie, horaFin, textoDuracion, visitasDelDia } from '../domain/agenda';
import { calcularPendientes, totalPendiente } from '../domain/pendientes';

// Capa de datos de la agenda (ola 5): series, materialización, «esta y las siguientes», mover, cancelar y «Hecho».

const datosCliente = (extra: Partial<DatosCliente> = {}): DatosCliente => ({
  nombre: 'Fam. García', tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Pez 3',
  municipio: 'Madrid', lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
  frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: ['corte_cesped'],
  precio_habitual: 15000, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true, ...extra,
});
const datosVisita = (cliente_id: string, extra: Partial<DatosVisita> = {}): DatosVisita => ({
  cliente_id, fecha: '2026-11-10', hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['setos_poda'], descripcion: 'Poda de setos',
  precio: 15000, incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0, ...extra,
});
const serieQuincenal = (cliente_id: string) => ({
  cliente_id,
  regla: { frecuencia: 'quincenal' as const, dias_semana: [1], hora: '09:00', duracion: 60 },
  fecha_inicio: '2026-11-02', // lunes
  fecha_fin: null,
  plantilla_visita: { tipos_trabajo: ['piscina' as const], descripcion: 'Piscina', ayudantes: 0, requiere_vehiculo: false, precio: null, incluida_en_abono: true },
});
const vivas = async (serieId?: string) =>
  (await db.visitas.toArray()).filter((v) => !v.eliminado_en && (!serieId || v.serie_id === serieId)).sort((a, b) => a.fecha.localeCompare(b.fecha));

beforeEach(async () => {
  await reiniciarBase('fergo-prueba-agenda');
});

describe('Fechas de una serie (§8.5)', () => {
  const base = { fecha_inicio: '2026-11-02', fecha_fin: null };
  it('semanal, quincenal y mensual', () => {
    expect(fechasSerie({ ...base, regla: { frecuencia: 'semanal', dias_semana: [1, 4], hora: null, duracion: 60 } }, '2026-11-01', '2026-11-15'))
      .toEqual(['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12']);
    expect(fechasSerie({ ...base, regla: { frecuencia: 'quincenal', dias_semana: [1], hora: null, duracion: 60 } }, '2026-11-01', '2026-12-15'))
      .toEqual(['2026-11-02', '2026-11-16', '2026-11-30', '2026-12-14']);
    expect(fechasSerie({ fecha_inicio: '2026-01-31', fecha_fin: null, regla: { frecuencia: 'mensual', dias_semana: [], hora: null, duracion: 60 } }, '2026-01-01', '2026-04-30'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('respeta el desde y la fecha de fin', () => {
    expect(fechasSerie({ fecha_inicio: '2026-11-02', fecha_fin: '2026-11-20', regla: { frecuencia: 'quincenal', dias_semana: [1], hora: null, duracion: 60 } }, '2026-11-10', '2026-12-31'))
      .toEqual(['2026-11-16']);
  });
  it('utilidades de hora', () => {
    expect(horaFin('11:30', 120)).toBe('13:30');
    expect(textoDuracion(120)).toBe('2 h');
    expect(textoDuracion(90)).toBe('1 h 30 min');
  });
});

describe('Series recurrentes en la base local', () => {
  it('materializa 8 semanas y no duplica ni recrea las movidas', async () => {
    const { cliente } = await crearCliente(datosCliente({ modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1 }));
    const { serie } = await crearSerie(serieQuincenal(cliente.id), '2026-11-02');
    const v = await vivas(serie.id);
    expect(v.map((x) => x.fecha)).toEqual(['2026-11-02', '2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28']);
    expect(v[0]).toMatchObject({ estado: 'programada', incluida_en_abono: true, fecha_serie: '2026-11-02', duracion: 60 });
    await moverVisita(v[1].id, '2026-11-18', '10:00', 'clima');
    expect(await materializarSeries('2026-11-02')).toEqual([]);
    const movida = await db.visitas.get(v[1].id);
    expect(movida).toMatchObject({ fecha: '2026-11-18', hora_inicio: '10:00', reprogramada_desde: '2026-11-16 09:00', motivo_reprogramacion: 'clima', fecha_serie: '2026-11-16' });
    // Más adelante, se añaden las semanas nuevas.
    const nuevas = await materializarSeries('2026-11-30');
    expect((await db.visitas.bulkGet(nuevas)).map((x) => x!.fecha)).toEqual(['2027-01-11', '2027-01-25']);
  });

  it('«Esta y las siguientes» cambia las futuras de la serie y no las pasadas (criterio 13)', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const { serie } = await crearSerie(serieQuincenal(cliente.id), '2026-11-02');
    const antes = await vivas(serie.id);
    await completarVisita(antes[0].id, null); // la primera ya está hecha
    const { serie: nueva, deshacer } = await editarSerieDesde(antes[2].id, { visita: { hora_inicio: '16:00', descripcion: 'Piscina y césped' } }, '2026-11-02');
    const despues = await vivas();
    const pasadas = despues.filter((x) => x.fecha < '2026-11-30');
    expect(pasadas.map((x) => [x.fecha, x.hora_inicio, x.serie_id])).toEqual([['2026-11-02', '09:00', serie.id], ['2026-11-16', '09:00', serie.id]]);
    const futuras = despues.filter((x) => x.fecha >= '2026-11-30');
    expect(futuras.length).toBeGreaterThanOrEqual(3);
    expect(futuras.every((x) => x.hora_inicio === '16:00' && x.descripcion === 'Piscina y césped' && x.serie_id === nueva.id)).toBe(true);
    expect((await db.series.get(serie.id))?.fecha_fin).toBe('2026-11-29');
    await deshacer();
    expect((await vivas()).map((x) => [x.fecha, x.hora_inicio])).toEqual(antes.map((x) => [x.fecha, x.hora_inicio]));
    expect((await db.series.get(serie.id))?.fecha_fin).toBeNull();
  });

  it('el horizonte es hoy + 8 semanas aunque la serie empiece más adelante (hallazgo de B)', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const futura = { ...serieQuincenal(cliente.id), regla: { frecuencia: 'semanal' as const, dias_semana: [2], hora: '09:00', duracion: 60 }, fecha_inicio: '2026-11-17' };
    const { serie } = await crearSerie(futura, '2026-11-07');
    const fechas = (await vivas(serie.id)).map((x) => x.fecha);
    expect(fechas[0]).toBe('2026-11-17');
    expect(fechas.at(-1)).toBe('2026-12-29'); // último martes ≤ 2027-01-02 (7-nov + 56 días)
    expect(fechas.every((f) => f <= '2027-01-02')).toBe(true);
    // Lo mismo al editar «esta y las siguientes» desde una fecha futura.
    const v = await vivas(serie.id);
    const { serie: nueva } = await editarSerieDesde(v[1].id, { visita: { hora_inicio: '10:00' } }, '2026-11-07');
    expect((await vivas(nueva.id)).every((x) => x.fecha <= '2027-01-02')).toBe(true);
    expect(await materializarSeries('2026-11-07')).toEqual([]);
  });

  it('«Solo esta visita» no toca el resto de la serie', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const { serie } = await crearSerie(serieQuincenal(cliente.id), '2026-11-02');
    const v = await vivas(serie.id);
    await editarVisita(v[1].id, { hora_inicio: '12:00' });
    expect((await vivas(serie.id)).map((x) => x.hora_inicio)).toEqual(['09:00', '12:00', '09:00', '09:00', '09:00']);
  });
});

describe('«Hecho» con cobro (§10.1.4, criterios 9 y 10)', () => {
  it('«Sí, 150 €»: visita hecha y cobro de 150 € con el último medio de pago', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const { visita } = await crearVisita(datosVisita(cliente.id));
    await db.ajustes.put({ clave: 'ultimo_medio_pago', valor: 'bizum' });
    const r = await completarVisita(visita.id, { cobrado: 15000, medio_pago: 'bizum' });
    expect(r.visita.estado).toBe('hecha');
    expect(r.cobro).toMatchObject({ tipo: 'cobro', importe: 15000, medio_pago: 'bizum', cliente_id: cliente.id });
    expect(r.deuda).toMatchObject({ visita_id: visita.id, importe: 15000, concepto: 'Poda de setos' });
    const movs = await db.movimientos.toArray();
    const deudas = await db.deudas.toArray();
    expect(estadoCobroVisita((await db.visitas.get(visita.id))!, deudas, movs).estado).toBe('cobrada');
  });

  it('«No, me paga después»: «Te deben» sube 150 € y el deshacer lo deja todo como antes', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const { visita } = await crearVisita(datosVisita(cliente.id));
    const { deshacer } = await completarVisita(visita.id, null);
    const clientes = await db.clientes.toArray();
    const pend = calcularPendientes(clientes, await db.deudas.toArray(), await db.movimientos.toArray(), new Date(), cliente.id);
    expect(totalPendiente(pend)).toBe(15000);
    const v = (await db.visitas.get(visita.id))!;
    expect(estadoCobroVisita(v, await db.deudas.toArray(), await db.movimientos.toArray())).toEqual({ estado: 'pendiente', pendiente: 15000, cobrado: 0 });
    await deshacer();
    expect((await db.visitas.get(visita.id))).toMatchObject({ estado: 'programada', hecha_en: null });
    expect(totalPendiente(calcularPendientes(clientes, (await db.deudas.toArray()).filter((d) => !d.eliminado_en), await db.movimientos.toArray(), new Date()))).toBe(0);
  });

  it('una visita de abono solo se marca hecha; una cancelada o ya hecha no se completa', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const { visita } = await crearVisita(datosVisita(cliente.id, { precio: null, incluida_en_abono: true }));
    const r = await completarVisita(visita.id, null);
    expect(r).toMatchObject({ deuda: null, cobro: null });
    await expect(completarVisita(visita.id, null)).rejects.toThrow('ya está hecha');
    const { visita: otra } = await crearVisita(datosVisita(cliente.id));
    await cancelarVisita(otra.id, 'Lluvia');
    expect(await db.visitas.get(otra.id)).toMatchObject({ estado: 'cancelada', motivo_cancelacion: 'Lluvia' });
    await expect(completarVisita(otra.id, null)).rejects.toThrow('cancelada');
  });

  it('visitasDelDia ordena por hora (sin hora = 09:00) y deja las canceladas al final', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const a = (await crearVisita(datosVisita(cliente.id, { hora_inicio: '16:00' }))).visita;
    const b = (await crearVisita(datosVisita(cliente.id, { hora_inicio: null }))).visita;
    const c = (await crearVisita(datosVisita(cliente.id, { hora_inicio: '08:00' }))).visita;
    await cancelarVisita(c.id);
    expect(visitasDelDia(await db.visitas.toArray(), '2026-11-10').map((x) => x.id)).toEqual([b.id, a.id, c.id]);
  });
});

describe('Permisos de la agenda', () => {
  it('Pablo no crea, mueve, cancela ni completa visitas', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const { visita } = await crearVisita(datosVisita(cliente.id));
    await usarComo('colaborador');
    await expect(crearVisita(datosVisita(cliente.id))).rejects.toBeInstanceOf(SinPermiso);
    await expect(moverVisita(visita.id, '2026-11-11', null)).rejects.toBeInstanceOf(SinPermiso);
    await expect(cancelarVisita(visita.id)).rejects.toBeInstanceOf(SinPermiso);
    await expect(completarVisita(visita.id, null)).rejects.toBeInstanceOf(SinPermiso);
    expect(await materializarSeries('2026-11-02')).toEqual([]);
  });
});
