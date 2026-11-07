// Pruebas de aceptación de las alertas de clima (ola 7, frente B): criterios 17 y 19 a 23 de §18, una por criterio,
// de punta a punta con datos simulados: clima y avisos AEMET simulados (src/clima) → motor del frente A
// (src/dominio/alertas) → pantalla Alertas y campana (src/pantallas/alertas, src/componentes/alertas) → base local.
// Nada real: ni Open-Meteo, ni AEMET, ni WhatsApp (se comprueba el enlace wa.me que se abriría).
// Supuestos del texto de los criterios: tests/alertas/SUPUESTOS.md.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria, configurarClima, crearProveedorSimulado, crearServicioClima, type AvisoOficial, type HoraClima, type Ubicacion } from '../../src/clima';
import { CampanaAlertas } from '../../src/componentes/alertas/CampanaAlertas';
import { DeshacerProvider } from '../../src/components/Deshacer';
import { DatosProvider } from '../../src/db/datos';
import { db, reiniciarBase } from '../../src/db/db';
import { crearCliente, crearVisita, type DatosCliente } from '../../src/db/repo';
import type { Cliente, Visita } from '../../src/domain/tipos';
import {
  almacenAlertasLocal, diaConNumero, marcarNotificadas, mensajeMoverVisita, prepararClima, quienSoy, recalcularYGuardar, type AlertaClima, type EstadoAlertas,
} from '../../src/dominio/alertas';
import { desdeMadrid } from '../../src/lib/fechas';
import { Alertas } from '../../src/pantallas/alertas/Alertas';

const SABADO_7 = desdeMadrid(2026, 11, 7, 10); // sábado 7 de noviembre de 2026, 10:00 en Madrid
const MARTES_10 = desdeMadrid(2026, 11, 10, 10); // 2 días antes del jueves 12
const JUEVES_12 = '2026-11-12';
const LUNES_9 = '2026-11-09';
const U: Ubicacion = { lat: 40.42, lon: -3.7 };

// Tiempo tranquilo en todas las horas; lluvia sólo donde marque el escenario.
const CALMA: Omit<HoraClima, 'hora'> = { prob_precipitacion: 0, precipitacion: 0, codigo_wmo: 0, temperatura: 18, viento: 5, rachas: 8 };
let lluvia: { fecha: string; prob: number; mm: number } | null = null;
let avisos: AvisoOficial[] = [];
let lluviaOtra: string | null = null; // otro día con lluvia fuerte (para el calendario)
const escenario = (_u: Ubicacion, hora: string): Partial<Omit<HoraClima, 'hora'>> => {
  const h = Number(hora.slice(11, 13));
  if (lluvia && hora.startsWith(lluvia.fecha) && h >= 6 && h <= 14) return { ...CALMA, prob_precipitacion: lluvia.prob, precipitacion: lluvia.mm, codigo_wmo: 63 };
  if (lluviaOtra && hora.startsWith(lluviaOtra) && h >= 6 && h <= 14) return { ...CALMA, prob_precipitacion: 90, precipitacion: 4, codigo_wmo: 63 };
  return CALMA;
};

const BASE: DatosCliente = {
  nombre: 'Fam. García', tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Mayor 3', municipio: 'Madrid',
  lat: U.lat, lon: U.lon, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [], precio_habitual: null,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};

