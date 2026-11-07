// Operaciones con la base local (IndexedDB falsa de las pruebas): guardar, recalcular, «Mantener» y «Mover».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria, crearServicioClima, type Ubicacion } from '../../clima';
import { db, reiniciarBase } from '../../db/db';
import { crearCliente, crearVisita, SinPermiso, usarComo, type DatosCliente } from '../../db/repo';
import { desdeMadrid } from '../../lib/fechas';
import { crearProveedorAemetSimulado } from './aemet';
import { avisoCap } from './fixtures/aemet';
import { lluviaManana, previsionFija } from './fixtures/clima';
import { alertasActivas } from './motor';
import {
  almacenAlertasLocal, CLAVE_AJUSTE_ALERTAS, mantenerVisita, moverVisitaPorAlerta, prepararClima, quienSoy, recalcularYGuardar, type AlmacenAlertas,
} from './operaciones';
import type { ClimaCliente } from './tipos';

const AHORA = desdeMadrid(2026, 11, 7, 10);
const U: Ubicacion = { lat: 40.4, lon: -3.7 };
const BASE: DatosCliente = {
  nombre: 'Fam. García', tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Mayor 3', municipio: 'Madrid',
  lat: U.lat, lon: U.lon, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [], precio_habitual: null,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};

async function escena() {
  const { cliente } = await crearCliente(BASE);
  const { visita } = await crearVisita({
    cliente_id: cliente.id, fecha: '2026-11-09', hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['corte_cesped'], descripcion: '',
    precio: 15000, incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0,
  });
  const clima = new Map<string, ClimaCliente>([[cliente.id, { ubicacion: U, prevision: previsionFija(U, '2026-11-07', lluviaManana('2026-11-09')), avisos: [] }]]);
  const yo = await quienSoy();
  const recalcular = async (almacen: AlmacenAlertas) =>
    recalcularYGuardar(almacen, { visitas: await db.visitas.toArray(), clientes: await db.clientes.toArray(), clima, ahora: AHORA, usuario: yo.usuario, negocio: yo.negocio });
  return { cliente, visita, clima, recalcular, yo };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
});
afterEach(() => vi.useRealTimers());

