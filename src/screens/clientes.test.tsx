import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeshacerProvider } from '../components/Deshacer';
import { DatosProvider } from '../db/datos';
import { db, reiniciarBase } from '../db/db';
import { crearCliente, crearMovimiento, usarComo, type DatosCliente } from '../db/repo';
import type { Cliente, Deuda } from '../domain/tipos';
import { ClienteFicha } from './ClienteFicha';
import { ClienteForm } from './ClienteForm';
import { Clientes } from './Clientes';

// Pruebas de interfaz de Clientes (§10.4): listado, ficha (maqueta p. 4) y formulario.

const AHORA = new Date('2026-10-11T10:00:00Z'); // domingo 11 de octubre, 12:00 en Madrid
const DIA = 86_400_000;

const BASE: DatosCliente = {
  nombre: 'Cliente',
  tipo: 'particular',
  telefono: null,
  telefono_2: null,
  contacto: '',
  direccion: '',
  municipio: '',
  lat: null,
  lon: null,
  servicios: ['jardin'],
  modalidad: 'puntual',
  cuota_abono: null,
  dia_cobro_abono: null,
  frecuencia_visitas: null,
  dias_preferidos: [],
  hora_preferida: null,
  duracion_habitual: 120,
  tipos_trabajo_habituales: [],
  precio_habitual: null,
  requiere_vehiculo_por_defecto: false,
  ayudantes_por_defecto: 0,
  notas: '',
  activo: true,
};

const nuevoCliente = async (d: Partial<DatosCliente>): Promise<Cliente> => (await crearCliente({ ...BASE, ...d })).cliente;

/** Trabajo hecho y sin cobrar hace `dias` días. */
async function deber(clienteId: string, importe: number, dias: number, concepto = 'Poda de setos') {
  const negocio = (await db.ajustes.get('negocio_id'))!.valor as string;
  const usuario = (await db.ajustes.get('usuario_actual'))!.valor as string;
  const fecha = new Date(Date.now() - dias * DIA).toISOString();
  const deuda: Deuda = {
    id: crypto.randomUUID(),
    negocio_id: negocio,
    creado_en: fecha,
    actualizado_en: fecha,
    creado_por: usuario,
    modificado_por: usuario,
    eliminado_en: null,
    version: 1,
    cliente_id: clienteId,
    concepto,
    importe,
    fecha,
    visita_id: null,
  };
  await db.deudas.add(deuda);
}

function montar(ui: ReactNode) {
  const user = userEvent.setup();
  render(
    <DatosProvider>
      <DeshacerProvider>{ui}</DeshacerProvider>
    </DatosProvider>,
  );
  return user;
}

const ficha = (clienteId: string, extra: Partial<Parameters<typeof ClienteFicha>[0]> = {}) => {
  const props = {
    clienteId,
    onVolver: vi.fn(),
    onEditar: vi.fn(),
    onYaPago: vi.fn(),
    onTrabajoHecho: vi.fn(),
    onVerMovimientos: vi.fn(),
    ...extra,
  };
  return { props, user: montar(<ClienteFicha {...props} />) };
};

