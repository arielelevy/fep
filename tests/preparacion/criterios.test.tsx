// Criterios 24 a 27 de §18 (alertas de preparación, ola 8, encargo B), uno por bloque `describe`. No se envía ningún
// aviso real: se comprueba lo que el proceso del servidor enviaría (planificador.ts) y lo que muestra la pantalla Alertas.
// Supuestos en tests/preparacion/SUPUESTOS.md.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, reiniciarBase } from '../../src/db/db';
import { guardarAvisoFurgo } from '../../src/features/ajustes/proveedores/datos';
import { leerEstado, marcarAvisados } from '../../src/features/alertas/preparacion/estado';
import type { Preparacion } from '../../src/features/preparar/modelo';
import { leerAjuste } from '../../src/db/repo';
import { avisosInmediatos, lineasResumen } from '../../src/features/alertas/preparacion/planificador';
import { guardarRecordatorio, guardarReserva, leerReservas, marcarMaterial } from '../../src/features/preparar/operaciones';
import { PrepararTrabajo } from '../../src/features/preparar/PrepararTrabajo';
import { desdeMadrid } from '../../src/lib/fechas';
import { Alertas } from '../../src/pantallas/alertas/Alertas';
import { activos, AHORA, alertasAhora, DOMINGO, JUEVES, MARTES, MIERCOLES, montar, texto, visita } from './escena';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
});
afterEach(() => vi.useRealTimers());

const alertas = (onPreparar = vi.fn()) => montar(<Alertas etiquetaVolver="Agenda" onVolver={vi.fn()} onAbrirVisita={vi.fn()} onPreparar={onPreparar} />);
const preparaciones = () => leerAjuste<Record<string, Preparacion>>('preparaciones', {});
const tarjeta = (tipo: string) => document.querySelector(`[data-alerta-prep="${tipo}"]`) as HTMLElement | null;

