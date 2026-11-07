import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { db, reiniciarBase } from '../db/db';
import { crearMovimiento, guardarAjuste, guardarSaldoInicial } from '../db/repo';
import { claveDia } from '../lib/fechas';
import { CLAVE_BORRADOR } from './Registrar';

// Feature 3 (frente B). Criterios de aceptación 1, 2, 3 y 8 (§18) y registro de gasto de punta a punta
// sobre la app completa (Hoy, barra inferior, hoja Registrar, barra Deshacer y Movimientos).

const catId = async (clave: string) => (await db.categorias.where('clave').equals(clave).first())!.id;
const cifra = (id: string) => Number(screen.getByTestId(id).getAttribute('data-valor'));
const hoja = () => screen.getByRole('dialog', { name: /Nuevo movimiento|Editar gasto/ });
const importe = () => within(hoja()).getByLabelText('Importe') as HTMLInputElement;
const guardarGasto = () => within(hoja()).getByRole('button', { name: 'Guardar gasto' }) as HTMLButtonElement;
const activos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();

async function montar() {
  const user = userEvent.setup();
  const r = render(<App />);
  await screen.findByTestId('en-caja');
  return { user, ...r };
}

async function abrirRegistrar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Registrar' }));
  return screen.findByRole('dialog', { name: 'Nuevo movimiento' });
}

beforeEach(async () => {
  await reiniciarBase('fergo-prueba-f3-ui');
  await guardarSaldoInicial(50000, 0); // 500 € en efectivo
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Criterio 1: el botón lima abre Registrar en Gasto con el teclado numérico activo', () => {
  it.each(['Hoy', 'Movimientos', 'Clientes', 'Agenda'])('desde la pestaña %s', async (pestana) => {
    const { user } = await montar();
    await user.click(screen.getByRole('button', { name: pestana }));
    const h = await abrirRegistrar(user);
    expect(within(h).getByRole('radio', { name: 'Gasto' }).getAttribute('aria-checked')).toBe('true');
    const campo = importe();
    expect(document.activeElement).toBe(campo);
    expect(campo.getAttribute('inputmode')).toBe('decimal');
  });
});

describe('Criterio 2: guardar un gasto', () => {
  it('cierra la hoja en menos de 300 ms, aparece en Movimientos y bajan "En caja" y "Ganado"', async () => {
    const { user } = await montar();
    const cajaAntes = cifra('en-caja');
    const ganadoAntes = cifra('ganado');
    expect(cajaAntes).toBe(50000);

    await abrirRegistrar(user);
    await user.type(importe(), '38,50');
    await user.click(within(hoja()).getByRole('radio', { name: 'Gasolina (vehículo)' }));

    const t0 = performance.now();
    await user.click(guardarGasto());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo movimiento' })).toBeNull(), { interval: 5 });
    const cierre = performance.now() - t0;
    expect(cierre).toBeLessThan(300);

    await waitFor(() => expect(cifra('en-caja')).toBe(cajaAntes - 3850));
    expect(cifra('ganado')).toBe(ganadoAntes - 3850);
    expect(screen.getByRole('status').textContent).toContain('Gasto guardado');

    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    expect(await screen.findByRole('button', { name: 'Gasolina, − 38,50 €. Editar' })).toBeTruthy();
  });
});