async function escena(d: { fecha?: string; tipos?: Visita['tipos_trabajo']; cliente?: Partial<DatosCliente> } = {}) {
  const { cliente } = await crearCliente({ ...BASE, ...d.cliente });
  const { visita } = await crearVisita({
    cliente_id: cliente.id, fecha: d.fecha ?? JUEVES_12, hora_inicio: '09:00', duracion: 120, tipos_trabajo: d.tipos ?? ['corte_cesped'], descripcion: '',
    precio: 15000, incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0,
  });
  return { cliente, visita };
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
const pantalla = (onAbrirVisita = vi.fn()) => montar(<Alertas etiquetaVolver="Agenda" onVolver={vi.fn()} onAbrirVisita={onAbrirVisita} />);
const seccion = (nombre: RegExp) => screen.getByRole('heading', { name: nombre }).closest('section') as HTMLElement;
const estado = async (): Promise<EstadoAlertas> => almacenAlertasLocal().leer();
const alertasDe = async (visitaId: string): Promise<AlertaClima[]> => (await estado()).alertas.filter((a) => a.entidad.id === visitaId);

/** Recalcula como lo haría el servidor (mismo motor y mismo clima simulado) y devuelve el resultado. */
async function recalcular(clientes: Cliente[]) {
  const yo = await quienSoy();
  const clima = await prepararClima(clientes);
  return recalcularYGuardar(almacenAlertasLocal(), { visitas: await db.visitas.toArray(), clientes, clima, usuario: yo.usuario, negocio: yo.negocio });
}

/**
 * Resumen diario de las 21:00 (§12.3) tal como lo armará el servidor con el motor: las alertas activas del canal
 * «resumen diario» que aún no se notificaron; al enviarlo se marcan notificadas. (El envío push queda fuera de alcance.)
 */
async function resumenDiario(ahora: Date): Promise<string[]> {
  const almacen = almacenAlertasLocal();
  const e = await almacen.leer();
  const toca = e.alertas.filter((a) => a.estado === 'activa' && !a.eliminado_en && a.canal === 'resumen_diario' && a.notificada_en === null);
  await almacen.guardar(marcarNotificadas(e, toca.map((a) => a.id), ahora));
  return toca.map((a) => a.texto_resumen);
}

let abrir: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SABADO_7);
  await reiniciarBase('fergo');
  lluvia = null;
  lluviaOtra = null;
  avisos = [];
  configurarClima(
    crearServicioClima({ proveedor: crearProveedorSimulado({ escenario, avisos: () => avisos }), almacen: almacenEnMemoria(), enLinea: () => true }),
  );
  abrir = vi.fn(() => null);
  vi.stubGlobal('open', abrir);
  window.open = abrir as unknown as typeof window.open;
});
afterEach(() => {
  configurarClima(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Criterio 17 · aviso AEMET naranja', () => {
  it('Dado un aviso AEMET naranja en la zona del cliente, la visita de ese día pasa a rojo y se genera CLIMA_AEMET', async () => {
    const { visita } = await escena({ fecha: LUNES_9, tipos: ['piscina'] }); // piscina con tiempo tranquilo: verde sin aviso
    avisos = [{ fecha: LUNES_9, nivel: 'naranja', fenomeno: 'lluvia' }];
    pantalla();

    const decidir = await waitFor(() => seccion(/para decidir/i));
    const tarjeta = within(decidir).getByRole('article', { name: 'Lunes 9 · Fam. García' });
    expect(texto(tarjeta)).toMatch('AVISO AEMET · EN 2 DÍAS');
    expect(texto(tarjeta)).toMatch('Naranja por lluvia');
    expect(tarjeta.dataset.nivel).toBe('ambar'); // aviso oficial: franja ámbar, con el nivel también en palabras

    // El motor guarda la del aviso oficial (y la del semáforo en rojo, otro asunto); en pantalla es UNA tarjeta.
    const alertas = await alertasDe(visita.id);
    const a = alertas.find((x) => x.tipo === 'CLIMA_AEMET')!;
    expect(a).toMatchObject({ tipo: 'CLIMA_AEMET', semaforo: 'rojo', estado_semaforo: 'Mejor mover', canal: 'inmediata', estado: 'activa' });
    expect(a.aviso).toMatchObject({ nivel: 'naranja', fenomeno: 'lluvia' });
    expect(alertas.filter((x) => x.estado === 'activa').every((x) => x.semaforo === 'rojo')).toBe(true);
    expect(within(decidir).getAllByRole('article')).toHaveLength(1);
  });

  it('la tarjeta del aviso ofrece «Ver opciones» y, al mover, no queda ninguna alerta activa de esa visita', async () => {
    const { visita } = await escena({ fecha: LUNES_9, tipos: ['piscina'] });
    avisos = [{ fecha: LUNES_9, nivel: 'naranja', fenomeno: 'lluvia' }];
    const user = pantalla();
    const tarjeta = await waitFor(() => within(seccion(/para decidir/i)).getByRole('article', { name: 'Lunes 9 · Fam. García' }));
    expect(within(tarjeta).queryByRole('radiogroup', { name: '¿A qué día?' })).toBeNull();
    await user.click(within(tarjeta).getByRole('button', { name: 'Ver opciones' }));
    await user.click(within(tarjeta).getByRole('button', { name: 'Mover y avisar por WhatsApp Business' }));
    await waitFor(() => expect(screen.getByText('Todo en orden. No hay nada que decidir esta semana.')).toBeTruthy());
    await waitFor(async () => expect((await alertasDe(visita.id)).filter((x) => x.estado === 'activa')).toEqual([]));
    expect(abrir).toHaveBeenCalledTimes(1);
  });
});

describe('Criterio 19 · pasa a rojo 5 días antes', () => {
  it('aparece en «Para tener en cuenta» y se menciona en el resumen de las 21:00 una sola vez', async () => {
    const { cliente } = await escena();
    lluvia = { fecha: JUEVES_12, prob: 70, mm: 3 }; // rojo para césped (≥ 60 % con ≥ 1 mm/h), < 80 %: aviso suave
    pantalla();

    const cuenta = await waitFor(() => seccion(/para tener en cuenta/i));
    expect(within(cuenta).getByText('Jueves 12 · Fam. García:')).toBeTruthy();
    expect(within(cuenta).getByText('Mejor mover')).toBeTruthy(); // nunca solo color
    expect(screen.queryByRole('heading', { name: /para decidir/i })).toBeNull();

    // Resumen de las 21:00: la menciona una vez…
    vi.setSystemTime(desdeMadrid(2026, 11, 7, 21));
    expect(await resumenDiario(new Date())).toEqual(['Posible lluvia el jueves en Fam. García.']);
    // …y al recalcular con lo mismo (otra vuelta del servidor, al día siguiente sigue a 4 días) no vuelve a salir.
    await recalcular([cliente]);
    expect(await resumenDiario(new Date())).toEqual([]);
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 21));
    await recalcular([cliente]);
    expect(await resumenDiario(new Date())).toEqual([]);
  });
});

