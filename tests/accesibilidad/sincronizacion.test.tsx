// Funcionamiento sin conexión y sincronización (§14; ola 9): local primero en IndexedDB (Dexie), UUID generado en el
// cliente, borrado lógico, cola de cambios sin conexión, fotos que se suben en segundo plano y conflictos por campo.
// Criterio 7 de §18 de punta a punta en la app. El servidor es simulado en memoria: no hay backend real.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { db, reiniciarBase } from '../../src/db/db';
import { crearCliente, crearMovimiento, editarMovimiento, eliminarMovimiento, guardarAjuste, type DatosCliente } from '../../src/db/repo';
import { cambiosPendientes, configurarServidor, fusionarPorCampo, sincronizar, type Cambio, type ServidorSync } from '../../src/sync/sincronizacion';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const catId = async (clave: string) => (await db.categorias.where('clave').equals(clave).first())!.id;

function servidorSimulado() {
  const recibido: Cambio[] = [];
  const fotos: string[] = [];
  let fallar = false;
  const s: ServidorSync = {
    enviar: vi.fn(async (c: Cambio[]) => {
      if (fallar) throw new Error('Servidor caído');
      recibido.push(...structuredClone(c));
    }),
    subirFoto: vi.fn(async (id: string) => {
      if (fallar) throw new Error('Servidor caído');
      fotos.push(id);
    }),
  };
  return { s, recibido, fotos, fallar: (x: boolean) => (fallar = x) };
}
const enLinea = (si: boolean) => Object.defineProperty(navigator, 'onLine', { value: si, configurable: true });

beforeEach(async () => {
  await reiniciarBase('fergo');
  enLinea(true);
  window.localStorage.setItem('fergo.guia.vista', '1');
});
afterEach(() => {
  configurarServidor(null);
  enLinea(true);
});

