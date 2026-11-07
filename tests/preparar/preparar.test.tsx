// Preparar trabajo (ola 8, encargo A; spec §10.8): pantalla con los tres bloques, registro doble de la furgoneta
// (gasto + fianza) reflejado en Hoy y Movimientos, devolución con descuento, material «Lo tengo» / «Comprar» con
// recordatorio y gasto, ropa por personas, sin conexión, deshacer y permisos de Pablo. Base local falsa (IndexedDB).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { DeshacerProvider } from '../../src/components/Deshacer';
import { DatosProvider } from '../../src/db/datos';
import { db, reiniciarBase } from '../../src/db/db';
import { crearCliente, crearVisita, editarVisita, leerAjuste, usarComo, type DatosCliente } from '../../src/db/repo';
import type { Movimiento } from '../../src/domain/tipos';
import { CLAVE_PREPARACIONES, CLAVE_RESERVAS, type Preparacion, type ReservaVehiculo } from '../../src/features/preparar/modelo';
import { PrepararTrabajo } from '../../src/features/preparar/PrepararTrabajo';
import { desdeMadrid } from '../../src/lib/fechas';

const AHORA = desdeMadrid(2026, 11, 7, 10); // sábado 7 de noviembre de 2026, 10:00 en Madrid
const MIERCOLES = '2026-11-11';

const BASE: DatosCliente = {
  nombre: 'Urb. El Olivar', tipo: 'comunidad', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Olivo 1', municipio: 'Madrid',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [], precio_habitual: null,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};

/** Miércoles 11: Urb. El Olivar (setos y poda, 08:30, furgoneta, 2 ayudantes) y Sra. Morales (césped, 11:00, furgoneta). */
async function escena(op: { dos?: boolean; furgo?: boolean } = {}) {
  const { dos = true, furgo = true } = op;
  const olivar = (await crearCliente(BASE)).cliente;
  const v1 = (
    await crearVisita({
      cliente_id: olivar.id, fecha: MIERCOLES, hora_inicio: '08:30', duracion: 180, tipos_trabajo: ['setos_poda'], descripcion: '', precio: 20000,
      incluida_en_abono: false, requiere_vehiculo: furgo, ayudantes: 2,
    })
  ).visita;
  if (!dos) return { olivar, v1 };
  const morales = (await crearCliente({ ...BASE, nombre: 'Sra. Morales', tipo: 'particular' })).cliente;
  const v2 = (
    await crearVisita({
      cliente_id: morales.id, fecha: MIERCOLES, hora_inicio: '11:00', duracion: 120, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: 6000,
      incluida_en_abono: false, requiere_vehiculo: furgo, ayudantes: 0,
    })
  ).visita;
  return { olivar, morales, v1, v2 };
}

function montar(ui: ReactNode) {
  const user = userEvent.setup();
  const r = render(
    <DatosProvider>
      <DeshacerProvider>{ui}</DeshacerProvider>
    </DatosProvider>,
  );
  return { user, ...r };
}
const pantalla = () => montar(<PrepararTrabajo fecha={MIERCOLES} etiquetaVolver="Alertas" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />);
const bloque = (id: string) => document.querySelector(`[data-bloque="${id}"]`) as HTMLElement;
const texto = (el: Element | null | undefined) => el?.textContent ?? '';
const activos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();
const catId = async (clave: string) => (await db.categorias.where('clave').equals(clave).first())!.id;
const reservas = () => leerAjuste<ReservaVehiculo[]>(CLAVE_RESERVAS, []);
const preparacion = async () => (await leerAjuste<Record<string, Preparacion>>(CLAVE_PREPARACIONES, {}))[MIERCOLES];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => vi.useRealTimers());

