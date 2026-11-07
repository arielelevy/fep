import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, reiniciarBase } from './db';
import {
  cancelarVisita, completarVisita, crearCliente, crearMovimiento, crearSerie, crearVisita, editarSerieDesde, editarVisita,
  leerAjuste, materializarSeries, moverVisita, type DatosCliente, type DatosSerie, type DatosVisita,
} from './repo';
import { estadoCobroVisita } from '../domain/agenda';
import { calcularEnCaja, calcularGanado } from '../domain/cifras';
import { calcularPendientes, totalPendiente } from '../domain/pendientes';
import type { Cliente, MedioPago, Visita } from '../domain/tipos';
import { claveMes, desdeMadrid, sumarDias } from '../lib/fechas';

// Ola 5 · frente B. Criterios 9, 10, 12 y 13 de §18 contra la capa de datos (IndexedDB), más visitas
// puntuales, mover, cancelar, «Solo esta visita» y deshacer (§8.4, §8.5, §9.4, §10.1.4, §10.6).

const AHORA = desdeMadrid(2026, 11, 7, 10); // sábado 7 de noviembre, 10:00 en Madrid
const HOY = '2026-11-07';

const BASE_CLIENTE: DatosCliente = {
  nombre: 'Sra. Morales', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: '', municipio: '',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [], precio_habitual: null,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};
const nuevoCliente = async (d: Partial<DatosCliente> = {}): Promise<Cliente> => (await crearCliente({ ...BASE_CLIENTE, ...d })).cliente;

const datosVisita = (cliente_id: string, d: Partial<DatosVisita> = {}): DatosVisita => ({
  cliente_id, fecha: HOY, hora_inicio: '10:00', duracion: 120, tipos_trabajo: ['setos_poda'], descripcion: 'Poda de setos',
  precio: 15000, incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0, ...d,
});

/** Medio preseleccionado en la hoja «¿Cobraste a …?»: el último usado (§10.1.4). */
const ultimoMedio = () => leerAjuste<MedioPago>('ultimo_medio_pago', 'efectivo');
const movsActivos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();
const deudasActivas = () => db.deudas.filter((x) => !x.eliminado_en).toArray();
const clientes = () => db.clientes.filter((c) => !c.eliminado_en).toArray();
const teDeben = async (ahora = new Date()) => totalPendiente(calcularPendientes(await clientes(), await deudasActivas(), await movsActivos(), ahora));
const visitasSerie = async (serieId: string) =>
  (await db.visitas.where('serie_id').equals(serieId).toArray()).filter((v) => !v.eliminado_en).sort((a, b) => a.fecha.localeCompare(b.fecha));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo-prueba-visitas-f5');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Criterio 9 · Hecho y «Sí, 150 €»', () => {
  it('la visita queda hecha y se crea un cobro de 150 € con el último medio de pago usado', async () => {
    const c = await nuevoCliente();
    // Último medio usado: Bizum (de otro cobro anterior).
    await crearMovimiento({ tipo: 'otro_ingreso', importe: 1000, fecha: new Date().toISOString(), categoria_id: null, medio_pago: 'bizum' });
    expect(await leerAjuste('ultimo_medio_pago', 'efectivo')).toBe('bizum');
    const { visita } = await crearVisita(datosVisita(c.id));
    const cajaAntes = calcularEnCaja(await movsActivos());

    const r = await completarVisita(visita.id, { cobrado: 15000, medio_pago: await ultimoMedio() });

    const guardada = (await db.visitas.get(visita.id))!;
    expect(guardada.estado).toBe('hecha');
    expect(guardada.hecha_en).not.toBeNull();
    expect(r.cobro).toMatchObject({ tipo: 'cobro', importe: 15000, medio_pago: 'bizum', cliente_id: c.id });
    const cobros = (await movsActivos()).filter((m) => m.tipo === 'cobro');
    expect(cobros).toHaveLength(1);
    expect(r.deuda).toMatchObject({ importe: 15000, visita_id: visita.id, cliente_id: c.id });
    expect(estadoCobroVisita(guardada, await deudasActivas(), await movsActivos())).toEqual({ estado: 'cobrada', pendiente: 0, cobrado: 15000 });
    expect(calcularEnCaja(await movsActivos())).toBe(cajaAntes + 15000);
    expect(calcularGanado(await movsActivos(), claveMes(AHORA))).toBe(1000 + 15000);
    expect(await teDeben()).toBe(0);
  });

  it('con otro medio elegido en la hoja, se usa ese y pasa a ser el último usado', async () => {
    const c = await nuevoCliente();
    const { visita } = await crearVisita(datosVisita(c.id));
    const r = await completarVisita(visita.id, { cobrado: 15000, medio_pago: 'tarjeta' });
    expect(r.cobro?.medio_pago).toBe('tarjeta');
    expect(await leerAjuste('ultimo_medio_pago', 'efectivo')).toBe('tarjeta');
  });

  it('deshacer devuelve la visita a programada y borra cobro y deuda', async () => {
    const c = await nuevoCliente();
    const { visita } = await crearVisita(datosVisita(c.id));
    const r = await completarVisita(visita.id, { cobrado: 15000, medio_pago: await ultimoMedio() });
    await r.deshacer();
    expect((await db.visitas.get(visita.id))!.estado).toBe('programada');
    expect((await movsActivos()).filter((m) => m.tipo === 'cobro')).toHaveLength(0);
    expect(await deudasActivas()).toHaveLength(0);
    expect(calcularEnCaja(await movsActivos())).toBe(0);
  });

  it('no se puede marcar hecha dos veces (no duplica el cobro)', async () => {
    const c = await nuevoCliente();
    const { visita } = await crearVisita(datosVisita(c.id));
    await completarVisita(visita.id, { cobrado: 15000, medio_pago: await ultimoMedio() });
    await expect(completarVisita(visita.id, { cobrado: 15000, medio_pago: await ultimoMedio() })).rejects.toThrow();
    expect((await movsActivos()).filter((m) => m.tipo === 'cobro')).toHaveLength(1);
  });
});