describe('Criterio 20 · sigue en rojo 2 días antes', () => {
  it('pasa a «Para decidir» con propuesta de días y horas', async () => {
    const { cliente, visita } = await escena();
    lluvia = { fecha: JUEVES_12, prob: 70, mm: 3 };
    await recalcular([cliente]);
    const [info] = await alertasDe(visita.id);
    expect(info.tipo).toBe('CLIMA_INFO');

    vi.setSystemTime(MARTES_10);
    pantalla();
    const decidir = await waitFor(() => seccion(/para decidir/i));
    const tarjeta = within(decidir).getByRole('article', { name: 'Jueves 12 · Fam. García' });
    expect(texto(tarjeta)).toMatch('MEJOR MOVER · EN 2 DÍAS');
    expect(tarjeta.dataset.nivel).toBe('rojo');

    const dias = within(within(tarjeta).getByRole('radiogroup', { name: '¿A qué día?' })).getAllByRole('radio');
    expect(dias).toHaveLength(4); // 3 propuestos + «Otro»
    expect(texto(dias[0])).toMatch(/^Sugerido/);
    expect(dias[0].getAttribute('aria-checked')).toBe('true');
    expect(texto(dias[3])).toMatch('Otro');
    const horas = within(within(tarjeta).getByRole('radiogroup', { name: '¿A qué hora?' })).getAllByRole('radio');
    expect(horas.length).toBeGreaterThanOrEqual(2);
    expect(texto(horas[0])).toMatch('09:00'); // la hora original primero, si está libre
    expect(texto(horas.at(-1))).toMatch('Otra');
    expect(texto(tarjeta)).toMatch('Solo se ofrecen huecos libres en tu agenda.');

    // Es la misma alerta que sube de escalón (no una nueva) y ya no está en «Para tener en cuenta».
    const [decision] = await alertasDe(visita.id);
    expect(decision).toMatchObject({ id: info.id, tipo: 'CLIMA_DECIDIR', seccion: 'para_decidir' });
    expect(screen.queryByRole('heading', { name: /para tener en cuenta/i })).toBeNull();
  });
});