/** «Ya la reservé» con Alquileres Sur, 90 € y 150 € de fianza. */
async function reservar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(bloque('furgoneta')).getByRole('button', { name: 'Ya la reservé' }));
  const hoja = screen.getByRole('dialog', { name: 'Ya la reservé' });
  expect((within(hoja).getByLabelText('Recogida') as HTMLInputElement).value).toBe('2026-11-10T19:00'); // la tarde anterior
  expect((within(hoja).getByLabelText('Devolución') as HTMLInputElement).value).toBe('2026-11-11T20:00');
  await user.type(within(hoja).getByLabelText('¿A quién se la alquilas?'), 'Alquileres Sur');
  await user.type(within(hoja).getByLabelText('Precio del alquiler (€)'), '90');
  await user.type(within(hoja).getByLabelText('Fianza prevista (€)'), '150');
  await user.click(within(hoja).getByRole('button', { name: 'Guardar reserva' }));
  await waitFor(() => expect(texto(bloque('furgoneta'))).toMatch('Reservada'));
}

describe('Logro a · se abre con los tres bloques', () => {
  it('cabecera, progreso y bloques Furgoneta, Material y Ropa', async () => {
    await escena();
    pantalla();
    expect(await screen.findByRole('heading', { name: 'Miércoles 11 · 2 trabajos' })).toBeTruthy();
    expect(screen.getByText('PREPARAR · EN 4 DÍAS')).toBeTruthy();
    expect(screen.getByText('Setos y poda y césped · 08:30 · Tú y 2 ayudantes')).toBeTruthy();
    expect(texto(document.querySelector('.visitas-preparar'))).toMatch(/08:30Urb\. El Olivar.*11:00Sra\. Morales/);
    expect(screen.getByText('0 de 3 listos')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');

    expect(texto(bloque('furgoneta'))).toMatch('Sin reservar');
    expect(texto(bloque('furgoneta'))).toMatch('Hace falta para este trabajo.');
    const material = within(bloque('material'));
    expect(material.getByRole('heading', { name: '¿Tienes todo el material?' })).toBeTruthy();
    expect(material.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Cuchillas cortasetos', 'Gasolina de mezcla', 'Sacos de restos', 'Lona']);
    expect(within(bloque('ropa')).getByRole('heading', { name: 'Ropa para 3 personas' })).toBeTruthy();
    expect(texto(bloque('ropa'))).toMatch('Te lo recuerdo el martes 10 a las 21:00');
  });

  it('sin furgoneta ni plantilla de material, solo cuenta la ropa', async () => {
    const { olivar } = await escena({ dos: false, furgo: false });
    await editarVisita((await db.visitas.toArray())[0].id, { tipos_trabajo: ['corte_cesped'] });
    void olivar;
    pantalla();
    expect(await screen.findByText('0 de 1 listos')).toBeTruthy();
    expect(bloque('furgoneta')).toBeNull();
    expect(texto(bloque('material'))).toMatch('no hay lista de material');
  });
});

describe('Logro b · reservar la furgoneta y registro doble (gasto + fianza)', () => {
  it('«Registrar los dos» crea el alquiler repartido entre los clientes y la fianza; se ve en Hoy y en Movimientos; Deshacer lo quita', async () => {
    const { olivar, morales } = await escena();
    const { user, unmount } = pantalla();
    await screen.findByRole('heading', { name: 'Miércoles 11 · 2 trabajos' });
    await reservar(user);
    expect(texto(screen.getByRole('status'))).toMatch('Furgoneta reservada');
    expect(texto(bloque('furgoneta'))).toMatch('150,00 € (se devuelve)');
    expect(texto(bloque('furgoneta'))).toMatch('Al recogerla te pido registrar el pago y la fianza.');
    expect(await activos()).toEqual([]); // reservar no mueve dinero: se paga al recogerla
    expect(screen.getByText('1 de 3 listo')).toBeTruthy();

    await user.click(within(bloque('furgoneta')).getByRole('radio', { name: 'Tarjeta' }));
    await user.click(within(bloque('furgoneta')).getByRole('button', { name: 'Registrar los dos' }));
    await waitFor(() => expect(texto(bloque('furgoneta'))).toMatch('Alquiler registrado'));
    expect(texto(screen.getByRole('status'))).toMatch('Alquiler y fianza registrados');

    const movs = await activos();
    const alquiler = await catId('alquiler_furgoneta');
    const gastos = movs.filter((m) => m.tipo === 'gasto');
    expect(gastos.map((m) => [m.importe, m.categoria_id, m.cliente_id, m.medio_pago]).sort()).toEqual(
      [[4500, alquiler, olivar.id, 'tarjeta'], [4500, alquiler, morales!.id, 'tarjeta']].sort(),
    );
    const fianza = movs.find((m) => m.tipo === 'fianza_entregada') as Movimiento;
    expect(fianza).toMatchObject({ importe: 15000, categoria_id: null, fianza: { entregada_a: 'Alquileres Sur', motivo: 'Furgoneta' } });
    for (const m of movs) expect(m.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await reservas())[0]).toMatchObject({ estado: 'recogida', fianza_id: fianza.id, precio: 9000, fianza_prevista: 15000 });

    // Hoy: «En fianzas» 150 €, «En caja» −240 €, «Ganado» −90 € (la fianza no es gasto).
    unmount();
    const app = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(Number(screen.getByTestId('fianzas').getAttribute('data-valor'))).toBe(15000));
    expect(Number(screen.getByTestId('en-caja').getAttribute('data-valor'))).toBe(-24000);
    expect(Number(screen.getByTestId('ganado').getAttribute('data-valor'))).toBe(-9000);
    // Movimientos: los dos gastos de alquiler y la fianza «Pendiente de devolver».
    await app.click(screen.getByRole('button', { name: 'Movimientos' }));
    expect(await screen.findByText('Pendiente de devolver')).toBeTruthy();
    expect(screen.getAllByText(/Alquiler/).length).toBeGreaterThanOrEqual(2);
  });

  it('Deshacer el registro doble deja la reserva como estaba y sin dinero', async () => {
    await escena();
    const { user } = pantalla();
    await screen.findByRole('heading', { name: 'Miércoles 11 · 2 trabajos' });
    await reservar(user);
    await user.click(within(bloque('furgoneta')).getByRole('button', { name: 'Registrar los dos' }));
    await waitFor(() => expect(texto(bloque('furgoneta'))).toMatch('Alquiler registrado'));
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(texto(bloque('furgoneta'))).toMatch('Reservada'));
    expect(await activos()).toEqual([]);
    expect((await reservas())[0]).toMatchObject({ estado: 'reservada', fianza_id: null, gasto_ids: [] });
  });

  it('devolución con descuento: vuelven 120 € y se anota un gasto de 30 € «Descuento de fianza» en Alquiler de furgoneta', async () => {
    await escena({ dos: false });
    const { user } = pantalla();
    await screen.findByRole('heading', { name: 'Miércoles 11 · Urb. El Olivar' });
    await reservar(user);
    await user.click(within(bloque('furgoneta')).getByRole('button', { name: 'Registrar los dos' }));
    await waitFor(() => expect(texto(bloque('furgoneta'))).toMatch('¿Te devolvieron la fianza?'));
    await user.click(within(bloque('furgoneta')).getByRole('button', { name: 'Me descontaron algo' }));
    await user.type(within(bloque('furgoneta')).getByLabelText('¿Cuánto te devolvieron?'), '120');
    expect(texto(bloque('furgoneta'))).toMatch('Se anota un gasto de 30,00 €');
    await user.click(within(bloque('furgoneta')).getByRole('button', { name: 'Guardar devolución' }));
    await waitFor(() => expect(texto(bloque('furgoneta'))).toMatch('Devuelta'));
    const movs = await activos();
    expect(movs.find((m) => m.tipo === 'fianza_devuelta')?.importe).toBe(12000);
    expect(movs.find((m) => m.nota === 'Descuento de fianza')).toMatchObject({ tipo: 'gasto', importe: 3000, categoria_id: await catId('alquiler_furgoneta') });
  });
});