describe('Criterio 10 · Hecho y «No, me paga después»', () => {
  it('«Te deben» sube 150 € y el pendiente es del cliente', async () => {
    const c = await nuevoCliente();
    const { visita } = await crearVisita(datosVisita(c.id));
    const antes = await teDeben();

    const r = await completarVisita(visita.id, null);

    expect(r.cobro).toBeNull();
    expect((await db.visitas.get(visita.id))!.estado).toBe('hecha');
    expect((await teDeben()) - antes).toBe(15000);
    const delCliente = calcularPendientes(await clientes(), await deudasActivas(), await movsActivos(), new Date(), c.id);
    expect(totalPendiente(delCliente)).toBe(15000);
    expect(estadoCobroVisita((await db.visitas.get(visita.id))!, await deudasActivas(), await movsActivos()).estado).toBe('pendiente');
    expect(calcularEnCaja(await movsActivos())).toBe(0);
  });

  it('«Cobré otra cantidad» (parcial) deja el resto en «Te deben»', async () => {
    const c = await nuevoCliente();
    const { visita } = await crearVisita(datosVisita(c.id));
    await completarVisita(visita.id, { cobrado: 5000, medio_pago: 'efectivo' });
    expect(await teDeben()).toBe(10000);
    expect(estadoCobroVisita((await db.visitas.get(visita.id))!, await deudasActivas(), await movsActivos())).toEqual({ estado: 'parcial', pendiente: 10000, cobrado: 5000 });
  });

  it('una visita de abono se marca hecha sin deuda ni cobro', async () => {
    const c = await nuevoCliente({ modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, frecuencia_visitas: 'quincenal' });
    const antes = await teDeben();
    const { visita } = await crearVisita(datosVisita(c.id, { precio: null, incluida_en_abono: true }));
    const r = await completarVisita(visita.id, null);
    expect(r.deuda).toBeNull();
    expect(r.cobro).toBeNull();
    expect((await db.visitas.get(visita.id))!.estado).toBe('hecha');
    expect(await teDeben()).toBe(antes);
  });
});