describe('Cola de cambios (§14.2)', () => {
  it('cada alta lleva UUID del cliente y queda pendiente; al sincronizar se envía y deja de estarlo', async () => {
    const { s, recibido } = servidorSimulado();
    const { movimiento } = await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    expect(movimiento.id).toMatch(UUID);
    expect((await cambiosPendientes()).cambios.some((c) => c.tabla === 'movimientos' && c.id === movimiento.id)).toBe(true);

    expect(await sincronizar()).toMatchObject({ estado: 'sin_servidor' }); // app instalada: no hay servidor todavía
    configurarServidor(s);
    expect(await sincronizar()).toMatchObject({ estado: 'hecho' });
    expect(recibido.find((c) => c.id === movimiento.id)).toMatchObject({ tabla: 'movimientos', version: 1 });
    expect((await cambiosPendientes()).cambios).toEqual([]);
  });

  it('editar y el borrado lógico vuelven a dejar pendiente el registro, con su nueva versión y eliminado_en', async () => {
    const { s, recibido } = servidorSimulado();
    configurarServidor(s);
    const { movimiento } = await crearMovimiento({ tipo: 'gasto', importe: 1000, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    await sincronizar();
    await editarMovimiento(movimiento.id, { importe: 1500 });
    expect((await cambiosPendientes()).cambios.map((c) => [c.id, c.version])).toEqual([[movimiento.id, 2]]);
    await sincronizar();
    await eliminarMovimiento(movimiento.id);
    const [borrado] = (await cambiosPendientes()).cambios;
    expect(borrado).toMatchObject({ id: movimiento.id, version: 3 });
    expect((borrado.datos as { eliminado_en: string | null }).eliminado_en).toBeTruthy();
    expect(await db.movimientos.get(movimiento.id)).toBeTruthy(); // borrado lógico: el registro sigue en el móvil
    await sincronizar();
    expect(recibido.filter((c) => c.id === movimiento.id).map((c) => c.version)).toEqual([1, 2, 3]);
  });

  it('sin conexión no envía nada y la cola se conserva; si el servidor falla, se reintenta luego', async () => {
    const { s, recibido, fallar } = servidorSimulado();
    configurarServidor(s);
    const cliente: DatosCliente = {
      nombre: 'Ana', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: '', municipio: '', lat: null, lon: null, servicios: ['jardin'],
      modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120,
      tipos_trabajo_habituales: [], precio_habitual: null, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
    };
    await sincronizar(); // lo sembrado
    enLinea(false);
    await crearCliente(cliente);
    expect(await sincronizar()).toMatchObject({ estado: 'sin_conexion', pendientes: 1 });
    expect(s.enviar).toHaveBeenCalledTimes(1);
    enLinea(true);
    fallar(true);
    expect(await sincronizar()).toMatchObject({ estado: 'error', pendientes: 1 });
    fallar(false);
    expect(await sincronizar()).toMatchObject({ estado: 'hecho', enviados: 1 });
    expect(recibido.filter((c) => c.tabla === 'clientes')).toHaveLength(1);
  });

  it('los ajustes compartidos (preparaciones, plantillas…) también viajan; los de este móvil no', async () => {
    const { s, recibido } = servidorSimulado();
    configurarServidor(s);
    await sincronizar();
    await guardarAjuste('plantillas_material', { setos_poda: ['Lona'] });
    await guardarAjuste('borrador_registro', { textoImporte: '12' });
    const ids = (await cambiosPendientes()).cambios.map((c) => c.id);
    expect(ids).toContain('plantillas_material');
    expect(ids).not.toContain('borrador_registro');
    await sincronizar();
    expect(recibido.some((c) => c.tabla === 'ajustes' && c.id === 'usuario_actual')).toBe(false);
  });
});

describe('Conflictos: última escritura gana por campo (§14.4)', () => {
  const base = { id: 'x', nota: 'a', importe: 100, actualizado_en: '2026-11-07T10:00:00.000Z' };
  it('un campo cambiado solo en un lado se conserva aunque el otro lado sea más reciente', () => {
    const local = { ...base, nota: 'nota de Felipe', actualizado_en: '2026-11-07T11:00:00.000Z' };
    const remoto = { ...base, importe: 250, actualizado_en: '2026-11-07T12:00:00.000Z' };
    expect(fusionarPorCampo(base, local, remoto)).toEqual({ id: 'x', nota: 'nota de Felipe', importe: 250, actualizado_en: '2026-11-07T12:00:00.000Z' });
  });
  it('si el mismo campo cambió en los dos, gana el más reciente', () => {
    const local = { ...base, nota: 'vieja', actualizado_en: '2026-11-07T11:00:00.000Z' };
    const remoto = { ...base, nota: 'nueva', actualizado_en: '2026-11-07T12:00:00.000Z' };
    expect(fusionarPorCampo(base, local, remoto).nota).toBe('nueva');
    expect(fusionarPorCampo(base, { ...local, actualizado_en: '2026-11-07T13:00:00.000Z' }, remoto).nota).toBe('vieja');
  });
});

describe('Criterio 7 · gasto con foto sin conexión', () => {
  it('se guarda y se ve en la app; al recuperar conexión se sincroniza sin intervención (también la foto)', async () => {
    const { s, recibido, fotos } = servidorSimulado();
    configurarServidor(s);
    enLinea(false);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId('en-caja');
    expect(screen.getByText('Sin conexión. Lo guardo y lo envío al volver.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    await user.type(within(hoja).getByLabelText('Importe'), '38,50');
    await user.click(within(hoja).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    const ticket = new File([new Uint8Array([1, 2, 3])], 'ticket.jpg', { type: 'image/jpeg' });
    await user.upload(within(hoja).getByLabelText('Foto del ticket'), ticket);
    await waitFor(() => expect((within(hoja).getByRole('button', { name: 'Guardar gasto' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo movimiento' })).toBeNull());

    // Guardado en el móvil y visible, con el indicador de la foto sin subir; nada enviado.
    const [m] = await db.movimientos.filter((x) => x.tipo === 'gasto').toArray();
    expect(m).toMatchObject({ importe: 3850 });
    expect(m.id).toMatch(UUID);
    expect((await db.fotos.get(m.foto_id!))?.subida).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    expect(await screen.findByText(/Ticket sin subir/)).toBeTruthy();
    expect(recibido).toEqual([]);

    // Vuelve la conexión: sin tocar nada, se envía el gasto y se sube la foto.
    enLinea(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(recibido.some((c) => c.tabla === 'movimientos' && c.id === m.id)).toBe(true));
    await waitFor(() => expect(fotos).toEqual([m.foto_id]));
    await waitFor(() => expect(screen.queryByText(/Ticket sin subir/)).toBeNull());
    expect(screen.getByText(/Ticket/)).toBeTruthy();
  });
});
