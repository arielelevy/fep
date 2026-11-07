import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeshacerProvider } from '../components/Deshacer';
import { DatosProvider } from '../db/datos';
import { db, reiniciarBase } from '../db/db';
import { crearCliente, crearMovimiento, crearVisita, guardarAjuste, usarComo, type DatosCliente, type DatosVisita } from '../db/repo';
import { calcularPendientes, totalPendiente } from '../domain/pendientes';
import { HojaCobro } from './HojaCobro';
import { HojaHecho } from './HojaHecho';
import { Hoy, VERSION_APP } from './Hoy';
import { Registrar } from './Registrar';

// Pruebas propias del frente C (ola 5): visitas de hoy, flujo Hecho con cobro (criterios 9 y 10 desde la interfaz),
// abono, versión al pie, medio de pago al montar antes de cargar y hallazgos 1 y 3 del revisor de la ola 4.

const AHORA = new Date('2026-10-11T10:00:00Z'); // domingo 11 de octubre, 12:00 en Madrid
const HOY = '2026-10-11';

const BASE: DatosCliente = {
  nombre: 'Cliente', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: '', municipio: '', lat: null, lon: null,
  servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null, dias_preferidos: [],
  hora_preferida: null, duracion_habitual: 60, tipos_trabajo_habituales: [], precio_habitual: null, requiere_vehiculo_por_defecto: false,
  ayudantes_por_defecto: 0, notas: '', activo: true,
};

const nuevoCliente = async (d: Partial<DatosCliente>) => (await crearCliente({ ...BASE, ...d })).cliente;
const nuevaVisita = async (d: Partial<DatosVisita> & { cliente_id: string }) =>
  (
    await crearVisita({
      fecha: HOY, hora_inicio: '09:00', duracion: 60, tipos_trabajo: ['setos_poda'], descripcion: '', precio: null,
      incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0, ...d,
    })
  ).visita;

function montar(ui: ReactNode) {
  const user = userEvent.setup();
  render(
    <DatosProvider>
      <DeshacerProvider>{ui}</DeshacerProvider>
    </DatosProvider>,
  );
  return user;
}

const pendienteTotal = async () => totalPendiente(calcularPendientes(await db.clientes.toArray(), await db.deudas.toArray(), await db.movimientos.toArray()));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Hoy · visitas de hoy', () => {
  it('tarjetas por hora con «N de M hechas», próxima con Hecho relleno y vacío con «Mañana: N visitas»', async () => {
    const pinos = await nuevoCliente({ nombre: 'Comunidad Los Pinos' });
    const encinas = await nuevoCliente({ nombre: 'Chalet Las Encinas', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1 });
    await nuevaVisita({ cliente_id: pinos.id, hora_inicio: '16:00', descripcion: 'Poda de setos', precio: 15000 });
    await nuevaVisita({ cliente_id: encinas.id, hora_inicio: '11:30', tipos_trabajo: ['piscina'], incluida_en_abono: true });
    montar(<Hoy onIr={vi.fn()} />);

    const lista = await screen.findByRole('list');
    const tarjetas = within(lista).getAllByRole('listitem');
    expect(tarjetas.map((t) => t.querySelector('.cliente')!.textContent)).toEqual(['Chalet Las Encinas', 'Comunidad Los Pinos']);
    expect(screen.getByText('0 de 2 hechas')).toBeTruthy();
    expect(within(tarjetas[0]).getByText('Piscina · Abono 90 €/mes')).toBeTruthy();
    expect(within(tarjetas[1]).getByText('Poda de setos · 150 €')).toBeTruthy();
    expect(tarjetas[0].className).toContain('proxima');
    expect(within(tarjetas[0]).getByRole('button', { name: /^Hecho/ }).className).toContain('relleno');
    expect(within(tarjetas[1]).getByRole('button', { name: /^Hecho/ }).className).not.toContain('relleno');
  });

  it('sin visitas hoy: «Hoy no tienes visitas» y enlace «Mañana: 1 visita» a la Agenda', async () => {
    const c = await nuevoCliente({ nombre: 'Fam. García' });
    await nuevaVisita({ cliente_id: c.id, fecha: '2026-10-12' });
    const onIr = vi.fn();
    const user = montar(<Hoy onIr={onIr} />);
    expect(await screen.findByText('Hoy no tienes visitas')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Mañana: 1 visita' }));
    expect(onIr).toHaveBeenCalledWith('agenda');
  });

  it('tocar la tarjeta fuera de Hecho abre el detalle de la visita', async () => {
    const c = await nuevoCliente({ nombre: 'Fam. García' });
    const v = await nuevaVisita({ cliente_id: c.id, precio: 6000 });
    const onIr = vi.fn();
    const user = montar(<Hoy onIr={onIr} />);
    await user.click(await screen.findByRole('button', { name: /^09:00\s*Fam. García/ }));
    expect(onIr).toHaveBeenCalledWith({ visita: v.id });
  });

  it('muestra «FERGO v<versión>» al pie, leída de package.json', async () => {
    const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
    expect(VERSION_APP).toBe(version);
    montar(<Hoy onIr={vi.fn()} />);
    expect(await screen.findByText(`FERGO v${version}`)).toBeTruthy();
  });
});

