import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { db, reiniciarBase } from '../db/db';
import { crearMovimiento, editarMovimiento, eliminarMovimiento, guardarSaldoInicial } from '../db/repo';
import { claveDia, sumarDias } from '../lib/fechas';

// Regresiones del QA de la ola 2 (review/factory/fa4a9e72e841-ola-2-qa.md).

const catId = async (clave: string) => (await db.categorias.where('clave').equals(clave).first())!.id;
const hoja = () => screen.getByRole('dialog', { name: /Nuevo movimiento|Editar gasto/ });
const gastos = () => db.movimientos.filter((m) => m.tipo === 'gasto' && !m.eliminado_en).toArray();

async function montar() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('en-caja');
  return user;
}

beforeEach(async () => {
  await reiniciarBase('fergo-prueba-qa-ola2');
  await guardarSaldoInicial(50000, 0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('QA ola 2 · Registrar', () => {
  it('un doble toque en «Guardar gasto» guarda un solo gasto', async () => {
    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    fireEvent.change(within(hoja()).getByLabelText('Importe'), { target: { value: '12' } });
    fireEvent.click(within(hoja()).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    const boton = within(hoja()).getByRole('button', { name: 'Guardar gasto' });
    fireEvent.click(boton);
    fireEvent.click(boton);
    await screen.findByRole('button', { name: 'Deshacer' });
    await waitFor(async () => expect(await gastos()).toHaveLength(1));
  });

  it('no acepta una fecha a más de 7 días aunque se escriba a mano', async () => {
    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    const fecha = within(hoja()).getByLabelText('Fecha') as HTMLInputElement;
    const hoy = claveDia(new Date());
    fireEvent.change(fecha, { target: { value: sumarDias(hoy, 30) } });
    expect(fecha.value).toBe(hoy);
    fireEvent.change(fecha, { target: { value: sumarDias(hoy, 7) } });
    expect(fecha.value).toBe(sumarDias(hoy, 7));
  });

  it('editar sólo la nota de un importe atípico ya confirmado no vuelve a preguntar', async () => {
    const gasolina = await catId('gasolina');
    const fecha = new Date().toISOString();
    for (const c of [3500, 4500, 4000]) await crearMovimiento({ tipo: 'gasto', importe: c, fecha, categoria_id: gasolina, medio_pago: 'efectivo' });
    await crearMovimiento({ tipo: 'gasto', importe: 385000, fecha, categoria_id: gasolina, medio_pago: 'efectivo' });
    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await user.click(await screen.findByRole('button', { name: 'Gasolina, − 3.850 €. Editar' }));
    const h = await screen.findByRole('dialog', { name: 'Editar gasto' });
    await user.type(within(h).getByPlaceholderText('Opcional'), 'Motor');
    await user.click(within(h).getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('button', { name: 'Motor, − 3.850 €. Editar' })).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('QA ola 2 · Movimientos', () => {
  it('a final de mes se puede ir al mes siguiente para ver un gasto previsto', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-28T10:00:00Z') });
    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await screen.findByRole('heading', { name: 'Movimientos' });
    const siguiente = screen.getByRole('button', { name: 'Mes siguiente' }) as HTMLButtonElement;
    expect(siguiente.disabled).toBe(false);
    await user.click(siguiente);
    expect(screen.getByText('Noviembre')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Mes siguiente' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('QA ola 2 · repositorio', () => {
  it('deshacer una edición no recupera un movimiento eliminado después', async () => {
    const { movimiento } = await crearMovimiento({ tipo: 'gasto', importe: 1000, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    const edicion = await editarMovimiento(movimiento.id, { importe: 2000 });
    await eliminarMovimiento(movimiento.id);
    await edicion.deshacer();
    const m = await db.movimientos.get(movimiento.id);
    expect(m?.importe).toBe(1000);
    expect(m?.eliminado_en).toEqual(expect.any(String));
  });
});
