import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeshacerProvider } from '../components/Deshacer';
import { DatosProvider } from '../db/datos';
import { db, reiniciarBase } from '../db/db';
import { completarVisita, crearCliente, crearSerie, crearVisita, usarComo, type DatosCliente, type DatosVisita } from '../db/repo';
import type { Cliente, Visita } from '../domain/tipos';
import { desdeMadrid } from '../lib/fechas';
import { urlComoLlegar } from '../lib/mapas';
import { Agenda } from './Agenda';
import { VisitaDetalle } from './VisitaDetalle';
import { VisitaForm } from './VisitaForm';

// Pruebas de interfaz de la Agenda (§10.5, maqueta p. 5), el detalle de visita (§10.6), Nueva / Editar visita
// (§7.2, §8.5) y Mover visita (H4, pendiente de maqueta).

const AHORA = desdeMadrid(2026, 11, 7, 10); // sábado 7 de noviembre de 2026, 10:00 en Madrid
const HOY = '2026-11-07';
const LUNES = '2026-11-09';
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const BASE: DatosCliente = {
  nombre: 'Cliente', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: '', municipio: '',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
  frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [],
  precio_habitual: null, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};
const nuevoCliente = async (d: Partial<DatosCliente> = {}): Promise<Cliente> => (await crearCliente({ ...BASE, ...d })).cliente;

const datosVisita = (cliente_id: string, d: Partial<DatosVisita> = {}): DatosVisita => ({
  cliente_id, fecha: LUNES, hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['setos_poda'], descripcion: '',
  precio: 15000, incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0, ...d,
});
const nuevaVisita = async (cliente_id: string, d: Partial<DatosVisita> = {}) => (await crearVisita(datosVisita(cliente_id, d))).visita;

const serieQuincenal = async (cliente_id: string) =>
  crearSerie({
    cliente_id,
    regla: { frecuencia: 'quincenal', dias_semana: [1], hora: '09:00', duracion: 60 },
    fecha_inicio: LUNES,
    fecha_fin: null,
    plantilla_visita: { tipos_trabajo: ['corte_cesped'], descripcion: '', ayudantes: 0, requiere_vehiculo: false, precio: 6000, incluida_en_abono: false },
  });
const visitasSerie = async (serieId: string) =>
  (await db.visitas.where('serie_id').equals(serieId).toArray()).filter((v) => !v.eliminado_en).sort((a, b) => a.fecha.localeCompare(b.fecha));

function montar(ui: ReactNode) {
  const user = userEvent.setup();
  const r = render(
    <DatosProvider>
      <DeshacerProvider>{ui}</DeshacerProvider>
    </DatosProvider>,
  );
  return { user, ...r };
}

const agenda = () => {
  const props = { onAbrirVisita: vi.fn(), onNuevaVisita: vi.fn(), onAlertas: vi.fn() };
  return { props, ...montar(<Agenda {...props} />) };
};

const detalle = (visitaId: string) => {
  const props = { visitaId, etiquetaVolver: 'Agenda', onVolver: vi.fn(), onEditar: vi.fn(), onHecho: vi.fn(), onAbrirCliente: vi.fn() };
  return { props, ...montar(<VisitaDetalle {...props} />) };
};

/** Agenda con la hoja Nueva visita como la abrirá App. */
function ConHoja() {
  const [fecha, setFecha] = useState<string | null>(null);
  return (
    <>
      <Agenda onAbrirVisita={() => {}} onNuevaVisita={setFecha} onAlertas={() => {}} />
      {fecha && <VisitaForm fechaInicial={fecha} onCerrar={() => setFecha(null)} />}
    </>
  );
}

const dias = () => within(screen.getByRole('radiogroup', { name: 'Días' })).getAllByRole('radio');
const desactivado = (nombre: string | RegExp) => (screen.getByRole('button', { name: nombre }) as HTMLButtonElement).disabled;