describe('Hoy · flujo Hecho (§10.1.4)', () => {
  it('criterio 9: puntual de 150 € → «Sí, 150 €» deja la visita hecha y crea el cobro con el último medio usado', async () => {
    const c = await nuevoCliente({ nombre: 'Comunidad Los Pinos' });
    const v = await nuevaVisita({ cliente_id: c.id, descripcion: 'Poda de setos', precio: 15000 });
    await guardarAjuste('ultimo_medio_pago', 'bizum');
    const user = montar(<Hoy onIr={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /^Hecho/ }));
    const hoja = await screen.findByRole('dialog', { name: '¿Cobraste a Comunidad Los Pinos?' });
    expect(within(hoja).getByRole('radio', { name: 'Bizum' }).getAttribute('aria-checked')).toBe('true');
    await user.click(within(hoja).getByRole('button', { name: 'Sí, 150 €' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await db.visitas.get(v.id))!.estado).toBe('hecha');
    const cobros = (await db.movimientos.toArray()).filter((m) => m.tipo === 'cobro' && !m.eliminado_en);
    expect(cobros).toHaveLength(1);
    expect(cobros[0]).toMatchObject({ importe: 15000, medio_pago: 'bizum', cliente_id: c.id });
    expect(await screen.findByText('Visita completada')).toBeTruthy();
    expect(await screen.findByText('Poda de setos · Cobrado 150 €')).toBeTruthy();
    expect(screen.getByText('1 de 1 hechas')).toBeTruthy();
  });

  it('criterio 10: «No, me paga después» sube «Te deben» 150 € y la tarjeta queda «Pendiente de cobro»; Deshacer lo revierte', async () => {
    const c = await nuevoCliente({ nombre: 'Comunidad Los Pinos' });
    const v = await nuevaVisita({ cliente_id: c.id, descripcion: 'Poda de setos', precio: 15000 });
    const user = montar(<Hoy onIr={vi.fn()} />);
    expect(await pendienteTotal()).toBe(0);
    await user.click(await screen.findByRole('button', { name: /^Hecho/ }));
    await user.click(await screen.findByRole('button', { name: 'No, me paga después' }));
    await waitFor(async () => expect(await pendienteTotal()).toBe(15000));
    expect(await screen.findByText('Poda de setos · Pendiente de cobro')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('te-deben').getAttribute('data-valor')).toBe('15000'));
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await db.visitas.get(v.id))!.estado).toBe('programada'));
    expect(await pendienteTotal()).toBe(0);
  });

  it('«Cobré otra cantidad» deja el resto pendiente (cobro parcial)', async () => {
    const c = await nuevoCliente({ nombre: 'Comunidad Los Pinos' });
    await nuevaVisita({ cliente_id: c.id, descripcion: 'Poda de setos', precio: 15000 });
    const user = montar(<Hoy onIr={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /^Hecho/ }));
    await user.click(await screen.findByRole('button', { name: 'Cobré otra cantidad' }));
    await user.type(screen.getByLabelText('Cobré'), '100');
    expect(screen.getByText('Quedan 50 € pendientes.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Guardar cobro' }));
    await waitFor(async () => expect(await pendienteTotal()).toBe(5000));
  });

  it('visita de abono: se marca hecha sin hoja de cobro y, con cuota vencida, pregunta «¿Te pagó el abono de [mes]?»', async () => {
    const c = await nuevoCliente({ nombre: 'Chalet Las Encinas', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1 });
    // Alta en septiembre: la cuota de octubre venció el día 1.
    await db.clientes.update(c.id, { creado_en: '2026-09-15T10:00:00Z' });
    const v = await nuevaVisita({ cliente_id: c.id, tipos_trabajo: ['piscina'], incluida_en_abono: true });
    await guardarAjuste('ultimo_medio_pago', 'transferencia');
    const user = montar(<Hoy onIr={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /^Hecho/ }));
    const hoja = await screen.findByRole('dialog', { name: '¿Te pagó el abono de octubre?' });
    expect((await db.visitas.get(v.id))!.estado).toBe('hecha');
    await user.click(within(hoja).getByRole('button', { name: 'Sí, 90 €' }));
    await waitFor(async () => expect(await pendienteTotal()).toBe(0));
    const cobro = (await db.movimientos.toArray()).find((m) => m.tipo === 'cobro')!;
    expect(cobro).toMatchObject({ importe: 9000, periodo_abono: '2026-10', medio_pago: 'transferencia' });
  });

  it('visita de abono al día: se marca hecha con «Visita completada» y no pregunta nada', async () => {
    const c = await nuevoCliente({ nombre: 'Chalet Las Encinas', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 20 });
    const v = await nuevaVisita({ cliente_id: c.id, incluida_en_abono: true });
    const user = montar(<Hoy onIr={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /^Hecho/ }));
    await waitFor(async () => expect((await db.visitas.get(v.id))!.estado).toBe('hecha'));
    expect(await screen.findByText('Visita completada')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('visita sin precio: se marca hecha y ofrece «Añadir cobro»', async () => {
    const c = await nuevoCliente({ nombre: 'Fam. García' });
    await nuevaVisita({ cliente_id: c.id, descripcion: 'Presupuesto' });
    const user = montar(<Hoy onIr={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /^Hecho/ }));
    await user.click(await screen.findByRole('button', { name: 'Añadir cobro' }));
    await user.type(await screen.findByLabelText('Cobré'), '40');
    await user.click(screen.getByRole('button', { name: 'Guardar cobro' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Añadir cobro' })).toBeNull());
    expect((await db.movimientos.toArray()).find((m) => m.tipo === 'cobro')!.importe).toBe(4000);
  });

  it('Pablo ve las visitas pero no tiene botón Hecho', async () => {
    const c = await nuevoCliente({ nombre: 'Fam. García' });
    await nuevaVisita({ cliente_id: c.id, precio: 6000 });
    await usarComo('colaborador');
    montar(<Hoy onIr={vi.fn()} />);
    expect(await screen.findByText('Fam. García')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Hecho/ })).toBeNull();
  });
});