describe('Criterio 24 · furgoneta sin reservar a 4 días → «Alquila la furgoneta» y resumen diario', () => {
  it('aparece la tarjeta en «Preparar trabajos» con «Ya la reservé»', async () => {
    await visita({ fecha: MIERCOLES, furgo: true, tipos: ['plantacion'] });
    const onPreparar = vi.fn();
    const { user } = alertas(onPreparar);
    await waitFor(() => expect(tarjeta('FURGO_RESERVAR')).not.toBeNull());
    const t = tarjeta('FURGO_RESERVAR')!;
    expect(texto(t)).toContain('ALQUILA LA FURGONETA · EN 4 DÍAS');
    expect(texto(t)).toContain('Miércoles 11 · Sra. Morales');
    expect(texto(t)).toContain('Plantación. Aún no la tienes reservada.');
    expect(screen.getByRole('heading', { name: 'Preparar trabajos' })).toBeTruthy();
    expect(screen.queryByText('Todo en orden. No hay nada que decidir esta semana.')).toBeNull();
    // Tarjeta del día (franja verde) con el chip «Reservar furgo».
    const dia = document.querySelector(`[data-tarjeta-dia="${MIERCOLES}"]`)!;
    expect(texto(dia)).toContain('EN 4 DÍAS · 0 DE 2 LISTOS');
    expect(texto(dia)).toContain('Reservar furgo');
    // «Ya la reservé» abre el formulario aquí mismo (§10.7 → §10.8.1), sin salir de Alertas.
    await user.click(within(t).getByRole('button', { name: 'Ya la reservé' }));
    expect(onPreparar).not.toHaveBeenCalled();
    const hoja = screen.getByRole('dialog', { name: 'Ya la reservé' });
    expect((within(hoja).getByLabelText('Recogida') as HTMLInputElement).value).toBe(`${MARTES}T19:00`);
    expect((within(hoja).getByLabelText('Devolución') as HTMLInputElement).value).toBe(`${MIERCOLES}T20:00`);
    await user.type(within(hoja).getByLabelText('¿A quién se la alquilas?'), 'Alquileres Sur');
    await user.type(within(hoja).getByLabelText('Precio del alquiler (€)'), '90');
    await user.type(within(hoja).getByLabelText('Fianza prevista (€)'), '150');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar reserva' }));
    await waitFor(() => expect(tarjeta('FURGO_RESERVAR')).toBeNull());
    expect(await screen.findByText('Furgoneta reservada')).toBeTruthy();
    const [reserva] = await leerReservas();
    expect(reserva).toMatchObject({ fecha: MIERCOLES, proveedor_nombre: 'Alquileres Sur', precio: 9000, fianza_prevista: 15000, estado: 'reservada' });
    // La tarjeta del día pasa a «Furgo reservada».
    await waitFor(() => expect(texto(document.querySelector(`[data-tarjeta-dia="${MIERCOLES}"]`))).toContain('Furgo reservada'));
  });

  it('va en el resumen diario una vez por escalón (4, 3 y 1 día) y la víspera también como aviso inmediato a las 10:00', async () => {
    await visita({ fecha: MIERCOLES, furgo: true });
    let r = await alertasAhora();
    const lineas = lineasResumen(r.alertas, {});
    expect(lineas.map((l) => l.texto)).toContain('Alquila la furgoneta para el miércoles 11 (Sra. Morales).');
    const furgo = r.alertas.find((a) => a.tipo === 'FURGO_RESERVAR')!;
    expect(furgo.nivel).toBe('decision');
    await marcarAvisados(lineas.map((l) => l.clave));
    expect(lineasResumen((await alertasAhora()).alertas, (await leerEstado()).avisados)).toHaveLength(0);

    // Domingo (3 días): nuevo escalón → vuelve al resumen.
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 10));
    r = await alertasAhora();
    const avisados = (await leerEstado()).avisados;
    expect(lineasResumen(r.alertas, avisados).map((l) => l.texto)).toContain('Alquila la furgoneta para el miércoles 11 (Sra. Morales).');

    // Martes (1 día): urgente; aviso inmediato desde las 10:00, no antes.
    vi.setSystemTime(desdeMadrid(2026, 11, 10, 9, 30));
    r = await alertasAhora();
    expect(r.alertas.find((a) => a.tipo === 'FURGO_RESERVAR')!.nivel).toBe('urgente');
    expect(avisosInmediatos(r.alertas, {}, new Date())).toHaveLength(0);
    vi.setSystemTime(desdeMadrid(2026, 11, 10, 10));
    expect(avisosInmediatos((await alertasAhora()).alertas, {}, new Date()).map((a) => a.texto)).toEqual(['Alquila la furgoneta para el miércoles 11 (Sra. Morales).']);
  });

  it('a 5 días no avisa con la antelación por defecto (4) y sí si se configura a 5', async () => {
    await visita({ fecha: JUEVES, furgo: true });
    expect((await alertasAhora()).alertas.some((a) => a.tipo === 'FURGO_RESERVAR')).toBe(false);
    await guardarAvisoFurgo(5);
    expect((await alertasAhora()).alertas.find((a) => a.tipo === 'FURGO_RESERVAR')?.etiqueta).toBe('ALQUILA LA FURGONETA · EN 5 DÍAS');
  });

  it('con la furgoneta reservada desaparece la alerta', async () => {
    const v = await visita({ fecha: MIERCOLES, furgo: true });
    await guardarReserva({
      fecha: MIERCOLES, proveedor_id: null, proveedor_nombre: 'Alquileres Sur', proveedor_telefono: null, recogida: `${MARTES}T19:00`,
      devolucion: `${MIERCOLES}T20:00`, precio: 9000, fianza_prevista: 15000, visitas: [v],
    });
    expect((await alertasAhora()).alertas.some((a) => a.tipo === 'FURGO_RESERVAR')).toBe(false);
  });
});