describe('Criterio 12 · cobro esperado de abono el día de cobro', () => {
  it('cliente de abono con día de cobro 1: el 1 de diciembre suma la cuota a «Te deben»', async () => {
    await nuevoCliente({ nombre: 'Fam. García', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, frecuencia_visitas: 'quincenal' });
    // Alta el 7 de noviembre: la cuota de noviembre (día 1) es anterior al alta y no se genera.
    expect(await teDeben()).toBe(0);
    expect(await teDeben(desdeMadrid(2026, 11, 30, 23, 59))).toBe(0);
    expect(await teDeben(desdeMadrid(2026, 12, 1, 0, 1))).toBe(9000);
  });

  it('el cobro con periodo_abono del mes lo salda', async () => {
    const c = await nuevoCliente({ modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, frecuencia_visitas: 'mensual' });
    vi.setSystemTime(desdeMadrid(2026, 12, 1, 9));
    expect(await teDeben()).toBe(9000);
    await crearMovimiento({ tipo: 'cobro', importe: 9000, fecha: new Date().toISOString(), categoria_id: null, medio_pago: 'bizum', cliente_id: c.id, periodo_abono: '2026-12', saldos: [{ clave: 'abono:2026-12', importe: 9000 }] });
    expect(await teDeben()).toBe(0);
  });
});