describe('Logro c · material «Lo tengo» / «Comprar» y recordatorio', () => {
  it('alterna entre los dos, guarda el recordatorio y al comprar ofrece registrar el gasto', async () => {
    await escena();
    const { user } = pantalla();
    await screen.findByRole('heading', { name: 'Miércoles 11 · 2 trabajos' });
    const grupo = (n: string) => within(within(bloque('material')).getByRole('group', { name: n }));

    await user.click(grupo('Lona').getByRole('button', { name: 'Lo tengo' }));
    await waitFor(() => expect(grupo('Lona').getByRole('button', { name: 'Lo tengo' }).getAttribute('aria-pressed')).toBe('true'));
    await user.click(grupo('Lona').getByRole('button', { name: 'Comprar' }));
    await waitFor(() => expect(grupo('Lona').getByRole('button', { name: 'Comprar' }).getAttribute('aria-pressed')).toBe('true'));
    expect(grupo('Lona').getByRole('button', { name: 'Lo tengo' }).getAttribute('aria-pressed')).toBe('false');
    // Volver a tocar el activo lo deja sin revisar.
    await user.click(grupo('Lona').getByRole('button', { name: 'Comprar' }));
    await waitFor(() => expect(grupo('Lona').getByRole('button', { name: 'Comprar' }).getAttribute('aria-pressed')).toBe('false'));

    await user.click(grupo('Gasolina de mezcla').getByRole('button', { name: 'Comprar' }));
    await waitFor(() => expect(texto(bloque('material'))).toMatch('Lista de compra: gasolina de mezcla'));
    // Recordatorio por defecto guardado: mañana (domingo 8) a las 18:00.
    await waitFor(async () => expect((await preparacion())?.recordatorio_compra).toBe('2026-11-08T18:00'));
    expect(within(bloque('material')).getByRole('button', { name: 'Mañana a las 18:00' })).toBeTruthy();
    await user.click(within(bloque('material')).getByRole('button', { name: 'Mañana a las 18:00' }));
    await user.click(within(bloque('material')).getByRole('button', { name: 'Mañana 09:00' }));
    await waitFor(async () => expect((await preparacion())?.recordatorio_compra).toBe('2026-11-08T09:00'));
    expect(texto(screen.getByRole('status'))).toMatch('Te lo recuerdo mañana a las 09:00');

    // Comprado → «¿Registrar el gasto?» con la categoría deducida.
    await user.click(within(bloque('material')).getByRole('button', { name: 'Comprado' }));
    const hoja = await screen.findByRole('dialog', { name: '¿Registrar el gasto?' });
    expect((within(hoja).getByLabelText('Categoría') as HTMLSelectElement).value).toBe(await catId('gasolina_mezcla'));
    await user.type(within(hoja).getByLabelText('Importe (€)'), '12,50');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [g] = await activos();
    expect(g).toMatchObject({ tipo: 'gasto', importe: 1250, categoria_id: await catId('gasolina_mezcla'), nota: 'Gasolina de mezcla', cliente_id: null });
    expect((await preparacion())?.material.find((i) => i.nombre === 'Gasolina de mezcla')).toMatchObject({ estado: 'comprado', gasto_id: g.id });
    expect(texto(bloque('material'))).toMatch('Comprado');
  });

  it('«+ Añadir otra cosa» solo para esta preparación, con Deshacer', async () => {
    await escena({ dos: false });
    const { user } = pantalla();
    await screen.findByRole('heading', { name: 'Miércoles 11 · Urb. El Olivar' });
    await user.click(within(bloque('material')).getByRole('button', { name: 'Añadir otra cosa' }));
    await user.type(within(bloque('material')).getByLabelText('Qué más necesitas'), 'Escalera');
    await user.click(within(bloque('material')).getByRole('button', { name: 'Añadir' }));
    await waitFor(() => expect(within(bloque('material')).getByRole('group', { name: 'Escalera' })).toBeTruthy());
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(within(bloque('material')).queryByRole('group', { name: 'Escalera' })).toBeNull());
  });
});

