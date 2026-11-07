// Chincheta del cliente (ola 6, frente B): mapa en el formulario Nuevo / Editar cliente (§10.4.3 «Ubicación») y en
// la ficha, con geocodificación simulada. Sin conexión el cliente se guarda igual, sin coordenadas (§14.1).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapaChincheta, posicionEnPlano, puntoDePosicion, textoCoordenadas } from '../../src/clientes/ubicacion/MapaChincheta';
import { DeshacerProvider } from '../../src/components/Deshacer';
import { DatosProvider } from '../../src/db/datos';
import { db, reiniciarBase } from '../../src/db/db';
import { crearCliente, usarComo, type DatosCliente } from '../../src/db/repo';
import type { Cliente } from '../../src/domain/tipos';
import { configurarGeocodificador, crearGeocodificadorSimulado } from '../../src/geocodificacion';
import { desdeMadrid } from '../../src/lib/fechas';
import { ClienteFicha } from '../../src/screens/ClienteFicha';
import { ClienteForm } from '../../src/screens/ClienteForm';

const AHORA = desdeMadrid(2026, 11, 7, 10);
const BASE: DatosCliente = {
  nombre: 'Fam. García', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: '', municipio: '',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
  frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [],
  precio_habitual: null, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};
const nuevoCliente = async (d: Partial<DatosCliente> = {}): Promise<Cliente> => (await crearCliente({ ...BASE, ...d })).cliente;
const esperado = (direccion: string, municipio: string) => crearGeocodificadorSimulado().geocodificar(direccion, municipio).then((r) => ({ lat: r!.lat, lon: r!.lon }));

function montar(ui: ReactNode) {
  const user = userEvent.setup();
  render(
    <DatosProvider>
      <DeshacerProvider>{ui}</DeshacerProvider>
    </DatosProvider>,
  );
  return user;
}
const ficha = (clienteId: string) =>
  montar(
    <ClienteFicha clienteId={clienteId} onVolver={vi.fn()} onEditar={vi.fn()} onYaPago={vi.fn()} onTrabajoHecho={vi.fn()} onVerMovimientos={vi.fn()} />,
  );
const chincheta = () => screen.getByRole('button', { name: /^Chincheta del cliente en / });
const enLinea = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
  enLinea(true);
  configurarGeocodificador(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  enLinea(true);
});

describe('MapaChincheta', () => {
  const centro = { lat: 40.4, lon: -3.7 };

  it('posición en el plano ↔ coordenadas', () => {
    expect(posicionEnPlano(centro, centro)).toEqual({ x: 50, y: 50 });
    const p = puntoDePosicion(centro, 75, 25);
    expect(p).toEqual({ lat: 40.40125, lon: -3.698 });
    const vuelta = posicionEnPlano(centro, p);
    expect(vuelta.x).toBeCloseTo(75);
    expect(vuelta.y).toBeCloseTo(25);
    expect(textoCoordenadas({ lat: 40.4, lon: -3.7 })).toBe('40,40000, −3,70000');
  });

  it('flechas del teclado mueven la chincheta ≈ 20 m; no se sale del plano', () => {
    const onMover = vi.fn();
    render(<MapaChincheta centro={centro} punto={centro} editable onMover={onMover} />);
    fireEvent.keyDown(chincheta(), { key: 'ArrowUp' });
    expect(onMover).toHaveBeenLastCalledWith({ lat: 40.4002, lon: -3.7 });
    fireEvent.keyDown(chincheta(), { key: 'ArrowRight' });
    expect(onMover).toHaveBeenLastCalledWith({ lat: 40.4, lon: -3.6998 });
    fireEvent.keyDown(chincheta(), { key: 'a' });
    expect(onMover).toHaveBeenCalledTimes(2);
    onMover.mockClear();
    render(<MapaChincheta centro={centro} punto={{ lat: 40.40235, lon: -3.7 }} editable onMover={onMover} />);
    fireEvent.keyDown(screen.getAllByRole('button')[1], { key: 'ArrowUp' });
    expect(onMover).not.toHaveBeenCalled();
  });

  it('arrastrar con el dedo y soltar guarda el punto nuevo', () => {
    const onMover = vi.fn();
    render(<MapaChincheta centro={centro} punto={centro} editable onMover={onMover} />);
    const plano = screen.getByTestId('plano');
    plano.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    const pin = chincheta();
    // jsdom no trae PointerEvent: eventos de ratón con el nombre de puntero (React lee clientX/clientY).
    const puntero = (tipo: string, x: number, y: number) => fireEvent(pin, new MouseEvent(tipo, { bubbles: true, clientX: x, clientY: y }));
    puntero('pointerdown', 200, 100);
    puntero('pointermove', 300, 50);
    expect(onMover).not.toHaveBeenCalled(); // sólo al soltar
    puntero('pointerup', 300, 50);
    expect(onMover).toHaveBeenCalledWith({ lat: 40.40125, lon: -3.698 });
  });

  it('sólo lectura: imagen con su texto, sin botón', () => {
    render(<MapaChincheta centro={centro} punto={centro} editable={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: 'Chincheta del cliente en 40,40000, −3,70000' })).toBeTruthy();
  });
});