function cambiarUA(ua: string) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  return () => {
    if (original) Object.defineProperty(navigator, 'userAgent', original);
    else delete (navigator as unknown as Record<string, unknown>).userAgent;
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('urlComoLlegar', () => {
  const casa = { lat: 40.3567, lon: -3.5321, direccion: 'Calle Mayor 3', municipio: 'Rivas-Vaciamadrid' };
  it('Android y resto: Google Maps en coche; iPhone/iPad: Apple Maps', () => {
    expect(urlComoLlegar(casa, 'Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.3567,-3.5321&travelmode=driving',
    );
    expect(urlComoLlegar(casa, UA_IPHONE)).toBe('https://maps.apple.com/?daddr=40.3567,-3.5321&dirflg=d');
    expect(urlComoLlegar(casa, 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toContain('maps.apple.com');
  });
  it('sin coordenadas usa la dirección codificada; sin nada devuelve null', () => {
    const sinCoord = { ...casa, lat: null, lon: null };
    const destino = encodeURIComponent('Calle Mayor 3, Rivas-Vaciamadrid');
    expect(urlComoLlegar(sinCoord, 'Android')).toBe(`https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=driving`);
    expect(urlComoLlegar(sinCoord, UA_IPHONE)).toBe(`https://maps.apple.com/?daddr=${destino}&dirflg=d`);
    expect(urlComoLlegar({ ...sinCoord, direccion: '  ', municipio: 'Rivas' }, 'Android')).toBeNull();
    // Valor por defecto: el navegador actual (jsdom no es un iPhone).
    expect(urlComoLlegar(casa)).toContain('google.com/maps');
  });
});

describe('Agenda · franja de 14 días (§10.5)', () => {
  it('14 días desde hoy, separador ORIENTATIVO y días 8–14 atenuados; hoy seleccionado', async () => {
    const { props, user } = agenda();
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeTruthy();
    expect(screen.getByText('Tiempo de los próximos 14 días')).toBeTruthy();
    expect(await screen.findByText('Sin visitas este día')).toBeTruthy();

    const ds = dias();
    expect(ds).toHaveLength(14);
    expect(ds[0].getAttribute('aria-label')).toBe('Sábado 7');
    expect(ds[0].textContent).toContain('Sáb');
    expect(ds[13].getAttribute('aria-label')).toBe('Viernes 20, orientativo');
    expect(screen.getByText('ORIENTATIVO')).toBeTruthy();
    expect(ds.slice(0, 7).every((d) => !d.className.includes('orientativo'))).toBe(true);
    expect(ds.slice(7).every((d) => d.className.includes('orientativo'))).toBe(true);
    // El separador va entre el día 7 y el 8.
    expect(ds[6].nextElementSibling?.className).toBe('franja-separador');
    expect(ds[0].getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Hoy' })).toBeTruthy();

    await user.click(ds[1]);
    expect(dias()[1].getAttribute('aria-checked')).toBe('true');
    expect(dias()[0].getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('heading', { name: 'Mañana, domingo 8' })).toBeTruthy();
    await user.click(dias()[5]);
    expect(screen.getByRole('heading', { name: 'Jueves 12' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Alertas' }));
    expect(props.onAlertas).toHaveBeenCalled();
  });

  it('después de las 20:00 (Madrid) se abre en mañana', async () => {
    vi.setSystemTime(desdeMadrid(2026, 11, 7, 20, 30));
    agenda();
    await screen.findByText('Sin visitas este día');
    expect(dias()[1].getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Mañana, domingo 8' })).toBeTruthy();
  });

  it('vacío del día: «Añadir visita» y «+» abren Nueva visita con el día elegido', async () => {
    const { props, user } = agenda();
    await user.click(await screen.findByRole('button', { name: 'Añadir visita' }));
    expect(props.onNuevaVisita).toHaveBeenLastCalledWith(HOY);
    await user.click(dias()[2]);
    await user.click(screen.getByRole('button', { name: 'Nueva visita' }));
    expect(props.onNuevaVisita).toHaveBeenLastCalledWith(LUNES);
  });

  it('día con visitas: punto, lista por hora y tarjeta como la maqueta p. 5', async () => {
    const garcia = await nuevoCliente({ nombre: 'Fam. García', telefono: '+34611566779' });
    const morales = await nuevoCliente({ nombre: 'Sra. Morales' });
    const tarde = await nuevaVisita(morales.id, { hora_inicio: '12:00', duracion: 180, precio: 18000, descripcion: 'Poda de setos', requiere_vehiculo: true, ayudantes: 2 });
    const pronto = await nuevaVisita(garcia.id, { hora_inicio: '09:00', tipos_trabajo: ['corte_cesped', 'riego'] });
    await nuevaVisita(garcia.id, { fecha: '2026-11-17' });

    const { props, user } = agenda();
    const lunes = await screen.findByRole('radio', { name: 'Lunes 9, con visitas' });
    expect(screen.getByRole('radio', { name: 'Martes 17, con visitas, orientativo' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Domingo 8' })).toBeTruthy();
    await user.click(lunes);

    const lista = screen.getByRole('list', { name: 'Visitas del día' });
    const items = within(lista).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-visita'))).toEqual([pronto.id, tarde.id]);

    const [a, b] = items;
    expect(a.textContent).toContain('09:00');
    expect(a.textContent).toContain('2 h');
    expect(a.textContent).toContain('Fam. García');
    expect(a.textContent).toContain('Césped, Riego');
    expect(a.textContent).toContain('Trabajo puntual · 150 €');
    expect(within(a).getByText('Sin previsión')).toBeTruthy();
    expect(a.textContent).not.toContain('Necesita furgoneta');
    expect(within(a).getByRole('link', { name: 'Llamar a Fam. García' }).getAttribute('href')).toBe('tel:+34611566779');

    expect(b.textContent).toContain('12:00');
    expect(b.textContent).toContain('3 h');
    expect(b.textContent).toContain('Poda de setos');
    expect(b.textContent).toContain('Trabajo puntual · 180 €');
    expect(within(b).getByText('Necesita furgoneta').className).toContain('ambar');
    expect(within(b).getByText('+2 ayudantes')).toBeTruthy();
    expect((within(b).getByRole('button', { name: 'Llamar a Sra. Morales' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(within(a).getByText('Fam. García'));
    expect(props.onAbrirVisita).toHaveBeenCalledWith(pronto.id);

    // Días 8–14: previsión orientativa.
    await user.click(screen.getByRole('radio', { name: 'Martes 17, con visitas, orientativo' }));
    expect(screen.getByText('Sin previsión · Previsión orientativa')).toBeTruthy();
  });

  it('hechas y canceladas llevan su estado con texto; las de serie muestran la periodicidad', async () => {
    const c = await nuevoCliente({ nombre: 'Chalet Las Encinas', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1 });
    await serieQuincenal(c.id);
    const hecha = await nuevaVisita(c.id, { hora_inicio: '13:00' });
    await completarVisita(hecha.id, null);
    const cancelada = await nuevaVisita(c.id, { hora_inicio: '08:00' });
    await db.visitas.update(cancelada.id, { estado: 'cancelada' });
    await nuevaVisita(c.id, { hora_inicio: '17:00', precio: null, incluida_en_abono: true });

    const { user } = agenda();
    await user.click(await screen.findByRole('radio', { name: 'Lunes 9, con visitas' }));
    const items = within(screen.getByRole('list', { name: 'Visitas del día' })).getAllByRole('listitem');
    // Canceladas al final.
    expect(items.map((li) => li.querySelector('.inicio')!.textContent)).toEqual(['09:00', '13:00', '17:00', '08:00']);
    expect(items[0].textContent).toContain('↻ Cada 15 días · 60 €');
    expect(within(items[1]).getByText('Hecha')).toBeTruthy();
    expect(items[2].textContent).toContain('Trabajo puntual · Abono');
    expect(within(items[3]).getByText('Cancelada')).toBeTruthy();
  });
});

describe('Nueva visita (§7.2)', () => {
  it('Guardar visita pide cliente y un tipo de trabajo; al elegir cliente precarga sus datos', async () => {
    await nuevoCliente({
      nombre: 'Fam. García', tipos_trabajo_habituales: ['setos_poda'], duracion_habitual: 90, precio_habitual: 18000,
      requiere_vehiculo_por_defecto: true, ayudantes_por_defecto: 2, hora_preferida: '10:00',
    });
    await nuevoCliente({ nombre: 'Sin Datos' });
    await nuevoCliente({ nombre: 'Inactivo SL', activo: false });
    const onCerrar = vi.fn();
    const { user } = montar(<VisitaForm fechaInicial={LUNES} onCerrar={onCerrar} />);
    const hoja = screen.getByRole('dialog', { name: 'Nueva visita' });
    expect((within(hoja).getByLabelText(/^Fecha/) as HTMLInputElement).value).toBe(LUNES);
    expect(desactivado('Guardar visita')).toBe(true);

    // Cliente sin trabajo habitual: sigue desactivado hasta elegir un tipo.
    await user.click(screen.getByRole('button', { name: /^Cliente/ }));
    const elegir = await screen.findByRole('dialog', { name: 'Elegir cliente' });
    expect(within(elegir).queryByText('Inactivo SL')).toBeNull();
    await user.click(within(elegir).getByText('Sin Datos'));
    expect(desactivado('Guardar visita')).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Riego' }));
    expect(desactivado('Guardar visita')).toBe(false);

    // Cambiar al cliente con datos habituales: se precargan.
    await user.click(screen.getByRole('button', { name: /^Cliente: Sin Datos/ }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Elegir cliente' })).getByText('Fam. García'));
    expect(screen.getByRole('checkbox', { name: 'Setos y poda' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'Riego' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: '1 h 30 min' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText(/^Precio/) as HTMLInputElement).value).toBe('180');
    expect((screen.getByRole('switch', { name: 'Necesita furgoneta' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('radio', { name: '2 ayudantes' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText('Hora') as HTMLInputElement).value).toBe('10:00');

    await user.type(screen.getByLabelText('Descripción'), 'Poda de setos');
    await user.click(screen.getByRole('button', { name: 'Guardar visita' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));
    const [v] = await db.visitas.toArray();
    expect(v).toMatchObject({
      fecha: LUNES, hora_inicio: '10:00', duracion: 90, tipos_trabajo: ['setos_poda'], descripcion: 'Poda de setos',
      precio: 18000, incluida_en_abono: false, requiere_vehiculo: true, ayudantes: 2, estado: 'programada', serie_id: null,
    });
    expect(onCerrar.mock.calls[0][0]).toMatchObject({ id: v.id });
    expect(await screen.findByText('Visita guardada')).toBeTruthy();
  });

  it('cliente de abono: «Incluida en el abono» activado y sin precio; la X con cambios pide confirmación', async () => {
    const c = await nuevoCliente({ nombre: 'Chalet Las Encinas', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1, tipos_trabajo_habituales: ['corte_cesped'], precio_habitual: 5000 });
    const onCerrar = vi.fn();
    const { user } = montar(<VisitaForm fechaInicial={LUNES} clienteInicial={c.id} onCerrar={onCerrar} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Cliente: Chalet Las Encinas/ })).toBeTruthy());
    expect((screen.getByRole('switch', { name: 'Incluida en el abono' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText(/^Precio/)).toBeNull();

    // Precargado sin tocar nada: cerrar no pregunta.
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('la X con cambios pregunta «¿Descartar los cambios?»', async () => {
    const onCerrar = vi.fn();
    const { user } = montar(<VisitaForm fechaInicial={LUNES} onCerrar={onCerrar} />);
    await user.type(screen.getByLabelText('Descripción'), 'algo');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    const d = screen.getByRole('alertdialog', { name: '¿Descartar los cambios?' });
    await user.click(within(d).getByRole('button', { name: 'Seguir editando' }));
    expect(onCerrar).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Descripción') as HTMLInputElement).value).toBe('algo');
  });

  it('serie quincenal: «Cada 15 días» crea visitas cada 14 días y aparecen en la franja', async () => {
    const c = await nuevoCliente({ nombre: 'Fam. García', tipos_trabajo_habituales: ['corte_cesped'], precio_habitual: 6000, duracion_habitual: 60 });
    const { user } = montar(<ConHoja />);
    await screen.findByText('Sin visitas este día');
    await user.click(dias()[2]); // lunes 9
    await user.click(screen.getByRole('button', { name: 'Nueva visita' }));
    await user.click(screen.getByRole('button', { name: /^Cliente/ }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Elegir cliente' })).getByText('Fam. García'));
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '09:30' } });
    await user.click(screen.getByRole('radio', { name: 'Cada 15 días' }));
    fireEvent.change(screen.getByLabelText('Hasta (opcional)'), { target: { value: '2026-12-31' } });
    await user.click(screen.getByRole('button', { name: 'Guardar visita' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nueva visita' })).toBeNull());

    const [serie] = await db.series.toArray();
    expect(serie).toMatchObject({ cliente_id: c.id, fecha_inicio: LUNES, fecha_fin: '2026-12-31', regla: { frecuencia: 'quincenal', dias_semana: [1], hora: '09:30', duracion: 60 } });
    const fechas = (await visitasSerie(serie.id)).map((v) => v.fecha);
    expect(fechas).toEqual(['2026-11-09', '2026-11-23', '2026-12-07', '2026-12-21']);

    // En la franja (7–20 de noviembre) solo el lunes 9 tiene visitas; el lunes 16 no.
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Lunes 9, con visitas' })).toBeTruthy());
    expect(screen.getByRole('radio', { name: 'Lunes 16, orientativo' })).toBeTruthy();
    const item = within(screen.getByRole('list', { name: 'Visitas del día' })).getByRole('listitem');
    expect(item.textContent).toContain('09:30');
    expect(item.textContent).toContain('↻ Cada 15 días · 60 €');
  });
});

describe('Editar visita de una serie (§8.5)', () => {
  it('«Solo esta visita» cambia solo esa', async () => {
    const c = await nuevoCliente({ nombre: 'Fam. García' });
    const { serie } = await serieQuincenal(c.id);
    const antes = await visitasSerie(serie.id);
    const segunda = antes[1];
    const onCerrar = vi.fn();
    const { user } = montar(<VisitaForm visita={segunda} onCerrar={onCerrar} />);
    expect(screen.getByRole('dialog', { name: 'Editar visita' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Se repite' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Cliente: Fam. García/ })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '11:00' } });
    await user.click(screen.getByRole('button', { name: 'Guardar visita' }));
    const d = screen.getByRole('alertdialog', { name: '¿Cambiar solo esta visita o también las siguientes?' });
    expect(within(d).getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    await user.click(within(d).getByRole('button', { name: 'Solo esta visita' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());

    const despues = await visitasSerie(serie.id);
    expect(despues.map((v) => v.hora_inicio)).toEqual(antes.map((v) => (v.id === segunda.id ? '11:00' : '09:00')));
    expect((await db.series.toArray()).filter((s) => !s.eliminado_en)).toHaveLength(1);
  });

  it('«Esta y las siguientes» cambia desde esa visita; las anteriores no cambian', async () => {
    const c = await nuevoCliente({ nombre: 'Fam. García' });
    const { serie } = await serieQuincenal(c.id);
    const [primera, segunda] = await visitasSerie(serie.id);
    const { user } = montar(<VisitaForm visita={segunda} onCerrar={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Cliente: Fam. García/ })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '11:00' } });
    await user.click(screen.getByRole('button', { name: 'Guardar visita' }));
    await user.click(screen.getByRole('button', { name: 'Esta y las siguientes' }));
    await screen.findByText('Visita guardada');

    const vivas = (await db.visitas.toArray()).filter((v) => !v.eliminado_en).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const p = vivas.find((v) => v.fecha === primera.fecha)!;
    expect(p).toMatchObject({ id: primera.id, hora_inicio: '09:00', serie_id: serie.id });
    const siguientes = vivas.filter((v) => v.fecha >= segunda.fecha);
    expect(siguientes.length).toBeGreaterThan(1);
    expect(siguientes.every((v) => v.hora_inicio === '11:00' && v.serie_id !== serie.id)).toBe(true);
    expect((await db.series.get(serie.id))!.fecha_fin).toBe('2026-11-22');
  });
});

describe('Detalle de visita (§10.6)', () => {
  const clienteCompleto = () =>
    nuevoCliente({ nombre: 'Fam. García', telefono: '+34611566779', direccion: 'Calle Mayor 3', municipio: 'Rivas-Vaciamadrid', lat: 40.3567, lon: -3.5321 });

  it('datos, tiempo «Sin previsión» y acciones con enlaces reales (Google Maps en Android)', async () => {
    const c = await clienteCompleto();
    const v = await nuevaVisita(c.id, { descripcion: 'Poda de setos', requiere_vehiculo: true });
    const { props, user } = detalle(v.id);
    expect(await screen.findByRole('button', { name: 'Fam. García' })).toBeTruthy();
    expect(screen.getByText('Lunes, 9 de noviembre')).toBeTruthy();
    expect(screen.getByText('09:00 – 11:00 · 2 h')).toBeTruthy();
    expect(screen.getByText('Setos y poda')).toBeTruthy();
    expect(screen.getByText('Poda de setos')).toBeTruthy();
    expect(screen.getByText('150 €')).toBeTruthy();
    expect(screen.getByText('Necesita furgoneta')).toBeTruthy();
    const tiempo = screen.getByRole('region', { name: 'Tiempo de la visita' });
    expect(within(tiempo).getByText('Sin previsión')).toBeTruthy();
    expect(within(tiempo).getByText('El tiempo llega en la próxima versión.')).toBeTruthy();

    expect(screen.getByRole('link', { name: 'Llamar' }).getAttribute('href')).toBe('tel:+34611566779');
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/34611566779');
    expect(screen.getByRole('link', { name: 'Cómo llegar' }).getAttribute('href')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.3567,-3.5321&travelmode=driving',
    );

    await user.click(screen.getByRole('button', { name: 'Hecho' }));
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Fam. García' }));
    await user.click(screen.getByRole('button', { name: 'Volver a Agenda' }));
    expect(props.onHecho).toHaveBeenCalledWith(v.id);
    expect(props.onEditar).toHaveBeenCalledWith(v.id);
    expect(props.onAbrirCliente).toHaveBeenCalledWith(c.id);
    expect(props.onVolver).toHaveBeenCalled();
  });

  it('en iPhone «Cómo llegar» abre Apple Maps; serie y abono se indican con texto', async () => {
    const restaurar = cambiarUA(UA_IPHONE);
    try {
      const c = await clienteCompleto();
      const { serie } = await serieQuincenal(c.id);
      const [v] = await visitasSerie(serie.id);
      await db.visitas.update(v.id, { incluida_en_abono: true, precio: null });
      detalle(v.id);
      expect((await screen.findByRole('link', { name: 'Cómo llegar' })).getAttribute('href')).toBe('https://maps.apple.com/?daddr=40.3567,-3.5321&dirflg=d');
      expect(screen.getByText('Se repite cada 15 días')).toBeTruthy();
      expect(screen.getByText('Incluida en el abono')).toBeTruthy();
    } finally {
      restaurar();
    }
  });

  it('visita hecha: «Hecha» y estado de cobro; sin Hecho ni Mover', async () => {
    const c = await clienteCompleto();
    const v = await nuevaVisita(c.id);
    await completarVisita(v.id, { cobrado: 10000, medio_pago: 'efectivo' });
    detalle(v.id);
    expect(await screen.findByText('Hecha')).toBeTruthy();
    expect(screen.getByText('Cobro parcial: quedan 50 €').className).toContain('ambar');
    expect(screen.queryByRole('button', { name: 'Hecho' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mover' })).toBeNull();
  });

  it('visita hecha sin cobrar: «Pendiente de cobro: 150 €»', async () => {
    const c = await clienteCompleto();
    const v = await nuevaVisita(c.id);
    await completarVisita(v.id, { cobrado: 0, medio_pago: 'efectivo' });
    detalle(v.id);
    expect(await screen.findByText('Pendiente de cobro: 150 €')).toBeTruthy();
  });

  it('visita que ya no está', async () => {
    const { props, user } = detalle('no-existe');
    expect(await screen.findByText('Esta visita ya no está')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(props.onVolver).toHaveBeenCalled();
  });

  it('Mover: hoja provisional (pendiente de maqueta) que guarda de dónde venía y el motivo', async () => {
    const c = await clienteCompleto();
    const v = await nuevaVisita(c.id);
    const { user } = detalle(v.id);
    await user.click(await screen.findByRole('button', { name: 'Mover' }));
    const hoja = screen.getByRole('dialog', { name: 'Mover visita' });
    expect(within(hoja).getByText('Pantalla provisional: el diseño de mover visita está pendiente de maqueta.').className).toContain('texto-aclaratorio');
    expect(within(hoja).getByRole('radio', { name: 'Propio' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(within(hoja).getByLabelText('Fecha'), { target: { value: '2026-11-12' } });
    fireEvent.change(within(hoja).getByLabelText('Hora'), { target: { value: '11:00' } });
    await user.click(within(hoja).getByRole('radio', { name: 'Clima' }));
    await user.click(within(hoja).getByRole('button', { name: 'Mover visita' }));

    expect(await screen.findByText('Visita movida al jueves 12')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Mover visita' })).toBeNull();
    const movida = (await db.visitas.get(v.id))!;
    expect(movida).toMatchObject({ fecha: '2026-11-12', hora_inicio: '11:00', reprogramada_desde: '2026-11-09 09:00', motivo_reprogramacion: 'clima' });
    expect(await screen.findByText('Movida desde el lunes 9 de noviembre a las 09:00 (motivo: clima)')).toBeTruthy();
    expect(screen.getByText('Jueves, 12 de noviembre')).toBeTruthy();
  });

  it('Cancelar visita con motivo y deshacer', async () => {
    const c = await clienteCompleto();
    const v = await nuevaVisita(c.id);
    const { user } = detalle(v.id);
    await user.click(await screen.findByRole('button', { name: 'Cancelar visita' }));
    const d = screen.getByRole('alertdialog', { name: '¿Cancelar esta visita?' });
    await user.type(within(d).getByLabelText('Motivo (opcional)'), 'Llueve');
    await user.click(within(d).getByRole('button', { name: 'Cancelar visita' }));

    expect(await screen.findByText('Visita cancelada')).toBeTruthy();
    await waitFor(async () => expect((await db.visitas.get(v.id))!).toMatchObject({ estado: 'cancelada', motivo_cancelacion: 'Llueve' }));
    expect(await screen.findByText('Cancelada')).toBeTruthy();
    expect(screen.getByText('Motivo: Llueve')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hecho' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await db.visitas.get(v.id))!.estado).toBe('programada'));
    expect(await screen.findByRole('button', { name: 'Hecho' })).toBeTruthy();
  });

  it('Eliminar visita: borrado lógico, barra con deshacer y vuelve', async () => {
    const c = await clienteCompleto();
    const v = await nuevaVisita(c.id);
    const { props, user } = detalle(v.id);
    await user.click(await screen.findByRole('button', { name: 'Eliminar visita' }));
    await waitFor(() => expect(props.onVolver).toHaveBeenCalled());
    expect((await db.visitas.get(v.id))!.eliminado_en).not.toBeNull();
    expect(screen.getByText('Visita eliminada')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await db.visitas.get(v.id))!.eliminado_en).toBeNull());
  });
});

describe('Pablo (colaborador)', () => {
  it('ve la agenda y el detalle, pero no crea ni cambia visitas', async () => {
    const c = await nuevoCliente({ nombre: 'Fam. García', telefono: '+34611566779', direccion: 'Calle Mayor 3' });
    const v: Visita = await nuevaVisita(c.id);
    await usarComo('colaborador');

    const { user, unmount } = agenda();
    expect(await screen.findByText('Sin visitas este día')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Añadir visita' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nueva visita' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Lunes 9, con visitas' }));
    expect(screen.getByText('Fam. García')).toBeTruthy();
    unmount();

    detalle(v.id);
    expect(await screen.findByRole('link', { name: 'Llamar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cómo llegar' })).toBeTruthy();
    for (const nombre of ['Hecho', 'Mover', 'Editar', 'Cancelar visita', 'Eliminar visita']) {
      expect(screen.queryByRole('button', { name: nombre })).toBeNull();
    }
  });
});