describe('«Añadir siempre para [tipo]» (§10.8.2, con la función de plantillas del encargo B)', () => {
  it('guarda el artículo en la plantilla de ese tipo, sale en otros días con ese trabajo, no se repite y Deshacer lo quita', async () => {
    const { morales } = await escena(); // miércoles: setos y poda + césped
    await crearVisita({
      cliente_id: morales!.id, fecha: '2026-11-18', hora_inicio: '10:00', duracion: 120, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: null,
      incluida_en_abono: true, requiere_vehiculo: false, ayudantes: 0,
    });
    const { user, unmount } = pantalla();
    await screen.findByRole('heading', { name: 'Miércoles 11 · 2 trabajos' });
    const material = () => within(bloque('material'));

    await user.click(material().getByRole('button', { name: 'Añadir otra cosa' }));
    await user.type(material().getByLabelText('Qué más necesitas'), 'Escalera');
    expect(material().getAllByRole('checkbox').map((x) => x.textContent)).toEqual(['Añadir siempre para setos y poda', 'Añadir siempre para césped']);
    await user.click(material().getByRole('checkbox', { name: 'Añadir siempre para césped' }));
    await user.click(material().getByRole('button', { name: 'Añadir' }));
    await waitFor(() => expect(texto(screen.getByRole('status'))).toMatch('Añadido a la lista y a la plantilla'));
    const plantilla = () => leerAjuste<Record<string, string[]>>('plantillas_material', {});
    expect((await plantilla()).corte_cesped).toEqual(['Escalera']);
    expect((await plantilla()).setos_poda).toEqual(['Cuchillas cortasetos', 'Gasolina de mezcla', 'Sacos de restos', 'Lona']);
    expect(material().getAllByRole('group', { name: 'Escalera' })).toHaveLength(1); // una sola vez en la lista

    // Lo que ya está en la plantilla no se repite.
    await user.click(material().getByRole('button', { name: 'Añadir otra cosa' }));
    await user.type(material().getByLabelText('Qué más necesitas'), 'lona');
    await user.click(material().getByRole('checkbox', { name: 'Añadir siempre para setos y poda' }));
    await user.click(material().getByRole('button', { name: 'Añadir' }));
    await waitFor(() => expect(material().queryByLabelText('Qué más necesitas')).toBeNull());
    expect((await plantilla()).setos_poda.filter((x) => x.toLowerCase() === 'lona')).toHaveLength(1);
    unmount();

    // Otro día con césped: la plantilla ya trae «Escalera».
    const otro = montar(<PrepararTrabajo fecha="2026-11-18" etiquetaVolver="Alertas" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Miércoles 18 · Sra. Morales' });
    expect(material().getByRole('group', { name: 'Escalera' })).toBeTruthy();
    otro.unmount();

    // Deshacer el primer añadido (de vuelta en el miércoles 11) quita el artículo de la plantilla y de la lista.
    const de11 = pantalla();
    await screen.findByRole('heading', { name: 'Miércoles 11 · 2 trabajos' });
    await de11.user.click(material().getByRole('button', { name: 'Añadir otra cosa' }));
    await de11.user.type(material().getByLabelText('Qué más necesitas'), 'Rastrillo');
    await de11.user.click(material().getByRole('checkbox', { name: 'Añadir siempre para césped' }));
    await de11.user.click(material().getByRole('button', { name: 'Añadir' }));
    await waitFor(async () => expect((await plantilla()).corte_cesped).toEqual(['Escalera', 'Rastrillo']));
    await de11.user.click(within(await screen.findByRole('status')).getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await plantilla()).corte_cesped).toEqual(['Escalera']));
    await waitFor(() => expect(material().queryByRole('group', { name: 'Rastrillo' })).toBeNull());
  });
});

