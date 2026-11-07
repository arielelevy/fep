import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { db, reiniciarBase } from './db/db';
import { crearMovimiento, guardarAjuste, guardarSaldoInicial, leerAjuste } from './db/repo';
import { formatearEuros } from './lib/dinero';
import { claveDia, claveMes, sumarDias } from './lib/fechas';

// Pruebas de interfaz de la ola 2: criterios de aceptación 1, 2, 3 y 8 de §18 y comportamiento de Registrar.

const valor = (id: string) => Number(screen.getByTestId(id).getAttribute('data-valor'));
const catId = async (clave: string) => (await db.categorias.where('clave').equals(clave).first())!.id;
const activos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();

async function montar() {
  const user = userEvent.setup();
  const r = render(<App />);
  await screen.findByTestId('en-caja');
  return { user, ...r };
}

async function abrirRegistrar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Registrar' }));
  return screen.getByRole('dialog', { name: 'Nuevo movimiento' });
}

beforeEach(async () => {
  await reiniciarBase('fergo');
  window.localStorage.removeItem('fergo.movimientos.filtro');
  window.localStorage.setItem('fergo.guia.vista', '1');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('Criterio 1 · botón lima abre Registrar en Gasto con el teclado numérico', () => {
  it('desde cualquier pestaña', async () => {
    const { user } = await montar();
    for (const pestana of ['Hoy', 'Movimientos', 'Clientes', 'Agenda']) {
      await user.click(screen.getByRole('button', { name: pestana }));
      const hoja = await abrirRegistrar(user);
      expect(within(hoja).getByRole('radio', { name: 'Gasto' }).getAttribute('aria-checked')).toBe('true');
      const importe = within(hoja).getByLabelText('Importe') as HTMLInputElement;
      expect(importe.getAttribute('inputmode')).toBe('decimal');
      expect(document.activeElement).toBe(importe);
      await user.click(within(hoja).getByRole('button', { name: 'Cerrar' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  });
});

describe('Criterio 2 · guardar un gasto en 3 toques', () => {
  it('cierra la hoja en menos de 300 ms, aparece en Movimientos y bajan En caja y Ganado', async () => {
    await guardarSaldoInicial(50000, 0);
    const { user } = await montar();
    await waitFor(() => expect(valor('en-caja')).toBe(50000));
    expect(valor('ganado')).toBe(0);

    const hoja = await abrirRegistrar(user); // toque 1
    await user.keyboard('38,50'); // el foco ya está en el importe
    await user.click(within(hoja).getByRole('radio', { name: 'Gasolina (vehículo)' })); // toque 2
    const t0 = performance.now();
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' })); // toque 3
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { interval: 5 });
    expect(performance.now() - t0).toBeLessThan(300);

    expect(screen.getByRole('status').textContent).toContain('Gasto guardado');
    await waitFor(() => expect(valor('en-caja')).toBe(50000 - 3850));
    expect(valor('ganado')).toBe(-3850);

    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    expect(await screen.findByRole('button', { name: `Gasolina, ${formatearEuros(-3850)}. Editar` })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'HOY' })).toBeTruthy();
    const [m] = await activos().then((x) => x.filter((y) => y.tipo === 'gasto'));
    expect(m).toMatchObject({ importe: 3850, medio_pago: 'efectivo', nota: '' });
    expect(claveDia(m.fecha)).toBe(claveDia(new Date()));
  });
});

describe('Criterio 3 · deshacer en los 8 segundos siguientes', () => {
  it('el movimiento desaparece y las cifras vuelven al valor anterior', async () => {
    await guardarSaldoInicial(50000, 0);
    const { user } = await montar();
    const hoja = await abrirRegistrar(user);
    await user.keyboard('38,50');
    await user.click(within(hoja).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    await waitFor(() => expect(valor('en-caja')).toBe(46150));

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(valor('en-caja')).toBe(50000));
    expect(valor('ganado')).toBe(0);
    expect((await activos()).filter((m) => m.tipo === 'gasto')).toHaveLength(0);
    expect(await db.movimientos.where('tipo').equals('gasto').count()).toBe(1); // borrado lógico

    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await user.click(await screen.findByRole('radio', { name: 'Gastos' }));
    expect(await screen.findByText(/Aún no hay movimientos en/)).toBeTruthy();
  });
});

describe('Criterio 8 · importe atípico', () => {
  it('pide confirmación con 3.850 € en una categoría con media de 40 €', async () => {
    await crearMovimiento({ tipo: 'gasto', importe: 4000, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    const { user } = await montar();
    const hoja = await abrirRegistrar(user);
    await user.keyboard('3850');
    expect((within(hoja).getByLabelText('Importe') as HTMLInputElement).value).toBe('3.850');
    await user.click(within(hoja).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));

    const aviso = await screen.findByRole('alertdialog', { name: '¿Seguro que son 3.850 €?' });
    await user.click(within(aviso).getByRole('button', { name: 'Corregir' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Nuevo movimiento' })).toBeTruthy();
    expect(await activos()).toHaveLength(1);

    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí' }));
    await waitFor(async () => expect(await activos()).toHaveLength(2));
  });

  it('no pregunta con un importe normal', async () => {
    await crearMovimiento({ tipo: 'gasto', importe: 4000, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    const { user } = await montar();
    const hoja = await abrirRegistrar(user);
    await user.keyboard('45');
    await user.click(within(hoja).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(async () => expect(await activos()).toHaveLength(2));
  });
});

describe('Registrar · campos obligatorios y valores por defecto (§5.1)', () => {
  it('solo importe y categoría son obligatorios', async () => {
    const { user } = await montar();
    const hoja = await abrirRegistrar(user);
    const guardar = within(hoja).getByRole('button', { name: 'Guardar gasto' }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    await user.keyboard('12');
    expect(guardar.disabled).toBe(true);
    await user.click(within(hoja).getByRole('radio', { name: 'Vertedero y retirada de restos' }));
    expect(guardar.disabled).toBe(false);
    await user.clear(within(hoja).getByLabelText('Importe'));
    expect(guardar.disabled).toBe(true);
  });

  it('fecha de hoy y último medio de pago usado', async () => {
    await guardarAjuste('ultimo_medio_pago', 'bizum');
    const { user } = await montar();
    const hoja = await abrirRegistrar(user);
    expect(within(hoja).getByText('Hoy')).toBeTruthy();
    expect(within(hoja).getByRole('radio', { name: 'Bizum' }).getAttribute('aria-checked')).toBe('true');
    expect(within(hoja).getByRole('radio', { name: 'Transferencia' })).toBeTruthy();
    expect(within(hoja).getByLabelText('Foto del ticket')).toBeTruthy();
  });

  it('las categorías más usadas en 60 días suben a la cuadrícula; el resto va a "Más"', async () => {
    const riego = await catId('material_riego');
    for (let i = 0; i < 3; i++) await crearMovimiento({ tipo: 'gasto', importe: 1000, fecha: new Date().toISOString(), categoria_id: riego, medio_pago: 'efectivo' });
    const { user } = await montar();
    const hoja = await abrirRegistrar(user);
    const cuadricula = within(hoja).getByRole('radiogroup', { name: 'Categoría' });
    const nombres = within(cuadricula).getAllByRole('radio').map((b) => b.getAttribute('aria-label'));
    expect(nombres[0]).toBe('Material de riego');
    expect(nombres).toHaveLength(9); // 8 categorías + Más
    expect(nombres).not.toContain('Ayudantes y subcontratas');

    await user.click(within(hoja).getByRole('radio', { name: 'Más categorías' }));
    const mas = screen.getByRole('dialog', { name: 'Categorías' });
    await user.type(within(mas).getByRole('searchbox'), 'ayud');
    await user.click(within(mas).getByRole('radio', { name: /Ayudantes y subcontratas/ }));
    expect(within(hoja).getByRole('radio', { name: 'Más: Ayudantes y subcontratas' }).getAttribute('aria-checked')).toBe('true');
  });

  it('permite registrar en un día anterior con el selector de fecha', async () => {
    const { user } = await montar();
    const hoja = await abrirRegistrar(user);
    await user.keyboard('20');
    await user.click(within(hoja).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    const ayer = sumarDias(claveDia(new Date()), -1);
    fireEvent.change(within(hoja).getByLabelText('Fecha'), { target: { value: ayer } });
    expect(within(hoja).getByText('Ayer')).toBeTruthy();
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    await waitFor(async () => expect(await activos()).toHaveLength(1));
    expect(claveDia((await activos())[0].fecha)).toBe(ayer);
  });
});

describe('Borrador (§5.1.6)', () => {
  it('ofrece recuperar un gasto a medias al volver a la app', async () => {
    const primera = await montar();
    await abrirRegistrar(primera.user);
    await primera.user.keyboard('38,5');
    await waitFor(async () => expect((await leerAjuste<{ textoImporte: string } | null>('borrador_registro', null))?.textoImporte).toBe('38,5'));
    primera.unmount(); // se cierra la app a mitad

    const { user } = await montar();
    const aviso = await screen.findByRole('alertdialog', { name: 'Tenías un gasto a medias de 38,50 €. ¿Seguir?' });
    await user.click(within(aviso).getByRole('button', { name: 'Seguir' }));
    const hoja = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    expect((within(hoja).getByLabelText('Importe') as HTMLInputElement).value).toBe('38,5');

    await user.click(within(hoja).getByRole('button', { name: 'Cerrar' }));
    const descartar = await screen.findByRole('alertdialog', { name: '¿Descartar este gasto?' });
    await user.click(within(descartar).getByRole('button', { name: 'Descartar' }));
    await waitFor(async () => expect(await leerAjuste('borrador_registro', null)).toBeNull());
  });

  it('el borrador desaparece al guardar', async () => {
    const { user } = await montar();
    const hoja = await abrirRegistrar(user);
    await user.keyboard('10');
    await user.click(within(hoja).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    await waitFor(async () => expect(await activos()).toHaveLength(1));
    await waitFor(async () => expect(await leerAjuste('borrador_registro', null)).toBeNull());
  });
});

describe('Movimientos · editar y eliminar (§10.3.5)', () => {
  it('edita importe y fecha, y deshace la edición', async () => {
    await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    const { user } = await montar();
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await user.click(await screen.findByRole('button', { name: `Gasolina, ${formatearEuros(-3850)}. Editar` }));
    const hoja = screen.getByRole('dialog', { name: 'Editar gasto' });
    const importe = within(hoja).getByLabelText('Importe');
    await user.clear(importe);
    await user.type(importe, '40');
    const ayer = sumarDias(claveDia(new Date()), -1);
    fireEvent.change(within(hoja).getByLabelText('Fecha'), { target: { value: ayer } });
    await user.click(within(hoja).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(async () => expect((await activos())[0]).toMatchObject({ importe: 4000, version: 2 }));
    expect(claveDia((await activos())[0].fecha)).toBe(ayer);
    if (claveMes(ayer) === claveMes(new Date())) expect(await screen.findByRole('heading', { name: 'AYER' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await activos())[0].importe).toBe(3850));
    expect(claveDia((await activos())[0].fecha)).toBe(claveDia(new Date()));
  });

  it('elimina con borrado lógico y se puede deshacer', async () => {
    await guardarSaldoInicial(10000, 0);
    await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    const { user } = await montar();
    await waitFor(() => expect(valor('en-caja')).toBe(6150));
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await user.click(await screen.findByRole('button', { name: `Gasolina, ${formatearEuros(-3850)}. Editar` }));
    await user.click(within(screen.getByRole('dialog', { name: 'Editar gasto' })).getByRole('button', { name: 'Eliminar' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Gasolina/ })).toBeNull());
    const borrado = (await db.movimientos.where('tipo').equals('gasto').toArray())[0];
    expect(borrado.eliminado_en).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Gasto eliminado');

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByRole('button', { name: `Gasolina, ${formatearEuros(-3850)}. Editar` })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(valor('en-caja')).toBe(6150));
  });

  it('muestra las tarjetas del mes y la línea de inversión en equipo', async () => {
    await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    await crearMovimiento({ tipo: 'gasto', importe: 12000, fecha: new Date().toISOString(), categoria_id: await catId('herramientas'), medio_pago: 'tarjeta' });
    const { user } = await montar();
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await waitFor(() => expect(valor('gastado-mes')).toBe(-3850));
    expect(screen.getByText('Más 120 € en equipo')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Mes siguiente' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Primer uso, estados y guía de instalación', () => {
  it('bienvenida de 3 pasos y saldo inicial que cuenta en caja pero no en Ganado', async () => {
    const { user } = await montar();
    const pasos = screen.getByRole('region', { name: 'Para empezar' });
    await user.click(within(pasos).getByRole('checkbox', { name: /Añade tu dinero actual/ }));
    const hoja = screen.getByRole('dialog', { name: 'Tu dinero actual' });
    await user.type(within(hoja).getByLabelText('Efectivo'), '300');
    await user.type(within(hoja).getByLabelText('Banco'), '1200');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(valor('en-caja')).toBe(150000));
    expect(valor('ganado')).toBe(0);
    expect(within(pasos).getByRole('checkbox', { name: /Añade tu dinero actual/ }).getAttribute('aria-checked')).toBe('true');

    await user.click(within(pasos).getByRole('checkbox', { name: /primer cliente/ }));
    await user.click(within(pasos).getByRole('checkbox', { name: /Activa los avisos/ }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Para empezar' })).toBeNull());
  });

  it('Hoy sin visitas muestra su estado vacío', async () => {
    await montar();
    expect(screen.getByText('Hoy no tienes visitas')).toBeTruthy();
  });

  it('muestra la banda "Sin conexión" sin bloquear el registro', async () => {
    const { user } = await montar();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('Sin conexión. Lo guardo y lo envío al volver.')).toBeTruthy();
    const hoja = await abrirRegistrar(user);
    await user.keyboard('5');
    await user.click(within(hoja).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    await waitFor(async () => expect(await activos()).toHaveLength(1));
  });

  it('si falla el guardado, avisa sin perder lo escrito', async () => {
    const { user } = await montar();
    const hoja = await abrirRegistrar(user);
    await user.keyboard('38,50');
    await user.click(within(hoja).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    const espia = vi.spyOn(db.movimientos, 'add').mockRejectedValueOnce(new Error('fallo'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    expect((await within(hoja).findByRole('alert')).textContent).toContain('No se pudo guardar');
    expect((within(hoja).getByLabelText('Importe') as HTMLInputElement).value).toBe('38,50');
    espia.mockRestore();
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    await waitFor(async () => expect(await activos()).toHaveLength(1));
  });

  it('abierta en el navegador sin instalar, muestra la guía de instalación', async () => {
    window.localStorage.removeItem('fergo.guia.vista');
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Instala FERGO' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Seguir en el navegador' }));
    expect(await screen.findByRole('heading', { name: /Hola, Felipe/ })).toBeTruthy();
  });
});