const desactivado = (nombre: string | RegExp) => (screen.getByRole('button', { name: nombre }) as HTMLButtonElement).disabled;
const filas = () => within(screen.getByRole('list', { name: 'Lista de clientes' })).getAllByRole('listitem');
const nombres = () => filas().map((li) => li.querySelector('.nombre')!.textContent);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Formulario · Nuevo cliente', () => {
  it('Guardar cliente sigue desactivado hasta tener nombre, servicio y modalidad; el teléfono se guarda en E.164', async () => {
    const onCerrar = vi.fn();
    const user = montar(<ClienteForm onCerrar={onCerrar} />);
    const hoja = screen.getByRole('dialog', { name: 'Nuevo cliente' });
    expect(within(hoja).getByRole('button', { name: 'Cerrar' })).toBeTruthy();
    expect(desactivado('Guardar cliente')).toBe(true);

    await user.type(screen.getByLabelText(/^Nombre/), 'Fam. García');
    expect(desactivado('Guardar cliente')).toBe(true);
    await user.click(within(screen.getByRole('group', { name: /Servicios/ })).getByRole('checkbox', { name: 'Jardín' }));
    expect(desactivado('Guardar cliente')).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Puntual' }));
    expect(desactivado('Guardar cliente')).toBe(false);

    await user.type(screen.getByLabelText('Teléfono'), '611 566 779');
    await user.type(screen.getByLabelText('Dirección'), 'Calle Mayor 3');
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    const [c] = await db.clientes.toArray();
    expect(c).toMatchObject({
      nombre: 'Fam. García',
      telefono: '+34611566779',
      direccion: 'Calle Mayor 3',
      servicios: ['jardin'],
      modalidad: 'puntual',
      cuota_abono: null,
      duracion_habitual: 120,
      lat: null,
      lon: null,
      activo: true,
    });
    expect(onCerrar.mock.calls[0][0].id).toBe(c.id);
    expect(screen.getByRole('status').textContent).toContain('Cliente guardado');
  });

  it('con abono pide la cuota y guarda día de cobro 1 por defecto', async () => {
    const onCerrar = vi.fn();
    const user = montar(<ClienteForm onCerrar={onCerrar} />);
    await user.type(screen.getByLabelText(/^Nombre/), 'Chalet Las Encinas');
    await user.click(within(screen.getByRole('group', { name: /Servicios/ })).getByRole('checkbox', { name: 'Piscina' }));
    await user.click(screen.getByRole('radio', { name: 'Abono' }));
    expect(desactivado('Guardar cliente')).toBe(true);
    const cuota = screen.getByLabelText(/^Cuota/);
    expect(cuota.getAttribute('inputmode')).toBe('decimal');
    await user.type(cuota, '90');
    await user.click(screen.getByRole('radio', { name: 'Quincenal' }));
    await user.click(screen.getByRole('checkbox', { name: 'Lunes' }));
    expect(desactivado('Guardar cliente')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    const [c] = await db.clientes.toArray();
    expect(c).toMatchObject({ modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, frecuencia_visitas: 'quincenal', dias_preferidos: [1], servicios: ['piscina'] });
  });

  it('un teléfono que no vale avisa "Revisa el teléfono" y no deja guardar', async () => {
    const user = montar(<ClienteForm onCerrar={vi.fn()} />);
    await user.type(screen.getByLabelText(/^Nombre/), 'Ana');
    await user.click(within(screen.getByRole('group', { name: /Servicios/ })).getByRole('checkbox', { name: 'Jardín' }));
    await user.click(screen.getByRole('radio', { name: 'Puntual' }));
    await user.type(screen.getByLabelText('Teléfono'), '12345');
    await user.tab();
    expect(screen.getByText('Revisa el teléfono')).toBeTruthy();
    expect(desactivado('Guardar cliente')).toBe(true);
  });

  it('no muestra "Elegir de mis contactos" si el navegador no lo permite', () => {
    montar(<ClienteForm onCerrar={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Elegir de mis contactos' })).toBeNull();
  });

  it('cerrar con cambios pide confirmación: Seguir editando y Descartar', async () => {
    const onCerrar = vi.fn();
    const user = montar(<ClienteForm onCerrar={onCerrar} />);
    await user.type(screen.getByLabelText(/^Nombre/), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByRole('alertdialog', { name: '¿Descartar los cambios?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((screen.getByLabelText(/^Nombre/) as HTMLInputElement).value).toBe('Ana');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onCerrar).toHaveBeenCalledWith();
    expect(await db.clientes.count()).toBe(0);
  });
});

describe('Formulario · Editar cliente', () => {
  it('carga los datos, guarda los cambios y avisa con deshacer', async () => {
    const c = await nuevoCliente({ nombre: 'Ana', telefono: '+34611566779', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 5 });
    const onCerrar = vi.fn();
    const user = montar(<ClienteForm cliente={c} onCerrar={onCerrar} />);
    expect(screen.getByRole('dialog', { name: 'Editar cliente' })).toBeTruthy();
    expect((screen.getByLabelText('Teléfono') as HTMLInputElement).value).toBe('611 566 779');
    expect((screen.getByLabelText(/^Cuota/) as HTMLInputElement).value).toBe('90');
    const nombre = screen.getByLabelText(/^Nombre/);
    await user.clear(nombre);
    await user.type(nombre, 'Ana López');
    await user.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(onCerrar.mock.calls[0][0]).toMatchObject({ id: c.id, nombre: 'Ana López' });
    expect(await db.clientes.get(c.id)).toMatchObject({ nombre: 'Ana López', telefono: '+34611566779', cuota_abono: 9000, dia_cobro_abono: 5, version: 2 });
    expect(screen.getByRole('status').textContent).toContain('Cliente guardado');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await db.clientes.get(c.id))!.nombre).toBe('Ana'));
  });
});

describe('Listado', () => {
  it('vacío: "Aún no tienes clientes" y "Añadir el primero"', async () => {
    const onNuevo = vi.fn();
    const user = montar(<Clientes onAbrir={vi.fn()} onNuevo={onNuevo} />);
    expect(await screen.findByText('Aún no tienes clientes')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Añadir el primero' }));
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
    expect(onNuevo).toHaveBeenCalledTimes(2);
  });

  it('deudores primero (del pendiente más antiguo), después alfabético; filtros y buscador sin acentos', async () => {
    const ana = await nuevoCliente({ nombre: 'Ana', direccion: 'Calle Real 1' });
    const alvaro = await nuevoCliente({ nombre: 'Álvaro Ruiz', servicios: ['piscina'], modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, telefono: '+34611566779' });
    const zoe = await nuevoCliente({ nombre: 'Zoe' });
    const bruno = await nuevoCliente({ nombre: 'Bruno', servicios: ['jardin', 'piscina'] });
    await nuevoCliente({ nombre: 'Viejo', activo: false });
    await deber(zoe.id, 5000, 10);
    await deber(bruno.id, 12000, 20);
    const onAbrir = vi.fn();
    const user = montar(<Clientes onAbrir={onAbrir} onNuevo={vi.fn()} />);
    await screen.findByRole('list', { name: 'Lista de clientes' });

    expect(nombres()).toEqual(['Bruno', 'Zoe', 'Álvaro Ruiz', 'Ana']);
    const [fBruno, fZoe, fAlvaro, fAna] = filas();
    expect(fBruno.textContent).toContain('Te debe 120 €');
    expect(fBruno.textContent).toContain('hace 20 días');
    expect(fBruno.querySelector('.deuda')!.getAttribute('data-nivel')).toBe('rojo');
    expect(fZoe.textContent).toContain('Te debe 50 €');
    expect(fZoe.querySelector('.deuda')!.getAttribute('data-nivel')).toBe('ambar');
    expect(fAlvaro.textContent).toContain('Piscina');
    expect(fAlvaro.textContent).toContain('Abono 90 €/mes');
    expect(fAlvaro.querySelector('.deuda')).toBeNull();
    expect(fAna.textContent).toContain('Jardín');
    expect(fAna.textContent).toContain('Puntual');

    await user.click(screen.getByRole('radio', { name: 'Abono' }));
    expect(nombres()).toEqual(['Álvaro Ruiz']);
    await user.click(screen.getByRole('radio', { name: 'Puntual' }));
    expect(nombres()).toEqual(['Bruno', 'Zoe', 'Ana']);
    await user.click(screen.getByRole('radio', { name: 'Te deben' }));
    expect(nombres()).toEqual(['Bruno', 'Zoe']);
    await user.click(screen.getByRole('radio', { name: 'Inactivos' }));
    expect(nombres()).toEqual(['Viejo']);
    await user.click(screen.getByRole('radio', { name: 'Todos' }));
    expect(nombres()).not.toContain('Viejo');

    const buscar = screen.getByRole('searchbox', { name: 'Buscar cliente' });
    await user.type(buscar, 'alvaro');
    expect(nombres()).toEqual(['Álvaro Ruiz']);
    await user.clear(buscar);
    await user.type(buscar, '566 779');
    expect(nombres()).toEqual(['Álvaro Ruiz']);
    await user.clear(buscar);
    await user.type(buscar, 'calle real');
    expect(nombres()).toEqual(['Ana']);
    await user.click(screen.getByRole('radio', { name: 'Abono' }));
    expect(screen.getByText('Ningún cliente en este filtro')).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Todos' }));

    await user.click(within(filas()[0]).getByRole('button'));
    expect(onAbrir).toHaveBeenCalledWith(ana.id);
    expect(alvaro.id).toBeTruthy();
  });

  it('antigüedad de la deuda: neutro hasta 6 días, ámbar a los 7 y rojo a los 15 (con texto)', async () => {
    for (const [nombre, dias] of [['Seis', 6], ['Siete', 7], ['Quince', 15]] as const) {
      const c = await nuevoCliente({ nombre });
      await deber(c.id, 9000, dias);
    }
    montar(<Clientes onAbrir={vi.fn()} onNuevo={vi.fn()} />);
    await screen.findByRole('list', { name: 'Lista de clientes' });
    expect(nombres()).toEqual(['Quince', 'Siete', 'Seis']);
    const nivel = (i: number) => filas()[i].querySelector('.deuda')!.getAttribute('data-nivel');
    expect([nivel(0), nivel(1), nivel(2)]).toEqual(['rojo', 'ambar', 'neutro']);
    expect(filas()[1].textContent).toContain('hace 7 días');
    expect(filas()[1].querySelector('.chip-estado')!.className).toContain('ambar');
  });
});

describe('Ficha (maqueta p. 4)', () => {
  it('acciones rápidas: Llamar, WhatsApp y Cómo llegar son enlaces reales', async () => {
    const c = await nuevoCliente({
      nombre: 'Chalet Las Encinas',
      servicios: ['jardin', 'piscina'],
      modalidad: 'abono',
      cuota_abono: 9000,
      dia_cobro_abono: 1,
      frecuencia_visitas: 'quincenal',
      telefono: '+34611566779',
      direccion: 'Calle Mayor 3',
      municipio: 'Rivas-Vaciamadrid',
    });
    const { props, user } = ficha(c.id);
    expect(await screen.findByRole('heading', { name: 'Chalet Las Encinas' })).toBeTruthy();
    expect(screen.getByText('Abono 90 €/mes · cada 15 días')).toBeTruthy();
    expect(screen.getByText('Jardín')).toBeTruthy();
    expect(screen.getByText('Piscina')).toBeTruthy();

    const llamar = screen.getByRole('link', { name: 'Llamar' });
    expect(llamar.getAttribute('href')).toBe('tel:+34611566779');
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/34611566779');
    const llegar = screen.getByRole('link', { name: 'Cómo llegar' });
    // jsdom no es un iPhone: Google Maps (Android, decisión de Ariel).
    expect(llegar.getAttribute('href')).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Calle Mayor 3, Rivas-Vaciamadrid')}&travelmode=driving`,
    );
    for (const a of [llamar, llegar]) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }

    await db.clientes.update(c.id, { lat: 40.3567, lon: -3.5321 });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Cómo llegar' }).getAttribute('href')).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=40.3567,-3.5321&travelmode=driving',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Volver a Clientes' }));
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Trabajo hecho' }));
    await user.click(screen.getByRole('button', { name: 'Ver movimientos' }));
    expect(props.onVolver).toHaveBeenCalled();
    expect(props.onEditar).toHaveBeenCalled();
    expect(props.onTrabajoHecho).toHaveBeenCalledWith(c.id);
    expect(props.onVerMovimientos).toHaveBeenCalledWith(c.id);
    expect(screen.getByText('Aún no hay visitas de este cliente.')).toBeTruthy();
  });

  it('Cómo llegar abre Apple Maps en un iPhone', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      configurable: true,
    });
    try {
      const c = await nuevoCliente({ nombre: 'Fam. Ruiz', direccion: 'Calle Mayor 3', municipio: 'Rivas-Vaciamadrid', lat: 40.3567, lon: -3.5321 });
      ficha(c.id);
      const llegar = await screen.findByRole('link', { name: 'Cómo llegar' });
      expect(llegar.getAttribute('href')).toBe('https://maps.apple.com/?daddr=40.3567,-3.5321&dirflg=d');
    } finally {
      if (original) Object.defineProperty(navigator, 'userAgent', original);
      else delete (navigator as unknown as Record<string, unknown>).userAgent;
    }
  });

  it('sin teléfono ni dirección: "Añadir teléfono" y "Añadir dirección" llevan a Editar', async () => {
    const c = await nuevoCliente({ nombre: 'Ana' });
    const { props, user } = ficha(c.id);
    await screen.findByRole('heading', { name: 'Ana' });
    expect(screen.queryByRole('link', { name: 'Llamar' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Cómo llegar' })).toBeNull();
    expect(desactivado(/^WhatsApp/)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Añadir teléfono' }));
    await user.click(screen.getByRole('button', { name: 'Añadir dirección' }));
    expect(props.onEditar).toHaveBeenCalledTimes(2);
  });

  it('deuda: tarjeta ámbar a los 7 días con "Ya pagó"', async () => {
    const c = await nuevoCliente({ nombre: 'Ana' });
    await deber(c.id, 9000, 7);
    const { props, user } = ficha(c.id);
    const tarjeta = await screen.findByRole('region', { name: 'Deuda' });
    expect(tarjeta.getAttribute('data-nivel')).toBe('ambar');
    expect(tarjeta.className).not.toContain('rojo');
    expect(tarjeta.textContent).toContain('Te debe 90 €');
    expect(tarjeta.textContent).toContain('Poda de setos · hace 7 días');
    await user.click(within(tarjeta).getByRole('button', { name: 'Ya pagó' }));
    expect(props.onYaPago).toHaveBeenCalledWith(c.id);
  });

  it('deuda: tarjeta roja a los 15 días', async () => {
    const c = await nuevoCliente({ nombre: 'Ana' });
    await deber(c.id, 9000, 15);
    ficha(c.id);
    const tarjeta = await screen.findByRole('region', { name: 'Deuda' });
    expect(tarjeta.getAttribute('data-nivel')).toBe('rojo');
    expect(tarjeta.className).toContain('rojo');
    expect(tarjeta.textContent).toContain('hace 15 días');
  });

  it('abono con varias cuotas vencidas: el total, la más antigua y "y N más"', async () => {
    const c = await nuevoCliente({ nombre: 'Chalet', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1 });
    await db.clientes.update(c.id, { creado_en: '2026-08-20T10:00:00.000Z' });
    ficha(c.id);
    const tarjeta = await screen.findByRole('region', { name: 'Deuda' });
    expect(tarjeta.textContent).toContain('Te debe 180 €');
    expect(tarjeta.textContent).toContain('Abono de septiembre · hace 40 días y 1 más');
    expect(tarjeta.getAttribute('data-nivel')).toBe('rojo');
  });

  it('sin deuda no hay tarjeta; ESTE AÑO suma cobros y gastos imputados del año', async () => {
    const c = await nuevoCliente({ nombre: 'Ana' });
    const cat = (await db.categorias.where('clave').equals('gasolina').first()) ?? (await db.categorias.toCollection().first());
    await crearMovimiento({ tipo: 'cobro', importe: 81000, fecha: AHORA.toISOString(), categoria_id: null, medio_pago: 'efectivo', cliente_id: c.id });
    await crearMovimiento({ tipo: 'gasto', importe: 21400, fecha: AHORA.toISOString(), categoria_id: cat!.id, medio_pago: 'efectivo', cliente_id: c.id });
    await crearMovimiento({ tipo: 'cobro', importe: 5000, fecha: '2025-12-31T10:00:00.000Z', categoria_id: null, medio_pago: 'efectivo', cliente_id: c.id });
    ficha(c.id);
    await screen.findByRole('heading', { name: 'Ana' });
    await waitFor(() => expect(screen.getByTestId('cobrado-anio').textContent).toBe('810 €'));
    expect(screen.getByTestId('gastado-anio').textContent).toBe('214 €');
    expect(screen.getByTestId('margen-anio').textContent).toBe('596 €');
    expect(screen.getByTestId('margen-anio').className).toContain('positivo');
    expect(screen.queryByRole('region', { name: 'Deuda' })).toBeNull();
  });

  it('notas editables con un toque; se guardan al salir y se pueden deshacer', async () => {
    const c = await nuevoCliente({ nombre: 'Ana', notas: 'Llave en el buzón.' });
    const { user } = ficha(c.id);
    const notas = (await screen.findByRole('textbox', { name: 'Notas' })) as HTMLTextAreaElement;
    expect(notas.value).toBe('Llave en el buzón.');
    await user.click(notas);
    await user.type(notas, ' Perro suelto.');
    await user.tab();
    await waitFor(async () => expect((await db.clientes.get(c.id))!.notas).toBe('Llave en el buzón. Perro suelto.'));
    expect(screen.getByRole('status').textContent).toContain('Notas guardadas');
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await db.clientes.get(c.id))!.notas).toBe('Llave en el buzón.'));
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Notas' }) as HTMLTextAreaElement).value).toBe('Llave en el buzón.'));
  });

  it('desactivar pide confirmación y deja deshacer', async () => {
    const c = await nuevoCliente({ nombre: 'Ana' });
    const { user } = ficha(c.id);
    await user.click(await screen.findByRole('button', { name: 'Desactivar cliente' }));
    const dialogo = screen.getByRole('alertdialog', { name: '¿Desactivar a Ana?' });
    expect(dialogo.textContent).toContain('Deja de generar cobros. Su historial se conserva.');
    await user.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));
    await waitFor(async () => expect((await db.clientes.get(c.id))!.activo).toBe(false));
    // La barra aparece justo después de la escritura: con la PC cargada hay que esperarla (falla intermitente, ola 8).
    expect((await screen.findByRole('status')).textContent).toContain('Cliente desactivado');
    expect(await screen.findByRole('button', { name: 'Reactivar cliente' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await db.clientes.get(c.id))!.activo).toBe(true));
  });

  it('si el cliente ya no está, lo dice y deja volver', async () => {
    const { props, user } = ficha('no-existe');
    expect(await screen.findByText('Este cliente ya no está')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Volver a Clientes' }));
    expect(props.onVolver).toHaveBeenCalled();
  });
});