describe('Guardar y recalcular', () => {
  it('se guarda en la tabla ajustes (sin cambiar el esquema) con trazabilidad, y recalcular no duplica', async () => {
    const { recalcular, yo, visita } = await escena();
    const almacen = almacenAlertasLocal();
    const r1 = await recalcular(almacen);
    expect(r1.nuevas).toHaveLength(1);
    const guardado = (await db.ajustes.get(CLAVE_AJUSTE_ALERTAS))!.valor as { alertas: unknown[] };
    expect(guardado.alertas).toHaveLength(1);
    expect(r1.nuevas[0]).toMatchObject({ creado_por: yo.usuario, modificado_por: yo.usuario, negocio_id: yo.negocio, entidad: { id: visita.id } });
    expect(r1.nuevas[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const r2 = await recalcular(almacen);
    expect(r2.nuevas).toEqual([]);
    expect((await almacen.leer()).alertas).toHaveLength(1);
  });

  it('app real: sin proveedor del tiempo todo queda «Sin previsión» y no salen alertas de semáforo', async () => {
    const { cliente } = await crearCliente(BASE);
    await crearVisita({ cliente_id: cliente.id, fecha: '2026-11-09', hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: null, incluida_en_abono: true, requiere_vehiculo: false, ayudantes: 0 });
    const servicio = crearServicioClima({ proveedor: null, almacen: almacenEnMemoria(), enLinea: () => true });
    const clima = await prepararClima([cliente], { servicio, avisos: null, ahora: AHORA });
    expect(clima.get(cliente.id)).toMatchObject({ ubicacion: U, prevision: null, avisos: [] });
    const yo = await quienSoy();
    const r = await recalcularYGuardar(almacenAlertasLocal(), { visitas: await db.visitas.toArray(), clientes: [cliente], clima, ahora: AHORA, ...yo });
    expect(r.nuevas).toEqual([]);
  });

  it('aviso AEMET simulado a través de prepararClima → alerta de aviso oficial', async () => {
    const { cliente } = await crearCliente(BASE);
    await crearVisita({ cliente_id: cliente.id, fecha: '2026-11-09', hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['piscina'], descripcion: '', precio: null, incluida_en_abono: true, requiere_vehiculo: false, ayudantes: 0 });
    const avisos = crearProveedorAemetSimulado([avisoCap({ id: 'x', nivel: 'amarillo', fenomeno: 'VI', onset: '2026-11-09T00:00:00+01:00', expires: '2026-11-10T00:00:00+01:00' })]);
    const servicio = crearServicioClima({ proveedor: null, almacen: almacenEnMemoria(), enLinea: () => true });
    const clima = await prepararClima([cliente], { servicio, avisos, ahora: AHORA });
    const yo = await quienSoy();
    const r = await recalcularYGuardar(almacenAlertasLocal(), { visitas: await db.visitas.toArray(), clientes: [cliente], clima, ahora: AHORA, ...yo });
    expect(r.nuevas.map((a) => [a.tipo, a.dato_clave])).toEqual([['CLIMA_AEMET', 'Amarillo por viento']]);
  });
});

describe('«Mantener la visita»', () => {
  it('descarta la alerta; recalcular no la reabre; «Deshacer» la reabre', async () => {
    const { recalcular } = await escena();
    const almacen = almacenAlertasLocal();
    const { nuevas } = await recalcular(almacen);
    const { alerta, deshacer } = await mantenerVisita(almacen, nuevas[0].id, AHORA);
    expect(alerta).toMatchObject({ estado: 'descartada', version: 2 });
    expect((await almacen.leer()).descartes).toEqual([expect.objectContaining({ clave_asunto: nuevas[0].clave_asunto, rango: 2 })]);
    const r = await recalcular(almacen);
    expect(r.nuevas).toEqual([]);
    expect(alertasActivas(r.estado)).toEqual([]);
    await deshacer();
    expect(alertasActivas(await almacen.leer()).map((a) => a.id)).toEqual([nuevas[0].id]);
  });

  it('Pablo (colaborador) no puede decidir', async () => {
    const { recalcular } = await escena();
    const almacen = almacenAlertasLocal();
    const { nuevas } = await recalcular(almacen);
    await usarComo('colaborador');
    await expect(mantenerVisita(almacen, nuevas[0].id)).rejects.toBeInstanceOf(SinPermiso);
    await expect(moverVisitaPorAlerta(almacen, nuevas[0].id, '2026-11-10', '09:00')).rejects.toBeInstanceOf(SinPermiso);
    expect(alertasActivas(await almacen.leer())).toHaveLength(1);
  });
});

describe('«Mover» desde la alerta', () => {
  it('mueve la visita con motivo clima, resuelve la alerta y «Deshacer» deja todo como estaba', async () => {
    const { recalcular, visita } = await escena();
    const almacen = almacenAlertasLocal();
    const { nuevas } = await recalcular(almacen);
    const r = await moverVisitaPorAlerta(almacen, nuevas[0].id, '2026-11-10', '10:00', AHORA);
    expect(r.visita).toMatchObject({ id: visita.id, fecha: '2026-11-10', hora_inicio: '10:00', reprogramada_desde: '2026-11-09 09:00', motivo_reprogramacion: 'clima' });
    expect(r.alerta.estado).toBe('resuelta');
    expect(await db.visitas.get(visita.id)).toMatchObject({ fecha: '2026-11-10', motivo_reprogramacion: 'clima' });
    // El martes no llueve: recalcular no crea nada ni reabre lo del lunes.
    const r2 = await recalcular(almacen);
    expect(r2.nuevas).toEqual([]);
    expect(alertasActivas(r2.estado)).toEqual([]);
    await r.deshacer();
    expect(await db.visitas.get(visita.id)).toMatchObject({ fecha: '2026-11-09', hora_inicio: '09:00', reprogramada_desde: null, motivo_reprogramacion: null });
    expect(alertasActivas(await almacen.leer()).map((a) => a.id)).toEqual([nuevas[0].id]);
  });

  it('alerta inexistente → error claro', async () => {
    await escena();
    await expect(mantenerVisita(almacenAlertasLocal(), 'no-existe')).rejects.toThrow('Alerta no encontrada');
  });
});