async function enDecision() {
  const e = await escena();
  lluvia = { fecha: JUEVES_12, prob: 70, mm: 3 };
  vi.setSystemTime(MARTES_10);
  const user = pantalla();
  const tarjeta = await waitFor(() => within(seccion(/para decidir/i)).getByRole('article', { name: 'Jueves 12 · Fam. García' }));
  return { ...e, user, tarjeta };
}
const mensaje = (t: HTMLElement) => within(t).getByRole('textbox', { name: /mensaje para el cliente/i }) as HTMLTextAreaElement;

describe('Criterio 21 · el mensaje sigue al día y la hora', () => {
  it('al elegir otro día y otra hora, el mensaje para el cliente se reescribe con esos valores', async () => {
    const { user, tarjeta } = await enDecision();
    const dias = within(within(tarjeta).getByRole('radiogroup', { name: '¿A qué día?' })).getAllByRole('radio');
    const primero = dias[0].textContent!;
    expect(mensaje(tarjeta).value).toMatch(/^Hola, soy Felipe de FERGO\. Por la lluvia prevista el jueves 12, ¿te va bien que pase el /);

    await user.click(dias[1]);
    const horas = () => within(within(tarjeta).getByRole('radiogroup', { name: '¿A qué hora?' })).getAllByRole('radio');
    const otraHora = horas().find((h) => h.textContent !== '09:00' && h.textContent !== 'Otra')!;
    await user.click(otraHora);
    const fechaNueva = dias[1].textContent!;

    const esperado = mensajeMoverVisita({ fechaOriginal: JUEVES_12, fechaNueva: fechaDeTexto(fechaNueva), horaNueva: otraHora.textContent!, causa: 'lluvia' });
    expect(mensaje(tarjeta).value).toBe(esperado);
    expect(mensaje(tarjeta).value).toContain(`el ${textoDia(fechaNueva).toLowerCase()} a las ${otraHora.textContent}`);
    expect(primero).not.toBe(dias[1].textContent);

    // Editado a mano: ya no se reescribe; «Restaurar» vuelve al automático.
    await user.clear(mensaje(tarjeta));
    await user.type(mensaje(tarjeta), 'Hola, ¿te va bien otro día?');
    await user.click(horas()[0]);
    expect(mensaje(tarjeta).value).toBe('Hola, ¿te va bien otro día?');
    expect(within(tarjeta).getByText('Mensaje editado ·')).toBeTruthy();
    await user.click(within(tarjeta).getByRole('button', { name: 'Restaurar' }));
    expect(mensaje(tarjeta).value).toContain(`el ${textoDia(fechaNueva).toLowerCase()} a las ${horas()[0].textContent}`);
  });
});

