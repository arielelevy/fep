// Clima en las pantallas (ola 6, frente B): Agenda (§10.5), Hoy (§10.1.1.4) y Detalle de visita (§10.6) con el
// motor y el proveedor simulado del frente A (src/clima), datos deterministas por escenario.
// Criterios de aceptación de §18 que tocan la interfaz: 14, 15, 16, 17 (sólo semáforo; la alerta es de otra ola) y 18.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria, configurarClima, crearProveedorSimulado, crearServicioClima, type AvisoOficial, type HoraClima, type Ubicacion } from '../../src/clima';
import { DeshacerProvider } from '../../src/components/Deshacer';
import { DatosProvider } from '../../src/db/datos';
import { reiniciarBase } from '../../src/db/db';
import { crearCliente, crearVisita, type DatosCliente, type DatosVisita } from '../../src/db/repo';
import type { Cliente } from '../../src/domain/tipos';
import { desdeMadrid } from '../../src/lib/fechas';
import { Agenda } from '../../src/screens/Agenda';
import { Hoy } from '../../src/screens/Hoy';
import { VisitaDetalle } from '../../src/screens/VisitaDetalle';

const AHORA = desdeMadrid(2026, 11, 7, 10); // sábado 7 de noviembre de 2026, 10:00 en Madrid
const HOY = '2026-11-07';
const LUNES = '2026-11-09';
const MARTES_17 = '2026-11-17'; // día 11 de la franja: orientativo

// Una latitud por escenario (el proveedor recibe la ubicación redondeada a 2 decimales).
const LAT = { cespedRojo: 40.3, cespedAmbar: 40.31, piscina: 40.32, podaFito: 40.33, avisoNaranja: 40.34, calor: 40.35, tranquilo: 40.36 };
const LON = -3.7;

const CALMA: Partial<Omit<HoraClima, 'hora'>> = { prob_precipitacion: 0, precipitacion: 0, codigo_wmo: 0, temperatura: 18, viento: 5, rachas: 8 };
const enManana = (hora: string) => Number(hora.slice(11, 13)) >= 9 && Number(hora.slice(11, 13)) <= 13;

function escenario(u: Ubicacion, hora: string): Partial<Omit<HoraClima, 'hora'>> {
  switch (u.lat) {
    case LAT.cespedRojo: // criterio 14: 80 % y 3 mm/h en la franja
      return enManana(hora) ? { ...CALMA, prob_precipitacion: 80, precipitacion: 3, codigo_wmo: 63 } : CALMA;
    case LAT.cespedAmbar:
      return enManana(hora) ? { ...CALMA, prob_precipitacion: 45, codigo_wmo: 3 } : CALMA;
    case LAT.piscina: // criterio 15: lluvia ligera (1 mm/h)
      return enManana(hora) ? { ...CALMA, prob_precipitacion: 70, precipitacion: 1, codigo_wmo: 61 } : CALMA;
    case LAT.podaFito: // criterio 16: viento de 25 km/h
      return { ...CALMA, viento: 25, rachas: 30 };
    case LAT.calor:
      return enManana(hora) ? { ...CALMA, temperatura: 36 } : CALMA;
    default:
      return CALMA;
  }
}
// Criterio 17: aviso naranja en la zona del cliente el lunes.
const avisos = (u: Ubicacion): AvisoOficial[] => (u.lat === LAT.avisoNaranja ? [{ fecha: LUNES, nivel: 'naranja', fenomeno: 'lluvia' }] : []);

const BASE: DatosCliente = {
  nombre: 'Cliente', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: 'Calle Mayor 3', municipio: 'Madrid',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
  frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [],
  precio_habitual: null, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};
const nuevoCliente = async (nombre: string, lat: number | null, d: Partial<DatosCliente> = {}): Promise<Cliente> =>
  (await crearCliente({ ...BASE, nombre, lat, lon: lat === null ? null : LON, ...d })).cliente;