describe('Hoja Hecho · medio de pago al montar antes de cargar (hallazgo de B)', () => {
  it('si la hoja se monta antes de que lleguen los datos, toma el último medio usado al cargar', async () => {
    const c = await nuevoCliente({ nombre: 'Comunidad Los Pinos' });
    const v = await nuevaVisita({ cliente_id: c.id, precio: 15000 });
    await guardarAjuste('ultimo_medio_pago', 'tarjeta');
    // Montada a la vez que el proveedor: en el primer render los datos aún no han llegado.
    montar(<HojaHecho visitaId={v.id} onCerrar={vi.fn()} />);
    const hoja = await screen.findByRole('dialog', { name: '¿Cobraste a Comunidad Los Pinos?' });
    await waitFor(() => expect(within(hoja).getByRole('radio', { name: 'Tarjeta' }).getAttribute('aria-checked')).toBe('true'));
  });

  it('si el usuario ya eligió otro medio, no se lo cambia al cambiar el último usado', async () => {
    const c = await nuevoCliente({ nombre: 'Comunidad Los Pinos' });
    const v = await nuevaVisita({ cliente_id: c.id, precio: 15000 });
    const user = montar(<HojaHecho visitaId={v.id} onCerrar={vi.fn()} />);
    await user.click(await screen.findByRole('radio', { name: 'Bizum' }));
    await act(() => guardarAjuste('ultimo_medio_pago', 'tarjeta'));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Bizum' }).getAttribute('aria-checked')).toBe('true'));
  });
});