describe('Criterio 22 · Mover y avisar por WhatsApp Business', () => {
  it('la visita se mueve, la alerta se resuelve y se abre WhatsApp en el chat del cliente con el mensaje escrito', async () => {
    const { user, tarjeta, visita } = await enDecision();
    const dia = within(within(tarjeta).getByRole('radiogroup', { name: '¿A qué día?' })).getAllByRole('radio')[0];
    const fecha = fechaDeTexto(dia.textContent!);
    const hora = within(within(tarjeta).getByRole('radiogroup', { name: '¿A qué hora?' })).getAllByRole('radio').find((h) => h.getAttribute('aria-checked') === 'true')!.textContent!;
    const textoMensaje = mensaje(tarjeta).value;

    await user.click(within(tarjeta).getByRole('button', { name: 'Mover y avisar por WhatsApp Business' }));

    // WhatsApp: enlace wa.me con el teléfono sin «+» y el mensaje codificado. No se envía nada.
    await waitFor(() => expect(abrir).toHaveBeenCalledTimes(1));
    const url = new URL(abrir.mock.calls[0][0] as string);
    expect(`${url.origin}${url.pathname}`).toBe('https://wa.me/34611566779');
    expect(url.searchParams.get('text')).toBe(textoMensaje);

    // Visita movida con su histórico y motivo clima.
    const movida = (await db.visitas.get(visita.id))!;
    expect(movida).toMatchObject({ fecha, hora_inicio: hora, motivo_reprogramacion: 'clima' });
    expect(movida.reprogramada_desde).toMatch(/^2026-11-12/);
    // Alerta resuelta: sale de la pantalla y no vuelve al recalcular.
    const [a] = await alertasDe(visita.id);
    expect(a.estado).toBe('resuelta');
    await waitFor(() => expect(screen.getByText('Todo en orden. No hay nada que decidir esta semana.')).toBeTruthy());
    expect(texto(screen.getByRole('status'))).toMatch(`Visita movida al ${textoDia(dia.textContent!).toLowerCase()}, ${hora}`);
    expect((await alertasDe(visita.id)).filter((x) => x.estado === 'activa')).toEqual([]);

    // Deshacer (8 s): la visita vuelve a su día y hora y la alerta se reabre.
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await db.visitas.get(visita.id))!.fecha).toBe(JUEVES_12));
    await waitFor(async () => expect((await alertasDe(visita.id))[0].estado).toBe('activa'));
  });

  it('cliente sin teléfono: el botón pasa a «Mover visita» y pide añadir el teléfono; no abre WhatsApp', async () => {
    await escena({ cliente: { telefono: null } });
    lluvia = { fecha: JUEVES_12, prob: 70, mm: 3 };
    vi.setSystemTime(MARTES_10);
    const user = pantalla();
    const tarjeta = await waitFor(() => within(seccion(/para decidir/i)).getByRole('article', { name: 'Jueves 12 · Fam. García' }));
    expect(within(tarjeta).queryByRole('button', { name: 'Mover y avisar por WhatsApp Business' })).toBeNull();
    expect(texto(tarjeta)).toMatch('Añade su teléfono para avisarle.');
    await user.click(within(tarjeta).getByRole('button', { name: 'Mover visita' }));
    await waitFor(() => expect(texto(screen.getByRole('status'))).toMatch(/^Visita movida al/));
    expect(abrir).not.toHaveBeenCalled();
  });
});

describe('Criterio 23 · Mantener la visita', () => {
  it('no vuelve a notificarse salvo que empeore o aparezca aviso oficial', async () => {
    const { user, tarjeta, visita, cliente } = await enDecision();
    await resumenDiario(new Date()); // ya avisada una vez

    await user.click(within(tarjeta).getByRole('button', { name: 'Mantener la visita' }));
    await waitFor(() => expect(texto(screen.getByRole('status'))).toMatch('Mantienes la visita del jueves 12'));
    await waitFor(() => expect(screen.getByText('Todo en orden. No hay nada que decidir esta semana.')).toBeTruthy());
    const [a] = await alertasDe(visita.id);
    expect(a.estado).toBe('descartada');
    expect((await estado()).descartes.map((d) => d.clave_asunto)).toEqual([a.clave_asunto]);

    // Mismo tiempo, más vueltas del motor y del resumen: nada nuevo.
    for (let i = 0; i < 3; i++) {
      const r = await recalcular([cliente]);
      expect(r.nuevas).toEqual([]);
      expect(r.pendientes_de_aviso).toEqual([]);
    }
    vi.setSystemTime(desdeMadrid(2026, 11, 10, 21));
    expect(await resumenDiario(new Date())).toEqual([]);
    expect((await alertasDe(visita.id)).filter((x) => x.estado === 'activa')).toEqual([]);

    // Aparece un aviso oficial: sí vuelve a avisar (es otro asunto).
    avisos = [{ fecha: JUEVES_12, nivel: 'naranja', fenomeno: 'lluvia' }];
    configurarClima(crearServicioClima({ proveedor: crearProveedorSimulado({ escenario, avisos: () => avisos }), almacen: almacenEnMemoria(), enLinea: () => true }));
    const r = await recalcular([cliente]);
    expect(r.nuevas.map((x) => [x.tipo, x.canal])).toEqual([['CLIMA_AEMET', 'inmediata']]);
    expect(r.pendientes_de_aviso.map((x) => x.tipo)).toEqual(['CLIMA_AEMET']);
  });

  it('Deshacer «Mantener» vuelve a dejar la alerta para decidir', async () => {
    const { user, tarjeta, visita } = await enDecision();
    await user.click(within(tarjeta).getByRole('button', { name: 'Mantener la visita' }));
    await waitFor(() => expect(texto(screen.getByRole('status'))).toMatch('Mantienes la visita del jueves 12'));
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await alertasDe(visita.id))[0].estado).toBe('activa'));
    expect(await waitFor(() => within(seccion(/para decidir/i)).getByRole('article', { name: 'Jueves 12 · Fam. García' }))).toBeTruthy();
  });
});