describe('Criterio 13 · serie quincenal y «Esta y las siguientes»', () => {
  const serieQuincenal = (cliente_id: string, d: Partial<DatosSerie> = {}): DatosSerie => ({
    cliente_id,
    regla: { frecuencia: 'quincenal', dias_semana: [2], hora: '10:00', duracion: 120 }, // martes
    fecha_inicio: '2026-10-06',
    fecha_fin: null,
    plantilla_visita: { tipos_trabajo: ['corte_cesped'], descripcion: 'Corte de césped', ayudantes: 0, requiere_vehiculo: false, precio: null, incluida_en_abono: true },
    ...d,
  });

  async function preparar() {
    const c = await nuevoCliente({ nombre: 'Fam. García', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, frecuencia_visitas: 'quincenal' });
    // Serie creada el 6 de octubre: materializa sus visitas desde ese día.
    vi.setSystemTime(desdeMadrid(2026, 10, 6, 8));
    const { serie } = await crearSerie(serieQuincenal(c.id), '2026-10-06');
    vi.setSystemTime(AHORA);
    await materializarSeries(HOY);
    return { c, serie };
  }

  it('materializa cada 15 días con 8 semanas de antelación, sin duplicar', async () => {
    const { serie } = await preparar();
    const fechas = (await visitasSerie(serie.id)).map((v) => v.fecha);
    expect(fechas).toEqual(['2026-10-06', '2026-10-20', '2026-11-03', '2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29']);
    expect(fechas.every((f) => f <= sumarDias(HOY, 56))).toBe(true);
    await materializarSeries(HOY);
    expect(await visitasSerie(serie.id)).toHaveLength(7);
  });

  it('cambian todas las futuras de la serie y no las pasadas', async () => {
    const { serie } = await preparar();
    const antes = await visitasSerie(serie.id);
    // Las del 6 y 20 de octubre ya se hicieron.
    await completarVisita(antes[0].id, null);
    await completarVisita(antes[1].id, null);
    const pasadas = antes.filter((v) => v.fecha < HOY);
    const elegida = antes.find((v) => v.fecha === '2026-11-17')!;

    await editarSerieDesde(elegida.id, { visita: { hora_inicio: '16:00', descripcion: 'Corte y desbroce' } }, HOY);

    const vivas = (await db.visitas.toArray()).filter((v) => !v.eliminado_en);
    const futuras = vivas.filter((v) => v.fecha >= '2026-11-17').sort((a, b) => a.fecha.localeCompare(b.fecha));
    // Mismas fechas quincenales desde la elegida (el horizonte de la serie nueva lo decide A: ver informe).
    expect(futuras.map((v) => v.fecha).slice(0, 4)).toEqual(['2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29']);
    expect(new Set(futuras.map((v) => v.fecha)).size).toBe(futuras.length);
    for (const v of futuras) expect(v).toMatchObject({ hora_inicio: '16:00', descripcion: 'Corte y desbroce', estado: 'programada' });
    // Las anteriores (pasadas y la del 3 de noviembre) siguen igual.
    for (const p of pasadas) {
      const ahora = (await db.visitas.get(p.id))!;
      expect(ahora.eliminado_en).toBeNull();
      expect(ahora).toMatchObject({ hora_inicio: '10:00', descripcion: 'Corte de césped' });
    }
    expect((await db.visitas.get(antes[0].id))!.estado).toBe('hecha');
    // La serie original termina el día anterior y no vuelve a materializar en ese tramo.
    expect((await db.series.get(serie.id))!.fecha_fin).toBe('2026-11-16');
    await materializarSeries(HOY);
    expect((await db.visitas.toArray()).filter((v) => !v.eliminado_en && v.fecha >= '2026-11-17')).toHaveLength(futuras.length);
  });

  it('cambiar la frecuencia desde una visita mantiene las pasadas', async () => {
    const { serie } = await preparar();
    const elegida = (await visitasSerie(serie.id)).find((v) => v.fecha === '2026-11-17')!;
    await editarSerieDesde(elegida.id, { regla: { frecuencia: 'semanal' } }, HOY);
    const fechas = (await db.visitas.toArray()).filter((v) => !v.eliminado_en).map((v) => v.fecha).sort();
    expect(fechas.filter((f) => f < '2026-11-17')).toEqual(['2026-10-06', '2026-10-20', '2026-11-03']);
    expect(fechas.filter((f) => f >= '2026-11-17').slice(0, 3)).toEqual(['2026-11-17', '2026-11-24', '2026-12-01']);
  });

  it('deshacer «Esta y las siguientes» deja la serie como estaba', async () => {
    const { serie } = await preparar();
    const antes = (await visitasSerie(serie.id)).map((v) => [v.id, v.fecha, v.hora_inicio]);
    const elegida = (await visitasSerie(serie.id)).find((v) => v.fecha === '2026-11-17')!;
    const r = await editarSerieDesde(elegida.id, { visita: { hora_inicio: '16:00' } }, HOY);
    await r.deshacer();
    expect((await visitasSerie(serie.id)).map((v) => [v.id, v.fecha, v.hora_inicio])).toEqual(antes);
    expect((await db.series.get(serie.id))!.fecha_fin).toBeNull();
    expect((await db.series.get(r.serie.id))!.eliminado_en).not.toBeNull();
  });

  it('«Solo esta visita» cambia sólo esa', async () => {
    const { serie } = await preparar();
    const vs = await visitasSerie(serie.id);
    const elegida = vs.find((v) => v.fecha === '2026-11-17')!;
    await editarVisita(elegida.id, { hora_inicio: '16:00' });
    const despues = await visitasSerie(serie.id);
    expect(despues.find((v) => v.id === elegida.id)!.hora_inicio).toBe('16:00');
    expect(despues.filter((v) => v.id !== elegida.id).every((v) => v.hora_inicio === '10:00')).toBe(true);
    expect((await db.series.get(serie.id))!.fecha_fin).toBeNull();
  });
});

