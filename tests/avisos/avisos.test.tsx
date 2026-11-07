// Avisos en modo simulado (ola 9): envío registrado con la base local, Ajustes › Avisos y horarios, criterios 30 y 31
// de §18 (guía de instalación y permiso de avisos con «Probar notificación»), enlaces profundos y banda de Hoy.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { DeshacerProvider } from '../../src/components/Deshacer';
import { DatosProvider } from '../../src/db/datos';
import { reiniciarBase } from '../../src/db/db';
import { crearCliente, crearVisita, leerAjuste, usarComo, type DatosCliente } from '../../src/db/repo';
import { AjustesAvisos } from '../../src/features/avisos/AjustesAvisos';
import { CLAVE_CONFIG_AVISOS } from '../../src/features/avisos/config';
import { ejecutarPlanificador, leerRegistroAvisos, registrarAvisoSimulado } from '../../src/features/avisos/envio';
import { InstalacionAvisos } from '../../src/features/avisos/InstalacionAvisos';
import { PRUEBA } from '../../src/features/avisos/permisos';
import { desdeMadrid } from '../../src/lib/fechas';

const BASE: DatosCliente = {
  nombre: 'Fam. García', tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Mayor 3', municipio: 'Madrid',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [], precio_habitual: null,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};
async function visitaManana() {
  const { cliente } = await crearCliente(BASE);
  await crearVisita({
    cliente_id: cliente.id, fecha: '2026-11-08', hora_inicio: '10:00', duracion: 120, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: 6000,
    incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0,
  });
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

/** Simula la API de notificaciones del navegador. */
function notificaciones(inicial: NotificationPermission) {
  const estado = { permiso: inicial };
  const requestPermission = vi.fn(async () => {
    estado.permiso = 'granted';
    return 'granted' as NotificationPermission;
  });
  const N = Object.assign(vi.fn(), { requestPermission });
  Object.defineProperty(N, 'permission', { get: () => estado.permiso, configurable: true });
  vi.stubGlobal('Notification', N);
  Object.defineProperty(window, 'Notification', { value: N, configurable: true, writable: true });
  const showNotification = vi.fn(async () => {});
  Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => ({ showNotification }) }, configurable: true });
  return { requestPermission, showNotification, estado };
}
function instalada(si: boolean) {
  window.matchMedia = vi.fn((q: string) => ({ matches: si && q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(desdeMadrid(2026, 11, 7, 10));
  await reiniciarBase('fergo');
  window.localStorage.setItem('fergo.guia.vista', '1');
  instalada(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('Envío simulado con la base local', () => {
  it('a las 21:00 registra un único resumen (sin enviar nada real); no se repite; Pablo no recibe avisos', async () => {
    await visitaManana();
    vi.setSystemTime(desdeMadrid(2026, 11, 7, 21));
    const enviados = await ejecutarPlanificador();
    expect(enviados.map((n) => [n.tipo, n.titulo])).toEqual([['RESUMEN_DIARIO', 'Mañana: 1 visita']]);
    const r = await leerRegistroAvisos();
    // La víspera también va la ropa (alertas de preparación de la ola 8), dentro del mismo resumen.
    expect(r.enviados[0]).toMatchObject({ titulo: 'Mañana: 1 visita', cuerpo: 'Mañana vas tú solo: prepara polo, pantalón, guantes, botas y lo demás.', enlace: '/?ir=alertas' });
    expect(await ejecutarPlanificador(new Date(Date.now() + 5 * 60_000))).toEqual([]);
    expect((await leerRegistroAvisos()).enviados).toHaveLength(1);

    await usarComo('colaborador');
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 21));
    expect(await ejecutarPlanificador()).toEqual([]);
  });

  it('criterio 28: sin visitas mañana ni alertas activas, no se registra ningún resumen', async () => {
    vi.setSystemTime(desdeMadrid(2026, 11, 7, 21));
    expect(await ejecutarPlanificador()).toEqual([]);
    expect((await leerRegistroAvisos()).enviados).toEqual([]);
  });
});

describe('Ajustes › Avisos y horarios (§10.10.5)', () => {
  it('cambia el recordatorio, la hora del resumen y el silencio con Deshacer; lista los avisos simulados con su enlace', async () => {
    await registrarAvisoSimulado({ clave: 'x', canal: 'resumen', tipo: 'RESUMEN_DIARIO', titulo: 'Mañana: 2 visitas', cuerpo: 'Revisa la agenda.', enlace: '/?ir=alertas', acciones: [] });
    const onAbrir = vi.fn();
    const user = montar(<AjustesAvisos etiquetaVolver="Ajustes" onVolver={vi.fn()} onAbrir={onAbrir} />);
    const recordatorio = await screen.findByRole('radiogroup', { name: 'Recordatorio' });
    expect(within(recordatorio).getByRole('radio', { name: '60 min' }).getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect((within(recordatorio).getByRole('radio', { name: '30 min' }) as HTMLButtonElement).disabled).toBe(false));

    await user.click(within(recordatorio).getByRole('radio', { name: '30 min' }));
    await waitFor(async () => expect((await leerAjuste<{ recordatorioVisita: number }>(CLAVE_CONFIG_AVISOS, { recordatorioVisita: 0 })).recordatorioVisita).toBe(30));
    expect((await screen.findByRole('status')).textContent).toContain('Ajuste guardado');
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await leerAjuste<{ recordatorioVisita: number }>(CLAVE_CONFIG_AVISOS, { recordatorioVisita: 0 })).recordatorioVisita).toBe(60));

    const hora = screen.getByLabelText('Hora del resumen') as HTMLInputElement;
    expect(hora.value).toBe('21:00');
    // El selector de hora del móvil entrega la hora completa de una vez.
    fireEvent.change(hora, { target: { value: '20:30' } });
    await waitFor(async () => expect((await leerAjuste<{ horaResumen: string }>(CLAVE_CONFIG_AVISOS, { horaResumen: '' })).horaResumen).toBe('20:30'));
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('22:00');
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('08:00');

    await user.click(screen.getByRole('button', { name: /Mañana: 2 visitas/ }));
    expect(onAbrir).toHaveBeenCalledWith('/?ir=alertas');
  });
});

