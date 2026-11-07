import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { db, reiniciarBase } from '../db/db';
import { anotarTrabajo, crearCliente, crearMovimiento, type DatosCliente } from '../db/repo';
import { claveMes, nombreMes, sumarMeses } from '../lib/fechas';

// QA de la ola 4: correcciones del /code-review en RegistrarDinero (editar un cobro, abono adelantado y
// tope al editar una devolución de préstamo).

const activos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();
const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const datosCliente = (extra: Partial<DatosCliente> = {}): DatosCliente => ({
  nombre: 'Fam. García', tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Pez 3',
  municipio: 'Madrid', lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
  frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [],
  precio_habitual: 15000, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true, ...extra,
});

async function montar() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('en-caja');
  return user;
}

beforeEach(async () => {
  await reiniciarBase('fergo');
  window.localStorage.setItem('fergo.guia.vista', '1');
  window.localStorage.removeItem('fergo.movimientos.filtro');
});

describe('QA ola 4 · editar y adelantar cobros', () => {
  it('cambiar sólo la nota de un cobro no lo pasa a otra deuda', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const vieja = await anotarTrabajo({ cliente_id: cliente.id, concepto: 'Poda', precio: 5000, cobrado: 0, medio_pago: 'efectivo', fecha: diasAtras(10) });
    const nueva = await anotarTrabajo({ cliente_id: cliente.id, concepto: 'Siega', precio: 4000, cobrado: 0, medio_pago: 'efectivo' });
    const cobroTrabajo = (await db.categorias.where('clave').equals('cobro_trabajo').first())!.id;
    await crearMovimiento({
      tipo: 'cobro', importe: 4000, fecha: new Date().toISOString(), categoria_id: cobroTrabajo, medio_pago: 'efectivo', cliente_id: cliente.id,
      saldos: [{ clave: `deuda:${nueva.deuda.id}`, importe: 4000 }], periodo_abono: null,
    });

    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await user.click(await screen.findByRole('button', { name: /^Fam\. García, \+ 40 €/ }));
    const h = await screen.findByRole('dialog', { name: 'Editar cobro' });
    await user.type(within(h).getByPlaceholderText('Opcional'), 'Siega de octubre');
    await user.click(within(h).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(async () => expect((await activos()).find((m) => m.tipo === 'cobro')?.nota).toBe('Siega de octubre'));
    const cobro = (await activos()).find((m) => m.tipo === 'cobro')!;
    expect(cobro.saldos).toEqual([{ clave: `deuda:${nueva.deuda.id}`, importe: 4000 }]);
    expect(cobro.saldos?.some((s) => s.clave === `deuda:${vieja.deuda.id}`)).toBe(false);
  });

  it('con el mes en curso ya pagado, el abono adelantado va al mes siguiente', async () => {
    const hoy = new Date().getDate();
    const { cliente } = await crearCliente(datosCliente({ nombre: 'Chalet Las Encinas', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: hoy >= 28 ? 1 : hoy + 1 }));
    const mes = claveMes(new Date());
    const siguiente = sumarMeses(mes, 1);
    const cobroAbono = (await db.categorias.where('clave').equals('cobro_abono').first())!.id;
    await crearMovimiento({
      tipo: 'cobro', importe: 9000, fecha: new Date().toISOString(), categoria_id: cobroAbono, medio_pago: 'efectivo', cliente_id: cliente.id,
      saldos: [{ clave: `abono:${mes}`, importe: 9000 }], periodo_abono: mes,
    });

    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Nuevo movimiento' })).getByRole('radio', { name: 'Cobro' }));
    const hoja = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    await user.click(within(hoja).getByRole('button', { name: /Cliente/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Elegir cliente' })).getByRole('button', { name: /Chalet Las Encinas/ }));
    expect(within(hoja).getByRole('radio', { name: `Abono ${nombreMes(siguiente)}` }).getAttribute('aria-checked')).toBe('true');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar cobro' }));

    await waitFor(async () => expect((await activos()).filter((m) => m.tipo === 'cobro')).toHaveLength(2));
    const nuevo = (await activos()).find((m) => m.tipo === 'cobro' && m.periodo_abono !== mes);
    expect(nuevo?.periodo_abono).toBe(siguiente);
    expect(nuevo?.saldos).toEqual([{ clave: `abono:${siguiente}`, importe: 9000 }]);
  });

  it('editar una devolución de préstamo no deja devolver más de lo prestado', async () => {
    const fecha = new Date().toISOString();
    const { movimiento: prestamo } = await crearMovimiento({ tipo: 'prestamo', importe: 10000, fecha, categoria_id: null, medio_pago: 'transferencia' });
    await crearMovimiento({ tipo: 'devolucion_prestamo', importe: 4000, fecha, categoria_id: null, medio_pago: 'transferencia', prestamo_id: prestamo.id });

    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await user.click(await screen.findByRole('button', { name: /− 40 €/ }));
    const h = await screen.findByRole('dialog', { name: /^Editar / });
    const importe = within(h).getByLabelText('Importe');
    await user.clear(importe);
    await user.type(importe, '300');
    expect(within(h).getByText(/Como mucho 100 €\./)).toBeTruthy();
    expect((within(h).getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(importe);
    await user.type(importe, '100');
    expect((within(h).getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