describe('Formulario Nuevo cliente · Ubicación', () => {
  const rellenar = async (user: ReturnType<typeof userEvent.setup>, direccion: string, municipio: string) => {
    await user.type(screen.getByLabelText(/^Nombre/), 'Fam. García');
    await user.click(within(screen.getByRole('group', { name: /Servicios/ })).getByRole('checkbox', { name: 'Jardín' }));
    await user.click(screen.getByRole('radio', { name: 'Puntual' }));
    if (direccion) await user.type(screen.getByLabelText('Dirección'), direccion);
    if (municipio) await user.type(screen.getByLabelText('Municipio'), municipio);
  };

  it('al escribir la dirección aparece la chincheta; se puede corregir y se guardan las coordenadas', async () => {
    const onCerrar = vi.fn();
    const user = montar(<ClienteForm onCerrar={onCerrar} />);
    expect(screen.getByText('Se usa para el tiempo de cada visita.')).toBeTruthy();
    expect(screen.getByText('Añade la dirección para ver el tiempo de cada visita.')).toBeTruthy();
    await rellenar(user, 'Calle Mayor 3', 'Rivas-Vaciamadrid');
    const e = await esperado('Calle Mayor 3', 'Rivas-Vaciamadrid');
    await waitFor(() => expect(chincheta().getAttribute('aria-label')).toContain(textoCoordenadas(e)));
    expect(screen.getByText('Si no está en su sitio, arrastra la chincheta.')).toBeTruthy();
    fireEvent.keyDown(chincheta(), { key: 'ArrowUp' });
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    const [c] = await db.clientes.toArray();
    expect(c.lat).toBeCloseTo(e.lat + 0.0002, 5);
    expect(c.lon).toBe(e.lon);
  });

  it('sin conexión no bloquea: texto neutro y el cliente se guarda sin coordenadas', async () => {
    enLinea(false);
    const onCerrar = vi.fn();
    const user = montar(<ClienteForm onCerrar={onCerrar} />);
    await rellenar(user, 'Calle Mayor 3', 'Madrid');
    expect(await screen.findByText('Sin conexión. Guardo el cliente y buscamos la ubicación al volver.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Chincheta/ })).toBeNull();
    expect((screen.getByRole('button', { name: 'Guardar cliente' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    const [c] = await db.clientes.toArray();
    expect(c).toMatchObject({ direccion: 'Calle Mayor 3', lat: null, lon: null });
  });

  it('dirección no encontrada: texto neutro y se guarda igual', async () => {
    const onCerrar = vi.fn();
    const user = montar(<ClienteForm onCerrar={onCerrar} />);
    await rellenar(user, '123', '');
    expect(await screen.findByText('No encuentro esa dirección. Revisa la calle y el municipio.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    expect((await db.clientes.toArray())[0]).toMatchObject({ lat: null, lon: null });
  });
});

describe('Formulario Editar cliente · Ubicación', () => {
  it('si la dirección no cambia conserva las coordenadas guardadas (no vuelve a geocodificar)', async () => {
    const c = await nuevoCliente({ direccion: 'Calle Mayor 3', municipio: 'Madrid', lat: 40.5, lon: -3.6 });
    const g = vi.fn(crearGeocodificadorSimulado().geocodificar);
    configurarGeocodificador({ nombre: 'espía', geocodificar: g });
    const onCerrar = vi.fn();
    const user = montar(<ClienteForm cliente={c} onCerrar={onCerrar} />);
    expect(chincheta().getAttribute('aria-label')).toContain('40,50000, −3,60000');
    await user.clear(screen.getByLabelText(/^Nombre/));
    await user.type(screen.getByLabelText(/^Nombre/), 'Fam. García López');
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(await db.clientes.get(c.id)).toMatchObject({ nombre: 'Fam. García López', lat: 40.5, lon: -3.6 });
    expect(g).not.toHaveBeenCalled();
  });

  it('si cambia la dirección, busca la nueva ubicación', async () => {
    const c = await nuevoCliente({ direccion: 'Calle Mayor 3', municipio: 'Madrid', lat: 40.5, lon: -3.6 });
    const onCerrar = vi.fn();
    const user = montar(<ClienteForm cliente={c} onCerrar={onCerrar} />);
    await user.clear(screen.getByLabelText('Municipio'));
    await user.type(screen.getByLabelText('Municipio'), 'Getafe');
    const e = await esperado('Calle Mayor 3', 'Getafe');
    await waitFor(() => expect(chincheta().getAttribute('aria-label')).toContain(textoCoordenadas(e)));
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(await db.clientes.get(c.id)).toMatchObject({ municipio: 'Getafe', lat: e.lat, lon: e.lon });
  });
});

describe('Ficha de cliente · Ubicación', () => {
  it('muestra la chincheta; corregirla guarda al momento y se puede deshacer', async () => {
    const c = await nuevoCliente({ direccion: 'Calle Mayor 3', municipio: 'Madrid', lat: 40.5, lon: -3.6 });
    const user = ficha(c.id);
    const seccion = await screen.findByRole('region', { name: 'Ubicación' });
    expect(within(seccion).getByText('Se usa para el tiempo de cada visita.')).toBeTruthy();
    fireEvent.keyDown(within(seccion).getByRole('button', { name: /^Chincheta del cliente en 40,50000, −3,60000/ }), { key: 'ArrowRight' });
    await waitFor(async () => expect((await db.clientes.get(c.id))!.lon).toBe(-3.5998));
    expect(await screen.findByText('Ubicación corregida')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await db.clientes.get(c.id))!.lon).toBe(-3.6));
  });

  it('con dirección y sin coordenadas: «Buscar en el mapa» las guarda', async () => {
    const c = await nuevoCliente({ direccion: 'Calle Mayor 3', municipio: 'Rivas-Vaciamadrid' });
    const user = ficha(c.id);
    const seccion = await screen.findByRole('region', { name: 'Ubicación' });
    expect(within(seccion).getByText('Aún no está en el mapa.')).toBeTruthy();
    await user.click(within(seccion).getByRole('button', { name: 'Buscar en el mapa' }));
    const e = await esperado('Calle Mayor 3', 'Rivas-Vaciamadrid');
    await waitFor(async () => expect(await db.clientes.get(c.id)).toMatchObject(e));
    await waitFor(() => expect(within(seccion).getByRole('button', { name: /^Chincheta del cliente/ })).toBeTruthy());
  });

  it('sin conexión, «Buscar en el mapa» espera a tener red', async () => {
    enLinea(false);
    const c = await nuevoCliente({ direccion: 'Calle Mayor 3', municipio: 'Madrid' });
    ficha(c.id);
    const seccion = await screen.findByRole('region', { name: 'Ubicación' });
    expect((within(seccion).getByRole('button', { name: 'Buscar en el mapa' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(seccion).getByText('Necesita conexión.')).toBeTruthy();
  });

  it('sin dirección: texto neutro (el botón «Añadir dirección» es el de las acciones rápidas)', async () => {
    const c = await nuevoCliente();
    ficha(c.id);
    const seccion = await screen.findByRole('region', { name: 'Ubicación' });
    expect(within(seccion).getByText('Añade la dirección para ver el tiempo de cada visita.')).toBeTruthy();
    expect(within(seccion).queryByRole('button')).toBeNull();
  });

  it('Pablo (colaborador) ve la chincheta pero no la mueve', async () => {
    const c = await nuevoCliente({ direccion: 'Calle Mayor 3', municipio: 'Madrid', lat: 40.5, lon: -3.6 });
    await usarComo('colaborador');
    ficha(c.id);
    const seccion = await screen.findByRole('region', { name: 'Ubicación' });
    expect(within(seccion).getByRole('img', { name: /^Chincheta del cliente/ })).toBeTruthy();
    expect(within(seccion).queryByRole('button')).toBeNull();
  });
});