describe('Logro d · la ropa cambia con la cantidad de personas', () => {
  it('3 personas con 2 ayudantes; sin ayudantes, 1 persona', async () => {
    const { v1 } = await escena({ dos: false });
    const { user } = pantalla();
    const ropa = () => within(bloque('ropa'));
    await screen.findByRole('heading', { name: 'Ropa para 3 personas' });
    expect(ropa().getByRole('checkbox', { name: 'Polos FERGO (3)' })).toBeTruthy();
    expect(ropa().getByRole('checkbox', { name: 'Guantes (3 pares)' })).toBeTruthy();
    expect(ropa().getByRole('checkbox', { name: 'Agua y protector' })).toBeTruthy();

    await user.click(ropa().getByRole('checkbox', { name: 'Polos FERGO (3)' }));
    await waitFor(() => expect(ropa().getByRole('checkbox', { name: 'Polos FERGO (3)' }).getAttribute('aria-checked')).toBe('true'));

    await editarVisita(v1.id, { ayudantes: 0 });
    await screen.findByRole('heading', { name: 'Ropa para 1 persona' });
    expect(ropa().getByRole('checkbox', { name: 'Polo FERGO (1)' }).getAttribute('aria-checked')).toBe('true'); // la marca se conserva
    expect(ropa().getByRole('checkbox', { name: 'Guantes (1 par)' })).toBeTruthy();
    expect(screen.getByText(/Tú solo/)).toBeTruthy();
  });
});