describe('«Otro» día: calendario con el semáforo de cada día (decisión de Ariel, 2026-11-07)', () => {
  it('muestra los días con color y estado en palabras, no deja elegir el día de la visita y al elegir uno se reescriben horas y mensaje', async () => {
    lluviaOtra = '2026-11-13'; // viernes 13: lluvia fuerte → «Mejor mover» para el césped
    const { user, tarjeta } = await enDecision();
    const radiosDia = within(tarjeta).getByRole('radiogroup', { name: '¿A qué día?' });
    await user.click(within(radiosDia).getByRole('radio', { name: 'Otro' }));

    const cal = within(tarjeta).getByRole('radiogroup', { name: 'Elige otro día' });
    const dias = within(cal).getAllByRole('radio');
    expect(dias).toHaveLength(13); // de mañana (miércoles 11) a 13 días vista
    const dia = (f: string) => dias.find((d) => d.dataset.fecha === f)!;

    expect(dia('2026-11-12').getAttribute('aria-label')).toBe('Jue 12: Día de la visita');
    expect((dia('2026-11-12') as HTMLButtonElement).disabled).toBe(true);
    expect(dia('2026-11-13').dataset.nivel).toBe('rojo');
    expect(texto(dia('2026-11-13'))).toMatch('Mejor mover');
    expect(dia('2026-11-14').dataset.nivel).toBe('verde');
    expect(texto(dia('2026-11-14'))).toMatch('Se puede ir');
    expect(dia('2026-11-19').dataset.nivel).toBe('orientativo'); // a más de 7 días: sin semáforo
    expect(texto(dia('2026-11-19'))).toMatch('Previsión orientativa');
    // Cada día lleva su estado en palabras, no solo el color.
    for (const d of dias) expect(d.querySelector('.estado')?.textContent?.trim()).toBeTruthy();

    await user.click(dia('2026-11-14'));
    expect(dia('2026-11-14').getAttribute('aria-checked')).toBe('true');
    const horas = within(within(tarjeta).getByRole('radiogroup', { name: '¿A qué hora?' })).getAllByRole('radio');
    expect(texto(horas[0])).toBe('09:00');
    expect(mensaje(tarjeta).value).toContain('el sábado 14 a las 09:00');
  });
});

describe('Semáforo rojo y aviso oficial a la vez (decisión de Ariel, 2026-11-07)', () => {
  it('una sola tarjeta con los dos motivos y la campana cuenta 1', async () => {
    await escena(); // césped el jueves 12
    lluvia = { fecha: JUEVES_12, prob: 85, mm: 3 };
    avisos = [{ fecha: JUEVES_12, nivel: 'naranja', fenomeno: 'viento' }];
    vi.setSystemTime(MARTES_10);
    montar(
      <>
        <CampanaAlertas onClick={vi.fn()} />
        <Alertas etiquetaVolver="Hoy" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />
      </>,
    );
    const decidir = await waitFor(() => seccion(/para decidir/i));
    await waitFor(() => expect(within(decidir).getAllByRole('article')).toHaveLength(1));
    const t = within(decidir).getByRole('article', { name: 'Jueves 12 · Fam. García' });
    expect(texto(t)).toMatch('Aviso naranja por viento');
    await waitFor(() => expect(texto(t)).toMatch(/Mejor mover: Lluvia/));
    expect(screen.getByRole('button', { name: 'Alertas' }).dataset.insignia).toBe('1');
  });
});