describe('Criterio 25 · «Ya la reservé» con recogida el martes a las 19:00 → «¿Ya recogiste la furgoneta?» y registro doble', () => {
  it('a las 19:00 llega el aviso y «Registrar los dos» crea el alquiler y la fianza con un solo botón', async () => {
    const v = await visita({ fecha: MIERCOLES, furgo: true });
    await guardarReserva({
      fecha: MIERCOLES, proveedor_id: null, proveedor_nombre: 'Alquileres Sur', proveedor_telefono: null, recogida: `${MARTES}T19:00`,
      devolucion: `${MIERCOLES}T20:00`, precio: 9000, fianza_prevista: 15000, visitas: [v],
    });

    vi.setSystemTime(desdeMadrid(2026, 11, 10, 18, 55));
    expect(avisosInmediatos((await alertasAhora()).alertas, {}, new Date())).toHaveLength(0);

    vi.setSystemTime(desdeMadrid(2026, 11, 10, 19, 0));
    const avisos = avisosInmediatos((await alertasAhora()).alertas, {}, new Date());
    expect(avisos.map((a) => a.texto)).toEqual(['¿Ya recogiste la furgoneta? Registra pago y fianza.']);
    expect(avisos[0].destino).toEqual({ pantalla: 'preparar', fecha: MIERCOLES });

    const { user } = alertas();
    await waitFor(() => expect(tarjeta('FURGO_RECOGER')).not.toBeNull());
    const t = tarjeta('FURGO_RECOGER')!;
    expect(texto(t)).toContain('Alquiler 90,00 € y fianza 150,00 €.');
    await user.click(within(t).getByRole('button', { name: 'Registrar los dos' }));
    await waitFor(async () => expect(await activos()).toHaveLength(2));
    const movs = await activos();
    const gasto = movs.find((m) => m.tipo === 'gasto')!;
    const cat = await db.categorias.get(gasto.categoria_id!);
    expect(cat?.clave).toBe('alquiler_furgoneta');
    expect(gasto.importe).toBe(9000);
    expect(gasto.cliente_id).toBe(v.cliente_id);
    expect(movs.find((m) => m.tipo === 'fianza_entregada')?.importe).toBe(15000);
    await waitFor(() => expect(tarjeta('FURGO_RECOGER')).toBeNull());

    // «Deshacer» lo quita todo.
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect(await activos()).toHaveLength(0));
    await waitFor(async () => expect((await leerReservas())[0].estado).toBe('reservada'));
  });

  it('en horas de silencio la recogida sale a su hora (decisión de Ariel del 2026-11-07), no antes', async () => {
    const v = await visita({ fecha: MIERCOLES, furgo: true });
    await guardarReserva({
      fecha: MIERCOLES, proveedor_id: null, proveedor_nombre: 'Alquileres Sur', proveedor_telefono: null, recogida: `${MARTES}T23:00`,
      devolucion: `${MIERCOLES}T07:00`, precio: 9000, fianza_prevista: 0, visitas: [v],
    });
    vi.setSystemTime(desdeMadrid(2026, 11, 10, 22, 59));
    expect(avisosInmediatos((await alertasAhora()).alertas, {}, new Date())).toHaveLength(0);
    vi.setSystemTime(desdeMadrid(2026, 11, 10, 23, 0));
    expect(avisosInmediatos((await alertasAhora()).alertas, {}, new Date()).map((a) => a.texto)).toEqual(['¿Ya recogiste la furgoneta? Registra el pago.']);
  });
});