describe('Logro e · sin conexión y permisos', () => {
  it('sin conexión muestra la banda y todo se guarda en el móvil', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await escena({ dos: false });
    const { user } = pantalla();
    expect(await screen.findByText('Sin conexión. Lo guardo y lo envío al volver.')).toBeTruthy();
    await reservar(user);
    await user.click(within(bloque('furgoneta')).getByRole('button', { name: 'Registrar los dos' }));
    await waitFor(async () => expect((await activos()).map((m) => m.tipo).sort()).toEqual(['fianza_entregada', 'gasto']));
    await user.click(within(bloque('ropa')).getByRole('checkbox', { name: 'Botas (3 pares)' }));
    await waitFor(async () => expect((await preparacion())?.ropa_marcada).toEqual(['botas']));
  });

  it('Pablo ve la preparación pero no puede cambiarla', async () => {
    await escena({ dos: false });
    await usarComo('colaborador');
    pantalla();
    await screen.findByRole('heading', { name: 'Miércoles 11 · Urb. El Olivar' });
    expect(within(bloque('furgoneta')).queryByRole('button', { name: 'Ya la reservé' })).toBeNull();
    expect((within(bloque('material')).getAllByRole('button', { name: 'Lo tengo' })[0] as HTMLButtonElement).disabled).toBe(true);
    expect((within(bloque('ropa')).getAllByRole('checkbox')[0] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Felipe prepara el trabajo/)).toBeTruthy();
  });
});

describe('Navegación: Detalle de visita → Preparar trabajo', () => {
  it('desde el detalle de una visita de hoy se abre la preparación de ese día', async () => {
    const olivar = (await crearCliente(BASE)).cliente;
    await crearVisita({
      cliente_id: olivar.id, fecha: '2026-11-07', hora_inicio: '16:00', duracion: 120, tipos_trabajo: ['setos_poda'], descripcion: '', precio: 20000,
      incluida_en_abono: false, requiere_vehiculo: true, ayudantes: 1,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('Urb. El Olivar'));
    await user.click(await screen.findByRole('button', { name: /Preparación/ }));
    expect(await screen.findByRole('heading', { name: 'Sábado 7 · Urb. El Olivar' })).toBeTruthy();
    expect(screen.getByText('PREPARAR · HOY')).toBeTruthy();
    expect(within(bloque('ropa')).getByRole('heading', { name: 'Ropa para 2 personas' })).toBeTruthy();
  });
});