describe('Pablo (colaborador) ve todo pero no cambia nada', () => {
  it('listado sin "+"', async () => {
    await nuevoCliente({ nombre: 'Ana' });
    await usarComo('colaborador');
    montar(<Clientes onAbrir={vi.fn()} onNuevo={vi.fn()} />);
    await screen.findByRole('list', { name: 'Lista de clientes' });
    expect(nombres()).toEqual(['Ana']);
    expect(screen.queryByRole('button', { name: 'Nuevo cliente' })).toBeNull();
  });

  it('ficha sin Editar, Ya pagó, Trabajo hecho, Desactivar ni edición de notas', async () => {
    const c = await nuevoCliente({ nombre: 'Ana', telefono: '+34611566779', notas: 'Perro suelto.' });
    await deber(c.id, 9000, 8);
    await usarComo('colaborador');
    ficha(c.id);
    expect(await screen.findByRole('region', { name: 'Deuda' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Llamar' })).toBeTruthy();
    expect(screen.getByText('Perro suelto.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Notas' })).toBeNull();
    for (const nombre of ['Editar', 'Ya pagó', 'Trabajo hecho', 'Desactivar cliente', 'Reactivar cliente'])
      expect(screen.queryByRole('button', { name: nombre })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver movimientos' })).toBeTruthy();
  });
});
