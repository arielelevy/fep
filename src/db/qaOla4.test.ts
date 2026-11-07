import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { db, reiniciarBase } from './db';
import {
  SinPermiso, crearCliente, crearMovimiento, devolverFianza, devolverPrestamos, editarCliente, guardarAjuste, leerAjuste,
  type DatosCliente,
} from './repo';
import { calcularPendientes, totalPendiente } from '../domain/pendientes';

// Los 6 hallazgos del QA de la ola 4 asignados a la ola 5 (review/factory/fa4a9e72e841-ola-3-qa.md), uno por prueba.

const activos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();
const fecha = () => new Date().toISOString();
const datosCliente = (extra: Partial<DatosCliente> = {}): DatosCliente => ({
  nombre: 'Chalet Las Encinas', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: '', municipio: '',
  lat: null, lon: null, servicios: ['piscina'], modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, frecuencia_visitas: 'quincenal',
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 60, tipos_trabajo_habituales: ['piscina'], precio_habitual: null,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true, ...extra,
});
const fianza = async () =>
  (await crearMovimiento({ tipo: 'fianza_entregada', importe: 15000, fecha: fecha(), categoria_id: null, medio_pago: 'efectivo', fianza: { entregada_a: 'Alquileres Sur', motivo: 'Furgoneta' } })).movimiento;

beforeEach(async () => {
  await reiniciarBase('fergo');
  window.localStorage.setItem('fergo.guia.vista', '1');
});
afterEach(() => vi.useRealTimers());

describe('QA ola 4 · hallazgo 3: una fianza no se puede devolver ni descontar dos veces', () => {
  it('la segunda devolución falla y no crea movimientos; una devolución parcial deja devolver solo el resto', async () => {
    const f = await fianza();
    await devolverFianza(f.id, 12000, 'efectivo'); // 120 devueltos + 30 de descuento: resuelta
    await expect(devolverFianza(f.id, 12000, 'efectivo')).rejects.toThrow('ya está devuelta');
    const ligados = (await activos()).filter((m) => m.fianza_id === f.id);
    expect(ligados.map((m) => [m.tipo, m.importe]).sort()).toEqual([['fianza_devuelta', 12000], ['gasto', 3000]]);

    const g = await fianza();
    await crearMovimiento({ tipo: 'fianza_devuelta', importe: 5000, fecha: fecha(), categoria_id: null, medio_pago: 'efectivo', fianza_id: g.id });
    await expect(devolverFianza(g.id, 15000, 'efectivo')).rejects.toThrow('Importe no válido'); // solo quedan 100 €
    await devolverFianza(g.id, 10000, 'efectivo');
    expect((await activos()).filter((m) => m.fianza_id === g.id && m.tipo === 'gasto')).toHaveLength(0);
  });
});

describe('QA ola 4 · hallazgo 5: el permiso falla cerrado', () => {
  it('si el usuario actual no existe, entra como colaborador (sin permisos de titular)', async () => {
    await guardarAjuste('usuario_actual', 'no-existe');
    await expect(crearMovimiento({ tipo: 'gasto', importe: 1000, fecha: fecha(), categoria_id: (await db.categorias.toArray())[0].id, medio_pago: 'efectivo' }))
      .rejects.toBeInstanceOf(SinPermiso);
    await expect(crearCliente(datosCliente())).rejects.toBeInstanceOf(SinPermiso);
    // Lo mínimo de un colaborador sí se puede.
    await expect(crearMovimiento({ tipo: 'aporte', importe: 1000, fecha: fecha(), categoria_id: null, medio_pago: 'efectivo' })).resolves.toBeTruthy();
  });
});