describe('Criterio 26 · 2 artículos en «Comprar» con recordatorio mañana a las 18:00 → aviso con esos 2', () => {
  async function preparar(recordatorio: string) {
    await visita({ fecha: MIERCOLES, tipos: ['setos_poda'] });
    const item = (nombre: string) => ({ nombre, tipo: 'setos_poda' as const, extra: false });
    await marcarMaterial(MIERCOLES, item('Gasolina de mezcla'), 'comprar');
    await marcarMaterial(MIERCOLES, item('Sacos de restos'), 'comprar');
    await marcarMaterial(MIERCOLES, item('Lona'), 'lo_tengo');
    await guardarRecordatorio(MIERCOLES, recordatorio);
  }

  it('mañana a las 18:00 se avisa «Compra para el miércoles: …», no antes ni dos veces', async () => {
    await preparar(`${DOMINGO}T18:00`);
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 17, 59));
    expect(avisosInmediatos((await alertasAhora()).alertas, {}, new Date())).toHaveLength(0);
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 18, 0));
    const avisos = avisosInmediatos((await alertasAhora()).alertas, {}, new Date());
    expect(avisos.map((a) => a.texto)).toEqual(['Compra para el miércoles: gasolina de mezcla y sacos de restos.']);
    await marcarAvisados(avisos.map((a) => a.clave));
    const avisados = (await leerEstado()).avisados;
    expect(avisosInmediatos((await alertasAhora()).alertas, avisados, new Date())).toHaveLength(0);
  });

  it('lo programó Felipe: se avisa aunque caiga en horas de silencio', async () => {
    await preparar(`${DOMINGO}T23:00`);
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 23, 0));
    expect(avisosInmediatos((await alertasAhora()).alertas, {}, new Date())).toHaveLength(1);
  });

  it('en Alertas, «Ya lo compré» deja los dos en «Comprado» y «Deshacer» lo devuelve', async () => {
    await preparar(`${DOMINGO}T18:00`);
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 18, 0));
    const { user } = alertas();
    await waitFor(() => expect(tarjeta('COMPRA_RECORDATORIO')).not.toBeNull());
    const t = tarjeta('COMPRA_RECORDATORIO')!;
    expect(texto(t)).toContain('Compra para el miércoles: gasolina de mezcla y sacos de restos.');
    await user.click(within(t).getByRole('button', { name: 'Ya lo compré' }));
    await waitFor(() => expect(tarjeta('COMPRA_RECORDATORIO')).toBeNull());
    const prep = (await preparaciones())[MIERCOLES];
    expect(prep.material.filter((i) => i.estado === 'comprado').map((i) => i.nombre)).toEqual(['Gasolina de mezcla', 'Sacos de restos']);
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(tarjeta('COMPRA_RECORDATORIO')).not.toBeNull());
  });

  it('«Posponer 2 h» mueve el recordatorio y la tarjeta se va hasta entonces', async () => {
    await preparar(`${DOMINGO}T18:00`);
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 18, 0));
    const { user } = alertas();
    await waitFor(() => expect(tarjeta('COMPRA_RECORDATORIO')).not.toBeNull());
    await user.click(within(tarjeta('COMPRA_RECORDATORIO')!).getByRole('button', { name: 'Posponer 2 h' }));
    await waitFor(() => expect(tarjeta('COMPRA_RECORDATORIO')).toBeNull());
    expect((await preparaciones())[MIERCOLES].recordatorio_compra).toBe(`${DOMINGO}T20:00`);
  });
});

describe('Criterio 27 · visita mañana con 2 ayudantes → ropa para 3 personas', () => {
  it('Preparar trabajo muestra cantidades para 3 y el resumen de la víspera dice «Mañana sois 3»', async () => {
    await visita({ fecha: DOMINGO, tipos: ['corte_cesped'], ayudantes: 2 });
    montar(<PrepararTrabajo fecha={DOMINGO} etiquetaVolver="Alertas" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />);
    const ropa = await waitFor(() => {
      const b = document.querySelector('[data-bloque="ropa"]') as HTMLElement;
      expect(b).not.toBeNull();
      return b;
    });
    expect(texto(ropa)).toContain('Ropa para 3 personas');
    expect(within(ropa).getByRole('checkbox', { name: /Polos FERGO \(3\)/ })).toBeTruthy();
    expect(within(ropa).getByRole('checkbox', { name: /Guantes \(3 pares\)/ })).toBeTruthy();

    const r = await alertasAhora();
    const a = r.alertas.find((x) => x.tipo === 'ROPA_PREPARAR')!;
    expect(a.texto).toBe('Mañana sois 3: prepara polos, pantalones, guantes, botas y lo demás.');
    expect(lineasResumen(r.alertas, {}).map((l) => l.texto)).toContain(a.texto);
  });

  it('una visita de abono normal mañana solo da la fila de ropa en Alertas, sin tarjeta propia', async () => {
    await visita({ fecha: DOMINGO, tipos: ['corte_cesped'] });
    alertas();
    await waitFor(() => expect(tarjeta('ROPA_PREPARAR')).not.toBeNull());
    expect(texto(tarjeta('ROPA_PREPARAR'))).toContain('Mañana vas tú solo: prepara polo, pantalón, guantes, botas y lo demás.');
    expect(document.querySelector('[data-tarjeta-dia]')).toBeNull();
  });
});