describe('Campana con insignia (§10.1.1)', () => {
  it('cuenta las alertas activas que requieren decisión, no las informativas, y desaparece con 0', async () => {
    const { cliente } = await escena(); // jueves 12: rojo
    const otro = await crearCliente({ ...BASE, nombre: 'Sra. Morales', lat: 40.5, lon: -3.6 });
    await crearVisita({ cliente_id: otro.cliente.id, fecha: '2026-11-14', hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: null, incluida_en_abono: true, requiere_vehiculo: false, ayudantes: 0 });
    lluvia = { fecha: JUEVES_12, prob: 70, mm: 3 };
    // Sábado 7: el jueves está a 5 días → informativa: sin insignia.
    const user = montar(<CampanaAlertas onClick={vi.fn()} />);
    const campana = screen.getByRole('button', { name: 'Alertas' });
    await waitFor(async () => expect((await estado()).alertas).toHaveLength(1));
    expect(campana.dataset.insignia).toBe('0');
    expect(campana.getAttribute('aria-describedby')).toBeNull();
    void user;
    void cliente;
  });

  it('con una alerta para decidir muestra 1 (y lo dice en palabras); al mantenerla vuelve a 0', async () => {
    const { visita } = await escena();
    lluvia = { fecha: JUEVES_12, prob: 70, mm: 3 };
    vi.setSystemTime(MARTES_10);
    const user = montar(
      <>
        <CampanaAlertas onClick={vi.fn()} />
        <Alertas etiquetaVolver="Hoy" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />
      </>,
    );
    const campana = screen.getByRole('button', { name: 'Alertas' });
    await waitFor(() => expect(campana.dataset.insignia).toBe('1'));
    expect(texto(campana)).toMatch('1');
    expect(document.getElementById(campana.getAttribute('aria-describedby')!)?.textContent).toBe('11 para decidir'); // «1» visible + «1 para decidir» para lectores

    const tarjeta = await waitFor(() => within(seccion(/para decidir/i)).getByRole('article', { name: 'Jueves 12 · Fam. García' }));
    await user.click(within(tarjeta).getByRole('button', { name: 'Mantener la visita' }));
    await waitFor(() => expect(campana.dataset.insignia).toBe('0'));
    expect((await alertasDe(visita.id))[0].estado).toBe('descartada');
  });
});

describe('App instalada sin proveedor del tiempo', () => {
  it('no inventa el tiempo: sin previsión no hay alertas y se ve el estado vacío', async () => {
    configurarClima(crearServicioClima({ proveedor: null, almacen: almacenEnMemoria(), enLinea: () => true }));
    await escena();
    vi.setSystemTime(MARTES_10);
    pantalla();
    expect(await screen.findByText('Todo en orden. No hay nada que decidir esta semana.')).toBeTruthy();
    expect(screen.getByText('Un solo aviso al día, a las 21:00, con todo junto.')).toBeTruthy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect((await estado()).alertas).toEqual([]);
  });
});

const texto = (el: Element | null | undefined) => el?.textContent ?? '';

// «Viernes 13» (texto del radio, tras «Sugerido» y antes del tiempo) → '2026-11-13'.
function textoDia(texto: string): string {
  const m = texto.replace(/^Sugerido/, '').match(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo) \d{1,2}/);
  if (!m) throw new Error(`Día no reconocido: ${texto}`);
  return m[0];
}
function fechaDeTexto(texto: string): string {
  const t = textoDia(texto);
  for (let d = 8; d <= 30; d++) {
    const f = `2026-11-${String(d).padStart(2, '0')}`;
    if (diaConNumero(f) === t) return f;
  }
  throw new Error(`Fecha no encontrada: ${texto}`);
}