describe('QA ola 4 · hallazgo 6: devolución repartida entre préstamos en una sola transacción', () => {
  it('reparte del más antiguo al más reciente y, si falla a mitad, no guarda ninguna', async () => {
    const p1 = (await crearMovimiento({ tipo: 'prestamo', importe: 10000, fecha: '2026-10-01T10:00:00.000Z', categoria_id: null, medio_pago: 'transferencia' })).movimiento;
    const p2 = (await crearMovimiento({ tipo: 'prestamo', importe: 20000, fecha: '2026-10-05T10:00:00.000Z', categoria_id: null, medio_pago: 'transferencia' })).movimiento;
    // Falla al crear la segunda devolución: la primera tampoco debe quedar.
    const original = db.movimientos.add.bind(db.movimientos);
    let n = 0;
    const espia = vi.spyOn(db.movimientos, 'add').mockImplementation(((m: Parameters<typeof original>[0]) => (++n === 2 ? Promise.reject(new Error('fallo')) : original(m))) as never);
    await expect(devolverPrestamos({ importe: 15000, fecha: fecha(), medio_pago: 'efectivo' })).rejects.toThrow();
    espia.mockRestore();
    expect((await activos()).filter((m) => m.tipo === 'devolucion_prestamo')).toHaveLength(0);

    const { movimientos, deshacer } = await devolverPrestamos({ importe: 15000, fecha: fecha(), medio_pago: 'efectivo' });
    expect(movimientos.map((m) => [m.prestamo_id, m.importe])).toEqual([[p1.id, 10000], [p2.id, 5000]]);
    await expect(devolverPrestamos({ importe: 20000, fecha: fecha(), medio_pago: 'efectivo' })).rejects.toThrow('más de lo que queda');
    await deshacer();
    expect((await activos()).filter((m) => m.tipo === 'devolucion_prestamo')).toHaveLength(0);
  });
});

describe('QA ola 4 · hallazgo 9: la categoría del descuento de fianza se valida', () => {
  it('si «Alquiler de furgoneta» falta, se vuelve a crear en Movilidad y el descuento la usa', async () => {
    const cat = await db.categorias.where('clave').equals('alquiler_furgoneta').first();
    await db.categorias.delete(cat!.id);
    const f = await fianza();
    await devolverFianza(f.id, 12000, 'efectivo');
    const nueva = await db.categorias.where('clave').equals('alquiler_furgoneta').first();
    expect(nueva).toMatchObject({ grupo: 'Movilidad', eliminado_en: null });
    expect((await activos()).find((m) => m.tipo === 'gasto')).toMatchObject({ categoria_id: nueva!.id, importe: 3000, nota: 'Descuento de fianza' });
  });
});

describe('QA ola 4 · hallazgo 4: el borrador del gasto se limpia al guardar un cobro, aporte o fianza', () => {
  it('tras guardar un aporte no se ofrece recuperar el gasto a medias', async () => {
    const user = userEvent.setup();
    const { unmount } = render(createElement(App));
    await screen.findByTestId('en-caja');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await user.keyboard('38,5'); // empieza un gasto…
    await waitFor(async () => expect(await leerAjuste('borrador_registro', null)).not.toBeNull());
    const hoja = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    await user.click(within(hoja).getByRole('radio', { name: 'Aporte' })); // …y lo registra como aporte
    await user.click(within(screen.getByRole('dialog', { name: 'Nuevo movimiento' })).getByRole('button', { name: 'Guardar aporte' }));
    await waitFor(async () => expect((await activos()).filter((m) => m.tipo === 'aporte')).toHaveLength(1));
    await waitFor(async () => expect(await leerAjuste('borrador_registro', null)).toBeNull());
    unmount();
    render(createElement(App));
    await screen.findByTestId('en-caja');
    expect(screen.queryByRole('alertdialog', { name: /gasto a medias/ })).toBeNull();
  });
});

describe('QA ola 4 · hallazgo 2: lo vencido de un abono se conserva y cada mes usa su cuota', () => {
  it('desactivar no borra lo que debía; subir la cuota no cambia los meses pasados', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T10:00:00Z'));
    const { cliente } = await crearCliente(datosCliente()); // alta el 5-sep, cobra el día 1: primera cuota el 1-oct
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    await editarCliente(cliente.id, { cuota_abono: 12000 }); // desde el 15-oct, 120 €
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
    await editarCliente(cliente.id, { activo: false }); // baja el 20-nov
    vi.setSystemTime(new Date('2027-01-10T10:00:00Z'));
    const c = (await db.clientes.get(cliente.id))!;
    const p = calcularPendientes([c], [], [], new Date());
    expect(p.map((x) => [x.periodo, x.importe])).toEqual([['2026-10', 9000], ['2026-11', 12000]]); // dic y ene no: está de baja
    expect(totalPendiente(p)).toBe(21000);

    // Reactivarlo en enero: vuelve a vencer desde ahí, sin cobrar los meses de baja.
    await editarCliente(cliente.id, { activo: true });
    vi.setSystemTime(new Date('2027-02-02T10:00:00Z'));
    const p2 = calcularPendientes([(await db.clientes.get(cliente.id))!], [], [], new Date());
    expect(p2.map((x) => x.periodo)).toEqual(['2026-10', '2026-11', '2027-02']);
  });
});