describe('Criterio 3: Deshacer en los 8 segundos siguientes', () => {
  it('el movimiento desaparece y las cifras vuelven al valor anterior', async () => {
    const { user } = await montar();
    const cajaAntes = cifra('en-caja');
    const ganadoAntes = cifra('ganado');

    await abrirRegistrar(user);
    await user.type(importe(), '38,50');
    await user.click(within(hoja()).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(guardarGasto());
    await waitFor(() => expect(cifra('en-caja')).toBe(cajaAntes - 3850));

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(cifra('en-caja')).toBe(cajaAntes));
    expect(cifra('ganado')).toBe(ganadoAntes);
    expect((await activos()).filter((m) => m.tipo === 'gasto')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await screen.findByRole('heading', { name: 'Movimientos' });
    expect(screen.queryByRole('button', { name: /Gasolina/ })).toBeNull();
  });

  it('la barra sigue a los 7,9 s y desaparece a los 8 s sin deshacer nada', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const { user } = await montar();
    await abrirRegistrar(user);
    fireEvent.change(importe(), { target: { value: '12' } });
    fireEvent.click(within(hoja()).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    fireEvent.click(guardarGasto());
    await screen.findByRole('button', { name: 'Deshacer' });
    await waitFor(() => expect(cifra('en-caja')).toBe(50000 - 1200));

    act(() => vi.advanceTimersByTime(7900));
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
    expect(cifra('en-caja')).toBe(50000 - 1200);
  });
});

describe('Criterio 8: importe atípico', () => {
  it('3.850 € en una categoría con media de 40 € pide confirmación; "Corregir" no guarda y "Sí" guarda', async () => {
    const gasolina = await catId('gasolina');
    for (const c of [3500, 4500, 4000]) {
      await crearMovimiento({ tipo: 'gasto', importe: c, fecha: new Date().toISOString(), categoria_id: gasolina, medio_pago: 'efectivo' });
    }
    const { user } = await montar();
    const cajaAntes = cifra('en-caja');

    await abrirRegistrar(user);
    await user.type(importe(), '3850');
    expect(importe().value).toBe('3.850');
    await user.click(within(hoja()).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(guardarGasto());

    const dialogo = await screen.findByRole('alertdialog', { name: '¿Seguro que son 3.850 €?' });
    await user.click(within(dialogo).getByRole('button', { name: 'Corregir' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(hoja()).toBeTruthy(); // la hoja sigue abierta para corregir
    expect(document.activeElement).toBe(importe());
    expect((await activos()).filter((m) => m.importe === 385000)).toHaveLength(0);

    await user.click(guardarGasto());
    const otra = await screen.findByRole('alertdialog', { name: '¿Seguro que son 3.850 €?' });
    await user.click(within(otra).getByRole('button', { name: 'Sí' }));
    await waitFor(() => expect(cifra('en-caja')).toBe(cajaAntes - 385000));
  });

  it('un importe habitual se guarda sin preguntar', async () => {
    const gasolina = await catId('gasolina');
    await crearMovimiento({ tipo: 'gasto', importe: 4000, fecha: new Date().toISOString(), categoria_id: gasolina, medio_pago: 'efectivo' });
    const { user } = await montar();
    await abrirRegistrar(user);
    await user.type(importe(), '45');
    await user.click(within(hoja()).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(guardarGasto());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo movimiento' })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('Registro de gasto: campos obligatorios y valores por defecto', () => {
  it('sólo importe y categoría son obligatorios', async () => {
    const { user } = await montar();
    await abrirRegistrar(user);
    expect(guardarGasto().disabled).toBe(true);

    await user.type(importe(), '12');
    expect(guardarGasto().disabled).toBe(true); // falta la categoría

    await user.clear(importe());
    await user.click(within(hoja()).getByRole('radio', { name: 'Vertedero y retirada de restos' }));
    expect(guardarGasto().disabled).toBe(true); // falta el importe

    await user.type(importe(), '0');
    expect(guardarGasto().disabled).toBe(true); // importe 0 no vale

    await user.clear(importe());
    await user.type(importe(), '12');
    expect(guardarGasto().disabled).toBe(false); // sin cliente, nota ni foto

    await user.click(guardarGasto());
    await waitFor(async () => expect((await activos()).filter((m) => m.tipo === 'gasto')).toHaveLength(1));
    const [g] = (await activos()).filter((m) => m.tipo === 'gasto');
    expect(g).toMatchObject({ importe: 1200, nota: '', cliente_id: null, foto_id: null });
  });

  it('fecha de hoy por defecto', async () => {
    const { user } = await montar();
    await abrirRegistrar(user);
    const fecha = within(hoja()).getByLabelText('Fecha') as HTMLInputElement;
    expect(fecha.value).toBe(claveDia(new Date()));
    expect(within(hoja()).getByText('Hoy')).toBeTruthy();

    await user.type(importe(), '10');
    await user.click(within(hoja()).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(guardarGasto());
    await waitFor(async () => expect((await activos()).filter((m) => m.tipo === 'gasto')).toHaveLength(1));
    const [g] = (await activos()).filter((m) => m.tipo === 'gasto');
    expect(claveDia(g.fecha)).toBe(claveDia(new Date()));
  });

  it('preselecciona el último medio de pago usado', async () => {
    const { user } = await montar();
    let h = await abrirRegistrar(user);
    expect(within(h).getByRole('radio', { name: 'Efectivo' }).getAttribute('aria-checked')).toBe('true');
    await user.type(importe(), '10');
    await user.click(within(h).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await user.click(within(h).getByRole('radio', { name: 'Bizum' }));
    await user.click(guardarGasto());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo movimiento' })).toBeNull());

    h = await abrirRegistrar(user);
    await waitFor(() => expect(within(h).getByRole('radio', { name: 'Bizum' }).getAttribute('aria-checked')).toBe('true'));
    expect(within(h).getByRole('radio', { name: 'Efectivo' }).getAttribute('aria-checked')).toBe('false');
  });
});

describe('Registro de gasto: cuadrícula por frecuencia (60 días, 8 visibles)', () => {
  it('sin historial muestra las 8 del orden inicial y "Más"', async () => {
    const { user } = await montar();
    const h = await abrirRegistrar(user);
    const grupo = within(h).getByRole('radiogroup', { name: 'Categoría' });
    const nombres = within(grupo).getAllByRole('radio').map((b) => b.getAttribute('aria-label'));
    expect(nombres).toEqual([
      'Gasolina (vehículo)', 'Alquiler de furgoneta', 'Repuestos y mantenimiento', 'Plantas, semillas y césped',
      'Productos de piscina', 'Vertedero y retirada de restos', 'Herramientas y equipos nuevos', 'Ayudantes y subcontratas',
      'Más categorías',
    ]);
  });

  it('una categoría usada en los últimos 60 días sube al principio; una de hace 61 días no', async () => {
    const telefono = await catId('telefono');
    const publicidad = await catId('publicidad');
    const ahora = Date.now();
    for (let i = 0; i < 3; i++) {
      await crearMovimiento({ tipo: 'gasto', importe: 1000, fecha: new Date(ahora - (i + 1) * 86_400_000).toISOString(), categoria_id: telefono, medio_pago: 'efectivo' });
      await crearMovimiento({ tipo: 'gasto', importe: 1000, fecha: new Date(ahora - 61 * 86_400_000).toISOString(), categoria_id: publicidad, medio_pago: 'efectivo' });
    }
    const { user } = await montar();
    const h = await abrirRegistrar(user);
    const radios = within(within(h).getByRole('radiogroup', { name: 'Categoría' })).getAllByRole('radio');
    expect(radios).toHaveLength(9);
    expect(radios[0].getAttribute('aria-label')).toBe('Teléfono');
    const nombres = radios.map((b) => b.getAttribute('aria-label'));
    expect(nombres).not.toContain('Publicidad');
    expect(nombres).not.toContain('Ayudantes y subcontratas'); // desplazada a "Más"
  });

  it('"Más" abre la lista completa y permite elegir una categoría que no está en la cuadrícula', async () => {
    const { user } = await montar();
    const h = await abrirRegistrar(user);
    await user.click(within(h).getByRole('radio', { name: 'Más categorías' }));
    const lista = await screen.findByRole('dialog', { name: 'Categorías' });
    await user.click(within(lista).getByRole('radio', { name: 'Teléfono' }));
    expect(screen.queryByRole('dialog', { name: 'Categorías' })).toBeNull();
    expect(within(h).getByRole('radio', { name: 'Más: Teléfono' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Registro de gasto: borrador (§5.1.6)', () => {
  it('si se cierra la app a medias, al volver ofrece recuperarlo con su importe', async () => {
    const { user, unmount } = await montar();
    await abrirRegistrar(user);
    await user.type(importe(), '38,50');
    await user.click(within(hoja()).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    // Esperar importe Y categoría en el borrador: con la PC cargada la categoría se escribía después del importe y
    // la prueba cerraba la app antes (falla intermitente en la copia limpia del commit de la ola 4).
    await waitFor(async () => expect((await db.ajustes.get(CLAVE_BORRADOR))?.valor)
      .toMatchObject({ textoImporte: '38,50', categoriaId: expect.anything() }), { timeout: 5000 });
    unmount(); // se cierra la app sin guardar

    const user2 = userEvent.setup();
    render(<App />);
    const aviso = await screen.findByRole('alertdialog', { name: 'Tenías un gasto a medias de 38,50 €. ¿Seguir?' });
    await user2.click(within(aviso).getByRole('button', { name: 'Seguir' }));
    const h = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    expect((within(h).getByLabelText('Importe') as HTMLInputElement).value).toBe('38,50');
    expect(within(h).getByRole('radio', { name: 'Gasolina (vehículo)' }).getAttribute('aria-checked')).toBe('true');
    expect(within(h).getByRole('button', { name: 'Guardar gasto' })).toHaveProperty('disabled', false);
  });

  it('"Descartar" en el aviso borra el borrador', async () => {
    await guardarAjuste(CLAVE_BORRADOR, { textoImporte: '38,50', categoriaId: null, fechaClave: claveDia(new Date()), medio: 'efectivo', nota: '' });
    const { user } = await montar();
    const aviso = await screen.findByRole('alertdialog', { name: 'Tenías un gasto a medias de 38,50 €. ¿Seguir?' });
    await user.click(within(aviso).getByRole('button', { name: 'Descartar' }));
    await waitFor(async () => expect(await db.ajustes.get(CLAVE_BORRADOR)).toBeUndefined());
  });

  it('cerrar la hoja con datos pide confirmar el descarte y descartar borra el borrador', async () => {
    const { user } = await montar();
    await abrirRegistrar(user);
    await user.type(importe(), '12');
    await waitFor(async () => expect(await db.ajustes.get(CLAVE_BORRADOR)).toBeTruthy());
    await user.click(within(hoja()).getByRole('button', { name: 'Cerrar' }));
    const dialogo = await screen.findByRole('alertdialog', { name: '¿Descartar este gasto?' });
    await user.click(within(dialogo).getByRole('button', { name: 'Descartar' }));
    // El cierre espera a borrar el borrador en IndexedDB: es asíncrono.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo movimiento' })).toBeNull());
    await waitFor(async () => expect(await db.ajustes.get(CLAVE_BORRADOR)).toBeUndefined());
  });

  it('al guardar el gasto el borrador desaparece', async () => {
    const { user } = await montar();
    await abrirRegistrar(user);
    await user.type(importe(), '12');
    await user.click(within(hoja()).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    await waitFor(async () => expect(await db.ajustes.get(CLAVE_BORRADOR)).toBeTruthy());
    await user.click(guardarGasto());
    await waitFor(async () => expect(await db.ajustes.get(CLAVE_BORRADOR)).toBeUndefined());
  });
});

describe('Edición y borrado desde Movimientos', () => {
  async function conUnGasto() {
    await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    const r = await montar();
    await waitFor(() => expect(cifra('en-caja')).toBe(50000 - 3850));
    await r.user.click(screen.getByRole('button', { name: 'Movimientos' }));
    return r;
  }

  it('editar el importe actualiza las cifras y se puede deshacer', async () => {
    const { user } = await conUnGasto();
    await user.click(await screen.findByRole('button', { name: 'Gasolina, − 38,50 €. Editar' }));
    const h = await screen.findByRole('dialog', { name: 'Editar gasto' });
    const campo = within(h).getByLabelText('Importe') as HTMLInputElement;
    expect(campo.value).toBe('38,50');
    await user.clear(campo);
    await user.type(campo, '40');
    await user.click(within(h).getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('button', { name: 'Gasolina, − 40 €. Editar' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Gasto editado');

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByRole('button', { name: 'Gasolina, − 38,50 €. Editar' })).toBeTruthy();
  });

  it('eliminar es lógico, quita el gasto de la lista y deshacer lo devuelve', async () => {
    const { user } = await conUnGasto();
    await user.click(await screen.findByRole('button', { name: 'Gasolina, − 38,50 €. Editar' }));
    const h = await screen.findByRole('dialog', { name: 'Editar gasto' });
    await user.click(within(h).getByRole('button', { name: 'Eliminar' }));
    const dialogo = await screen.findByRole('alertdialog', { name: '¿Eliminar este gasto?' });
    await user.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Gasolina, − 38,50 €. Editar' })).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('Gasto eliminado');
    const filas = await db.movimientos.where('tipo').equals('gasto').toArray();
    expect(filas).toHaveLength(1);
    expect(filas[0].eliminado_en).toEqual(expect.any(String));

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByRole('button', { name: 'Gasolina, − 38,50 €. Editar' })).toBeTruthy();
  });
});