describe('Visitas puntuales: crear, mover y cancelar (§8.4, §10.6)', () => {
  it('crea una visita puntual con UUID y trazabilidad, en estado programada', async () => {
    const c = await nuevoCliente();
    const usuario = await leerAjuste<string>('usuario_actual', '');
    const { visita } = await crearVisita(datosVisita(c.id, { fecha: '2026-11-10', hora_inicio: null }));
    expect(visita.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(visita).toMatchObject({ estado: 'programada', serie_id: null, creado_por: usuario, modificado_por: usuario, eliminado_en: null, precio: 15000 });
  });

  it('valida los obligatorios: cliente, fecha, al menos un tipo de trabajo y precio en céntimos', async () => {
    const c = await nuevoCliente();
    await expect(crearVisita(datosVisita(''))).rejects.toThrow();
    await expect(crearVisita(datosVisita(c.id, { tipos_trabajo: [] }))).rejects.toThrow();
    await expect(crearVisita(datosVisita(c.id, { precio: 150.5 }))).rejects.toThrow();
    await expect(crearVisita(datosVisita(c.id, { fecha: '7/11/2026' }))).rejects.toThrow();
    expect(await db.visitas.count()).toBe(0);
  });

  it('mover guarda de dónde venía y el motivo; deshacer la devuelve', async () => {
    const c = await nuevoCliente();
    const { visita } = await crearVisita(datosVisita(c.id, { fecha: '2026-11-10' }));
    const r = await moverVisita(visita.id, '2026-11-12', '09:30', 'clima');
    const movida = (await db.visitas.get(visita.id))!;
    expect(movida).toMatchObject({ fecha: '2026-11-12', hora_inicio: '09:30', reprogramada_desde: '2026-11-10 10:00', motivo_reprogramacion: 'clima', estado: 'programada' });
    expect(r.visita.fecha).toBe('2026-11-12');
    await r.deshacer();
    expect((await db.visitas.get(visita.id))!).toMatchObject({ fecha: '2026-11-10', hora_inicio: '10:00' });
  });

  it('mover una visita de serie no hace que la serie la vuelva a crear en su día', async () => {
    const c = await nuevoCliente({ modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, frecuencia_visitas: 'quincenal' });
    const { serie } = await crearSerie({
      cliente_id: c.id, regla: { frecuencia: 'quincenal', dias_semana: [2], hora: '10:00', duracion: 120 }, fecha_inicio: '2026-11-10', fecha_fin: null,
      plantilla_visita: { tipos_trabajo: ['corte_cesped'], descripcion: '', ayudantes: 0, requiere_vehiculo: false, precio: null, incluida_en_abono: true },
    }, HOY);
    const primera = (await visitasSerie(serie.id))[0];
    expect(primera.fecha).toBe('2026-11-10');
    await moverVisita(primera.id, '2026-11-11', '10:00', 'clima');
    await materializarSeries(HOY);
    const fechas = (await visitasSerie(serie.id)).map((v) => v.fecha);
    expect(fechas).not.toContain('2026-11-10');
    expect(fechas).toContain('2026-11-11');
  });

  it('cancelar la deja en el historial como cancelada, con motivo; deshacer la reprograma', async () => {
    const c = await nuevoCliente();
    const { visita } = await crearVisita(datosVisita(c.id, { fecha: '2026-11-10' }));
    const r = await cancelarVisita(visita.id, '  El cliente está de viaje ');
    const cancelada = (await db.visitas.get(visita.id)) as Visita;
    expect(cancelada).toMatchObject({ estado: 'cancelada', motivo_cancelacion: 'El cliente está de viaje', eliminado_en: null });
    await r.deshacer();
    expect((await db.visitas.get(visita.id))!.estado).toBe('programada');
  });

  it('una visita cancelada de una serie no se recrea al materializar', async () => {
    const c = await nuevoCliente({ modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, frecuencia_visitas: 'quincenal' });
    const { serie } = await crearSerie({
      cliente_id: c.id, regla: { frecuencia: 'quincenal', dias_semana: [2], hora: '10:00', duracion: 120 }, fecha_inicio: '2026-11-10', fecha_fin: null,
      plantilla_visita: { tipos_trabajo: ['corte_cesped'], descripcion: '', ayudantes: 0, requiere_vehiculo: false, precio: null, incluida_en_abono: true },
    }, HOY);
    const primera = (await visitasSerie(serie.id))[0];
    await cancelarVisita(primera.id);
    await materializarSeries(HOY);
    expect((await visitasSerie(serie.id)).filter((v) => v.fecha === '2026-11-10')).toHaveLength(1);
  });
});