describe('Hallazgos del revisor de la ola 4', () => {
  it('3) «Trabajo hecho» con cliente de abono pregunta «¿Te pagó el abono de [mes]?» y no muestra «Precio 0 €»', async () => {
    const c = await nuevoCliente({ nombre: 'Chalet Las Encinas', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1 });
    await db.clientes.update(c.id, { creado_en: '2026-09-15T10:00:00Z' });
    const user = montar(<HojaCobro clienteId={c.id} onCerrar={vi.fn()} />);
    const hoja = await screen.findByRole('dialog', { name: '¿Te pagó el abono de octubre?' });
    expect(within(hoja).queryByText('Precio')).toBeNull();
    await user.click(within(hoja).getByRole('button', { name: 'Sí, 90 €' }));
    await waitFor(async () => expect(await pendienteTotal()).toBe(0));
  });

  it('3) cliente de abono al día: lo dice y deja anotar un trabajo aparte', async () => {
    const c = await nuevoCliente({ nombre: 'Chalet Las Encinas', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 20 });
    const user = montar(<HojaCobro clienteId={c.id} onCerrar={vi.fn()} />);
    expect(await screen.findByRole('dialog', { name: 'El abono de Chalet Las Encinas está al día' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Anotar un trabajo aparte' }));
    expect(await screen.findByRole('dialog', { name: '¿Cobraste a Chalet Las Encinas?' })).toBeTruthy();
  });

  it('1) Pablo ve tachadas las pestañas que no puede usar y un texto que explica por qué', async () => {
    await usarComo('colaborador');
    montar(<Registrar onCerrar={vi.fn()} />);
    expect(await screen.findByText('Solo puedes registrar aportes y préstamos.')).toBeTruthy();
    const grupo = screen.getByRole('radiogroup', { name: 'Tipo de movimiento' });
    const deshabilitadas = within(grupo).getAllByRole('radio').filter((b) => (b as HTMLButtonElement).disabled).map((b) => b.textContent);
    expect(deshabilitadas).toEqual(['Gasto', 'Cobro', 'Fianza']);
    const css = readFileSync('src/styles/app.css', 'utf8');
    expect(css).toMatch(/\.segmentado button:disabled \{[^}]*line-through/);
  });

  it('1) Felipe no ve el texto de colaborador', async () => {
    await crearMovimiento({ tipo: 'aporte', importe: 100, fecha: AHORA.toISOString(), categoria_id: null, medio_pago: 'efectivo' });
    montar(<Registrar onCerrar={vi.fn()} />);
    await screen.findByRole('radiogroup', { name: 'Tipo de movimiento' });
    expect(screen.queryByText('Solo puedes registrar aportes y préstamos.')).toBeNull();
  });
});