const nuevaVisita = async (cliente_id: string, d: Partial<DatosVisita> = {}) =>
  (
    await crearVisita({
      cliente_id, fecha: LUNES, hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['setos_poda'], descripcion: '',
      precio: 15000, incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0, ...d,
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
const agenda = () => montar(<Agenda onAbrirVisita={vi.fn()} onNuevaVisita={vi.fn()} onAlertas={vi.fn()} />);
const detalle = (visitaId: string) =>
  montar(<VisitaDetalle visitaId={visitaId} etiquetaVolver="Agenda" onVolver={vi.fn()} onEditar={vi.fn()} onHecho={vi.fn()} onAbrirCliente={vi.fn()} />);
const dias = () => within(screen.getByRole('radiogroup', { name: 'Días' })).getAllByRole('radio');
const tarjeta = (nombre: string) => screen.getByText(nombre).closest('li') as HTMLElement;
const linea = (el: HTMLElement) => el.querySelector('.linea-semaforo') as HTMLElement;

let fallar = false;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  fallar = false;
  configurarClima(
    crearServicioClima({ proveedor: crearProveedorSimulado({ escenario, avisos, fallar: () => fallar }), almacen: almacenEnMemoria(), enLinea: () => true }),
  );
});
afterEach(() => {
  configurarClima(null);
  vi.useRealTimers();
});

describe('Agenda · línea de semáforo por visita (§10.5.4) y criterios 14–17', () => {
  it('cada tarjeta lleva punto + estado en palabras según el tipo de trabajo y la ubicación del cliente', async () => {
    const cesped = await nuevoCliente('Fam. García', LAT.cespedRojo);
    const cespedAmbar = await nuevoCliente('Sra. Morales', LAT.cespedAmbar);
    const piscina = await nuevoCliente('Chalet Las Encinas', LAT.piscina);
    const poda = await nuevoCliente('Urb. El Olivar', LAT.podaFito);
    const aviso = await nuevoCliente('Los Pinos', LAT.avisoNaranja);
    const tranquilo = await nuevoCliente('Comunidad Sol', LAT.tranquilo);
    const sinDir = await nuevoCliente('Sin dirección', null, { direccion: '', municipio: '' });
    await nuevaVisita(cesped.id, { tipos_trabajo: ['corte_cesped'], hora_inicio: '09:00' });
    await nuevaVisita(cespedAmbar.id, { tipos_trabajo: ['corte_cesped'], hora_inicio: '10:00' });
    await nuevaVisita(piscina.id, { tipos_trabajo: ['piscina'], hora_inicio: '11:00' });
    await nuevaVisita(poda.id, { tipos_trabajo: ['setos_poda', 'fitosanitarios'], hora_inicio: '12:00' });
    await nuevaVisita(aviso.id, { tipos_trabajo: ['setos_poda'], hora_inicio: '13:00' });
    await nuevaVisita(tranquilo.id, { tipos_trabajo: ['setos_poda'], hora_inicio: '16:00' });
    await nuevaVisita(sinDir.id, { tipos_trabajo: ['setos_poda'], hora_inicio: '17:00' });

    const user = agenda();
    await user.click(await screen.findByRole('radio', { name: 'Lunes 9, con visitas' }));

    // Criterio 14: césped con 80 % y 3 mm/h → rojo con «Mejor mover».
    await waitFor(() => expect(linea(tarjeta('Fam. García')).getAttribute('data-nivel')).toBe('rojo'));
    expect(linea(tarjeta('Fam. García')).textContent).toContain('Mejor mover');
    // Ámbar: «Con cuidado» + detalle.
    expect(linea(tarjeta('Sra. Morales')).getAttribute('data-nivel')).toBe('ambar');
    expect(linea(tarjeta('Sra. Morales')).textContent).toMatch(/^Con cuidado · /);
    // Criterio 15: piscina con 1 mm/h → verde.
    expect(linea(tarjeta('Chalet Las Encinas')).getAttribute('data-nivel')).toBe('verde');
    expect(linea(tarjeta('Chalet Las Encinas')).textContent).toMatch(/^Se puede ir/);
    // Criterio 16: poda + fitosanitarios con viento de 25 km/h → rojo (gana el más restrictivo).
    expect(linea(tarjeta('Urb. El Olivar')).getAttribute('data-nivel')).toBe('rojo');
    expect(linea(tarjeta('Urb. El Olivar')).textContent).toContain('Mejor mover');
    // Criterio 17 (parte de semáforo): aviso naranja en la zona → rojo.
    expect(linea(tarjeta('Los Pinos')).getAttribute('data-nivel')).toBe('rojo');
    expect(linea(tarjeta('Los Pinos')).textContent).toContain('Mejor mover');
    // Verde con el tiempo y la temperatura.
    expect(linea(tarjeta('Comunidad Sol')).textContent).toBe('Se puede ir · Sol, 18°');
    // Sin coordenadas: gris «Sin previsión» con el motivo, de forma neutra.
    expect(linea(tarjeta('Sin dirección')).getAttribute('data-nivel')).toBe('gris');
    expect(linea(tarjeta('Sin dirección')).textContent).toBe('Sin previsión · Falta la dirección del cliente');

    // Nunca sólo color: todas las líneas tienen texto y el punto es decorativo.
    for (const li of within(screen.getByRole('list', { name: 'Visitas del día' })).getAllByRole('listitem')) {
      const l = linea(li);
      expect(l.textContent!.trim().length).toBeGreaterThan(5);
      expect(l.querySelector('.punto-semaforo')!.getAttribute('aria-hidden')).toBe('true');
    }

    // El lunes tiene visitas «Mejor mover»: contorno rojo y descripción accesible (§10.5.2).
    const lunes = screen.getByRole('radio', { name: 'Lunes 9, con visitas' });
    await waitFor(() => expect(lunes.className).toContain('con-rojo'));
    expect(document.getElementById(lunes.getAttribute('aria-describedby')!)!.textContent).toContain('alguna visita mejor mover');
    expect(screen.getByRole('radio', { name: 'Domingo 8' }).className).not.toContain('con-rojo');
  });

  it('las visitas hechas o canceladas no llevan semáforo', async () => {
    const c = await nuevoCliente('Fam. García', LAT.tranquilo);
    const v = await nuevaVisita(c.id, { fecha: HOY, hora_inicio: '08:00', precio: null });
    const { completarVisita } = await import('../../src/db/repo');
    await completarVisita(v.id, null);
    agenda();
    const li = await screen.findByText('Fam. García');
    expect(li.closest('li')!.querySelector('.linea-semaforo')).toBeNull();
  });
});

describe('Agenda · franja de 14 días con el tiempo (§10.5.2) y criterio 18', () => {
  it('cada día con icono, máxima y lluvia; días 8 a 14 atenuados con «ORIENTATIVO» y sin semáforo en sus visitas', async () => {
    const c = await nuevoCliente('Fam. García', LAT.cespedRojo);
    await nuevaVisita(c.id, { fecha: MARTES_17, tipos_trabajo: ['corte_cesped'] });
    const user = agenda();

    const ds = dias();
    expect(ds).toHaveLength(14);
    await waitFor(() => expect(ds[0].querySelector('[data-tiempo]')!.getAttribute('data-tiempo')).not.toBe('sin-datos'));
    for (const [i, d] of ds.entries()) {
      const t = d.querySelector('.tiempo-dia')!;
      expect(t.getAttribute('aria-hidden')).toBe('true');
      expect(t.querySelector('svg')).toBeTruthy();
      expect(t.querySelector('.max')!.textContent).toMatch(/^-?\d+°$/);
      expect(t.querySelector('.lluvia')!.textContent).toMatch(/^\d+%$/);
      // El tiempo llega a los lectores de pantalla por la descripción del botón.
      expect(document.getElementById(d.getAttribute('aria-describedby')!)!.textContent).toMatch(/máxima -?\d+°, lluvia \d+ %/);
      expect(d.className.includes('orientativo')).toBe(i >= 7);
      if (i >= 7) expect(d.getAttribute('aria-label')).toMatch(/orientativo$/);
    }
    // Separador «ORIENTATIVO» entre el día 7 y el 8, con «i» que explica.
    const separador = screen.getByText('ORIENTATIVO').closest('.franja-separador')!;
    expect(separador.previousElementSibling).toBe(ds[6]);
    expect(separador.nextElementSibling).toBe(ds[7]);
    const info = within(separador as HTMLElement).getByRole('button', { name: 'Por qué es orientativo' });
    expect(screen.queryByRole('note')).toBeNull();
    await user.click(info);
    expect(screen.getByRole('note').textContent).toBe('Más allá de una semana la previsión es poco fiable. Úsala para planificar, no para decidir.');
    expect(info.getAttribute('aria-expanded')).toBe('true');
    await user.click(info);
    expect(screen.queryByRole('note')).toBeNull();

    // Criterio 18: la visita del día 11 no muestra semáforo, sólo «Previsión orientativa», aunque llueva.
    await user.click(screen.getByRole('radio', { name: 'Martes 17, con visitas, orientativo' }));
    const l = linea(tarjeta('Fam. García'));
    await waitFor(() => expect(l.getAttribute('data-nivel')).toBe('orientativo'));
    expect(l.textContent).toBe('Previsión orientativa');
    expect(l.textContent).not.toMatch(/Se puede ir|Con cuidado|Mejor mover/);
    // Al elegir un día orientativo la explicación se ve sola.
    expect(screen.getByRole('note')).toBeTruthy();
  });

  it('sin servicio del tiempo la franja se pinta igual, sin inventar datos', async () => {
    fallar = true;
    agenda();
    const ds = dias();
    await waitFor(() => expect(document.getElementById(ds[0].getAttribute('aria-describedby')!)!.textContent).toBe('sin previsión'));
    expect(ds[0].querySelector('[data-tiempo]')!.getAttribute('data-tiempo')).toBe('sin-datos');
    expect(ds).toHaveLength(14);
  });
});

describe('Hoy · línea de semáforo en las visitas de hoy (§10.1.1.4)', () => {
  it('punto + texto en la tarjeta, sin tocar el botón «Hecho»', async () => {
    const c = await nuevoCliente('Fam. García', LAT.cespedRojo);
    const t = await nuevoCliente('Comunidad Sol', LAT.tranquilo);
    await nuevaVisita(c.id, { fecha: HOY, hora_inicio: '11:00', tipos_trabajo: ['corte_cesped'] });
    await nuevaVisita(t.id, { fecha: HOY, hora_inicio: '16:00', tipos_trabajo: ['setos_poda'] });
    montar(<Hoy onIr={vi.fn()} />);
    const garcia = (await screen.findByText('Fam. García')).closest('li')!;
    await waitFor(() => expect(linea(garcia).getAttribute('data-nivel')).toBe('rojo'));
    expect(linea(garcia).textContent).toContain('Mejor mover');
    const sol = screen.getByText('Comunidad Sol').closest('li')!;
    expect(linea(sol).textContent).toBe('Se puede ir · Sol, 18°');
    expect(within(garcia).getByRole('button', { name: 'Hecho: Fam. García, 11:00' })).toBeTruthy();
  });
});

describe('Detalle de visita · Tiempo de la visita (§10.6.3)', () => {
  it('semáforo grande con motivo, datos de la franja, consejo y hora de actualización', async () => {
    const c = await nuevoCliente('Fam. García', LAT.calor, { telefono: '+34611566779' });
    const v = await nuevaVisita(c.id, { tipos_trabajo: ['setos_poda'], hora_inicio: '10:00' });
    const user = detalle(v.id);
    const tiempo = await screen.findByRole('region', { name: 'Tiempo de la visita' });
    await waitFor(() => expect(tiempo.getAttribute('data-nivel')).toBe('ambar'));
    expect(within(tiempo).getByText('Con cuidado')).toBeTruthy();
    expect(within(tiempo).getByText('Temperatura').nextElementSibling!.textContent).toBe('36°');
    expect(within(tiempo).getByText('Lluvia').nextElementSibling!.textContent).toBe('0 %');
    expect(within(tiempo).getByText('Viento').nextElementSibling!.textContent).toBe('5 km/h · rachas 8');
    expect(within(tiempo).getByText(/^Consejo: /).textContent).toMatch(/primera hora/);
    expect(within(tiempo).getByText(/^Actualizado hoy a las 10:00/).textContent).toContain('Datos de prueba');

    // Las acciones existentes siguen igual (Hecho, Mover, Editar, Cómo llegar).
    expect(screen.getByRole('button', { name: 'Hecho' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cómo llegar' }).getAttribute('href')).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${LAT.calor},${LON}&travelmode=driving`,
    );
    await user.click(screen.getByRole('button', { name: 'Mover' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('«Sin previsión» neutro cuando falta la dirección o el servicio no responde', async () => {
    const sinDir = await nuevoCliente('Sin dirección', null, { direccion: '', municipio: '' });
    const v = await nuevaVisita(sinDir.id);
    detalle(v.id);
    const tiempo = await screen.findByRole('region', { name: 'Tiempo de la visita' });
    expect(tiempo.getAttribute('data-nivel')).toBe('gris');
    expect(within(tiempo).getByText('Sin previsión')).toBeTruthy();
    expect(within(tiempo).getByText('Falta la dirección del cliente')).toBeTruthy();
    expect(within(tiempo).queryByRole('list')).toBeNull();
    expect(tiempo.textContent).not.toMatch(/!/);
  });

  it('servicio caído sin nada guardado: gris con su motivo', async () => {
    fallar = true;
    const c = await nuevoCliente('Fam. García', LAT.tranquilo);
    const v = await nuevaVisita(c.id);
    detalle(v.id);
    const tiempo = await screen.findByRole('region', { name: 'Tiempo de la visita' });
    await waitFor(() => expect(tiempo.getAttribute('data-nivel')).toBe('gris'));
    expect(within(tiempo).getByText('Sin previsión')).toBeTruthy();
    expect(tiempo.querySelector('.motivo')!.textContent!.length).toBeGreaterThan(3);
    expect(within(tiempo).queryByText(/Consejo/)).toBeNull();
  });
});