describe('Criterio 30 · guía de instalación', () => {
  it('abierta en el navegador sin instalar, la app muestra la guía de instalación', async () => {
    instalada(false);
    window.localStorage.removeItem('fergo.guia.vista');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Instala FERGO' })).toBeTruthy();
  });
  it('instalada, no la muestra', async () => {
    window.localStorage.removeItem('fergo.guia.vista');
    render(<App />);
    expect(await screen.findByTestId('en-caja')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Instala FERGO' })).toBeNull();
  });
});

describe('Criterio 31 · permiso de avisos tras la pantalla explicativa y «Probar notificación»', () => {
  it('explica antes del diálogo del sistema, lo pide solo al tocar y la prueba se muestra y se anota', async () => {
    const n = notificaciones('default');
    const user = montar(<InstalacionAvisos etiquetaVolver="Ajustes" onVolver={vi.fn()} onVerGuia={vi.fn()} />);
    expect(screen.getByTestId('estado-permiso').textContent).toBe('Sin activar');
    expect(screen.getByText('Te aviso del tiempo, de la furgoneta y de lo que tienes que comprar. Como mucho un resumen al día.')).toBeTruthy();
    expect(n.requestPermission).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Activar los avisos' }));
    expect(n.requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('estado-permiso').textContent).toBe('Activados'));
    // El paso «Activa los avisos» de la bienvenida se completa solo.
    await waitFor(async () => expect((await leerAjuste<Record<string, boolean>>('pasos_bienvenida', {})).avisos).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Probar notificación' }));
    await waitFor(() => expect(n.showNotification).toHaveBeenCalledTimes(1));
    expect(n.showNotification).toHaveBeenCalledWith(PRUEBA.titulo, expect.objectContaining({ body: PRUEBA.cuerpo, data: { url: '/?ir=ajustes&a=instalacion' } }));
    expect((await screen.findByRole('status')).textContent).toBe('Notificación de prueba enviada.');
    expect((await leerRegistroAvisos()).enviados[0]).toMatchObject({ tipo: 'PRUEBA', titulo: PRUEBA.titulo });
  });

  it('si el permiso está bloqueado, Hoy muestra la banda «Activa los avisos…» que lleva a esta pantalla', async () => {
    notificaciones('denied');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Activa los avisos para no perderte nada' }));
    expect(await screen.findByRole('heading', { name: 'Instalación y avisos' })).toBeTruthy();
    expect(screen.getByTestId('estado-permiso').textContent).toBe('Bloqueados en este móvil');
  });
});

describe('Enlaces profundos al abrir la app (§12.1.5)', () => {
  it('/?ir=ajustes&a=avisos abre Avisos y horarios y limpia la URL', async () => {
    window.history.replaceState(null, '', '/?ir=ajustes&a=avisos');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Avisos y horarios' })).toBeTruthy();
    expect(window.location.search).toBe('');
  });
  it('/?ir=alertas abre Alertas', async () => {
    window.history.replaceState(null, '', '/?ir=alertas');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Alertas' })).toBeTruthy();
  });
});
