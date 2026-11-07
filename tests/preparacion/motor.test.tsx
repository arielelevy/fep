// Motor y planificador de alertas de preparación (ola 8, encargo B): escalones, devolución de la furgoneta, «Aún no»,
// tarjeta del día, horas de silencio y pantalla Alertas con la campana.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampanaAlertas } from '../../src/componentes/alertas/CampanaAlertas';
import { reiniciarBase } from '../../src/db/db';
import { escalonFurgo, textoRopa } from '../../src/features/alertas/preparacion/motor';
import { avisosInmediatos, enSilencio } from '../../src/features/alertas/preparacion/planificador';
import { guardarRecordatorio, guardarReserva, leerReservas, marcarMaterial, marcarRopa, registrarRecogida } from '../../src/features/preparar/operaciones';
import { ROPA_POR_DEFECTO } from '../../src/features/preparar/plantillas';
import { desdeMadrid } from '../../src/lib/fechas';
import { Alertas } from '../../src/pantallas/alertas/Alertas';
import { activos, AHORA, alertasAhora, MARTES, MIERCOLES, montar, texto, visita } from './escena';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
});
afterEach(() => vi.useRealTimers());

describe('reglas puras', () => {
  it('escalones de FURGO_RESERVAR: el configurado, 3 y 1 día', () => {
    expect([5, 4, 3, 2, 1, 0].map((d) => escalonFurgo(d, 5))).toEqual([5, 5, 3, 3, 1, 1]);
    expect(escalonFurgo(4, 4)).toBe(4);
  });

  it('horas de silencio de 22:00 a 08:00 (cruzan la medianoche, hora de Madrid)', () => {
    expect(enSilencio(desdeMadrid(2026, 11, 7, 21, 59))).toBe(false);
    expect(enSilencio(desdeMadrid(2026, 11, 7, 22, 0))).toBe(true);
    expect(enSilencio(desdeMadrid(2026, 11, 8, 7, 59))).toBe(true);
    expect(enSilencio(desdeMadrid(2026, 11, 8, 8, 0))).toBe(false);
  });

  it('texto de la ropa: sin las ya marcadas y sin lo que va por equipo', () => {
    expect(textoRopa(3, ROPA_POR_DEFECTO, ['pantalon', 'gorra', 'auditiva'])).toBe('Mañana sois 3: prepara polos, guantes, botas y gafas.');
    expect(textoRopa(2, ROPA_POR_DEFECTO, ROPA_POR_DEFECTO.map((p) => p.clave).filter((k) => k !== 'agua_protector'))).toBe('Mañana sois 2: prepara el agua y el protector.');
  });
});

describe('furgoneta: devolución', () => {
  async function recogida() {
    const v = await visita({ fecha: MIERCOLES, furgo: true });
    const { reserva } = await guardarReserva({
      fecha: MIERCOLES, proveedor_id: null, proveedor_nombre: 'Alquileres Sur', proveedor_telefono: null, recogida: `${MARTES}T19:00`,
      devolucion: `${MIERCOLES}T20:00`, precio: 9000, fianza_prevista: 15000, visitas: [v],
    });
    await registrarRecogida(reserva.id, { precio: 9000, fianza: 15000, medio_pago: 'efectivo', visitas: [v] });
  }

  it('a la hora de devolución pregunta por la fianza; «Entera» la devuelve', async () => {
    await recogida();
    vi.setSystemTime(desdeMadrid(2026, 11, 11, 19, 59));
    expect((await alertasAhora()).alertas.some((a) => a.tipo === 'FURGO_DEVOLVER')).toBe(false);
    vi.setSystemTime(desdeMadrid(2026, 11, 11, 20, 0));
    const a = (await alertasAhora()).alertas.find((x) => x.tipo === 'FURGO_DEVOLVER')!;
    expect(a.texto).toBe('¿Te devolvieron la fianza de 150 €?');
    expect(a.acciones.map((x) => x.texto)).toEqual(['Entera', 'Me descontaron', 'Aún no']);

    const { user } = montar(<Alertas etiquetaVolver="Agenda" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />);
    const t = await waitFor(() => {
      const el = document.querySelector('[data-alerta-prep="FURGO_DEVOLVER"]') as HTMLElement | null;
      expect(el).not.toBeNull();
      return el!;
    });
    await user.click(within(t).getByRole('button', { name: 'Entera' }));
    await waitFor(async () => expect((await activos()).some((m) => m.tipo === 'fianza_devuelta' && m.importe === 15000)).toBe(true));
    // La reserva queda devuelta (se espera a la última escritura para no dejarla a medias al acabar la prueba).
    await waitFor(async () => expect((await leerReservas())[0].estado).toBe('devuelta'));
  });

  it('«Aún no» la aparta hasta mañana a las 10:00', async () => {
    await recogida();
    vi.setSystemTime(desdeMadrid(2026, 11, 11, 20, 30));
    const onPreparar = vi.fn();
    const { user } = montar(<Alertas etiquetaVolver="Agenda" onVolver={vi.fn()} onAbrirVisita={vi.fn()} onPreparar={onPreparar} />);
    const t = await waitFor(() => {
      const el = document.querySelector('[data-alerta-prep="FURGO_DEVOLVER"]') as HTMLElement | null;
      expect(el).not.toBeNull();
      return el!;
    });
    // «Me descontaron» pide el importe en la misma tarjeta; «Volver» lo cierra sin guardar.
    await user.click(within(t).getByRole('button', { name: 'Me descontaron' }));
    expect(onPreparar).not.toHaveBeenCalled();
    expect(within(t).getByLabelText('¿Cuánto te devolvieron?')).toBeTruthy();
    await user.click(within(t).getByRole('button', { name: 'Volver' }));
    await user.click(within(t).getByRole('button', { name: 'Aún no' }));
    await waitFor(() => expect(document.querySelector('[data-alerta-prep="FURGO_DEVOLVER"]')).toBeNull());
    vi.setSystemTime(desdeMadrid(2026, 11, 12, 9, 59));
    expect((await alertasAhora()).alertas.some((a) => a.tipo === 'FURGO_DEVOLVER')).toBe(false);
    vi.setSystemTime(desdeMadrid(2026, 11, 12, 10, 0));
    expect((await alertasAhora()).alertas.some((a) => a.tipo === 'FURGO_DEVOLVER')).toBe(true);
  });
});

describe('decisiones de Ariel del 2026-11-07', () => {
  it('la devolución de la furgoneta en horas de silencio sale a su hora', async () => {
    const v = await visita({ fecha: MIERCOLES, furgo: true });
    const { reserva } = await guardarReserva({
      fecha: MIERCOLES, proveedor_id: null, proveedor_nombre: 'Alquileres Sur', proveedor_telefono: null, recogida: `${MARTES}T19:00`,
      devolucion: `${MIERCOLES}T23:30`, precio: 9000, fianza_prevista: 15000, visitas: [v],
    });
    await registrarRecogida(reserva.id, { precio: 9000, fianza: 15000, medio_pago: 'efectivo', visitas: [v] });
    vi.setSystemTime(desdeMadrid(2026, 11, 11, 23, 30));
    expect(avisosInmediatos((await alertasAhora()).alertas, {}, new Date()).map((a) => a.texto)).toEqual(['¿Te devolvieron la fianza de 150 €?']);
  });

  it('las demás alertas inmediatas siguen esperando fuera de las horas de silencio', async () => {
    await visita({ fecha: '2026-11-09', furgo: true });
    // FURGO_RESERVAR urgente (víspera): aviso inmediato desde las 10:00, pero no en horas de silencio.
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 23, 0));
    expect(avisosInmediatos((await alertasAhora()).alertas, {}, new Date())).toHaveLength(0);
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 21, 0));
    expect(avisosInmediatos((await alertasAhora()).alertas, {}, new Date()).map((a) => a.tipo)).toEqual(['FURGO_RESERVAR']);
  });

  it('cuando el día está todo preparado su tarjeta se quita de Alertas y la campana no la cuenta', async () => {
    const v = await visita({ fecha: MIERCOLES, furgo: true, tipos: ['plantacion'], ayudantes: 1 });
    expect((await alertasAhora()).tarjetas.map((t) => t.fecha)).toEqual([MIERCOLES]);
    await guardarReserva({
      fecha: MIERCOLES, proveedor_id: null, proveedor_nombre: 'Alquileres Sur', proveedor_telefono: null, recogida: `${MARTES}T19:00`,
      devolucion: `${MIERCOLES}T20:00`, precio: 9000, fianza_prevista: 15000, visitas: [v],
    });
    // Furgo reservada, ropa a medias: la tarjeta sigue con «1 de 2 listo».
    await marcarRopa(MIERCOLES, 'polo', true);
    expect((await alertasAhora()).tarjetas[0]?.etiqueta).toBe('EN 4 DÍAS · 1 DE 2 LISTO');
    for (const p of ROPA_POR_DEFECTO) await marcarRopa(MIERCOLES, p.clave, true);
    const r = await alertasAhora();
    expect(r.tarjetas).toHaveLength(0);

    montar(<Alertas etiquetaVolver="Agenda" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />);
    expect(await screen.findByText('Todo en orden. No hay nada que decidir esta semana.')).toBeTruthy();
    expect(document.querySelector('[data-tarjeta-dia]')).toBeNull();
    montar(<CampanaAlertas onClick={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Alertas' }).getAttribute('data-insignia')).toBe('0'));
  });
});

describe('tarjeta del día, material y campana', () => {
  it('chips «Furgo reservada», «Comprar 2 cosas», «Ropa para 3» y MATERIAL_REVISAR desde 3 días antes', async () => {
    const v = await visita({ fecha: MIERCOLES, furgo: true, tipos: ['setos_poda'], ayudantes: 2 });
    // A 4 días: aún no pide revisar el material.
    expect((await alertasAhora()).alertas.some((a) => a.tipo === 'MATERIAL_REVISAR')).toBe(false);
    await guardarReserva({
      fecha: MIERCOLES, proveedor_id: null, proveedor_nombre: 'Alquileres Sur', proveedor_telefono: null, recogida: `${MARTES}T19:00`,
      devolucion: `${MIERCOLES}T20:00`, precio: 9000, fianza_prevista: 15000, visitas: [v],
    });
    const item = (nombre: string) => ({ nombre, tipo: 'setos_poda' as const });
    await marcarMaterial(MIERCOLES, item('Gasolina de mezcla'), 'comprar');
    await marcarMaterial(MIERCOLES, item('Sacos de restos'), 'comprar');
    vi.setSystemTime(desdeMadrid(2026, 11, 8, 10));
    const r = await alertasAhora();
    const t = r.tarjetas.find((x) => x.fecha === MIERCOLES)!;
    expect(t.etiqueta).toBe('EN 3 DÍAS · 1 DE 3 LISTO');
    expect(t.titulo).toBe('Miércoles 11 · Sra. Morales');
    expect(t.chips.map((c) => c.texto)).toEqual(['Furgo reservada', 'Comprar 2 cosas', 'Ropa para 3']);
    expect(r.alertas.find((a) => a.tipo === 'MATERIAL_REVISAR')?.texto).toBe('¿Tienes todo para el miércoles? Revisa el material.');
  });

  it('la campana suma las alertas de preparación con acción', async () => {
    await visita({ fecha: MIERCOLES, furgo: true });
    montar(<CampanaAlertas onClick={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Alertas' }).getAttribute('data-insignia')).toBe('1'));
    expect(texto(screen.getByRole('button', { name: 'Alertas' }))).toContain('1 para decidir');
  });

  it('sin preparación pendiente, Alertas muestra «Todo en orden»', async () => {
    montar(<Alertas etiquetaVolver="Agenda" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />);
    expect(await screen.findByText('Todo en orden. No hay nada que decidir esta semana.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Preparar trabajos' })).toBeNull();
  });

  it('un recordatorio sin nada en «Comprar» no avisa', async () => {
    await visita({ fecha: MIERCOLES, tipos: ['setos_poda'] });
    await guardarRecordatorio(MIERCOLES, '2026-11-07T09:00');
    expect((await alertasAhora()).alertas.some((a) => a.tipo === 'COMPRA_RECORDATORIO')).toBe(false);
  });
});

describe('furgoneta: descuento de fianza desde Alertas', () => {
  it('«Me descontaron» con 120 € devueltos registra la devolución y el gasto por la diferencia', async () => {
    const v = await visita({ fecha: MIERCOLES, furgo: true });
    const { reserva } = await guardarReserva({
      fecha: MIERCOLES, proveedor_id: null, proveedor_nombre: 'Alquileres Sur', proveedor_telefono: null, recogida: `${MARTES}T19:00`,
      devolucion: `${MIERCOLES}T20:00`, precio: 9000, fianza_prevista: 15000, visitas: [v],
    });
    await registrarRecogida(reserva.id, { precio: 9000, fianza: 15000, medio_pago: 'efectivo', visitas: [v] });
    vi.setSystemTime(desdeMadrid(2026, 11, 11, 20, 30));
    const { user } = montar(<Alertas etiquetaVolver="Agenda" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />);
    const t = await waitFor(() => {
      const el = document.querySelector('[data-alerta-prep="FURGO_DEVOLVER"]') as HTMLElement | null;
      expect(el).not.toBeNull();
      return el!;
    });
    await user.click(within(t).getByRole('button', { name: 'Me descontaron' }));
    await user.type(within(t).getByLabelText('¿Cuánto te devolvieron?'), '120');
    expect(texto(t)).toContain('Se anota un gasto de 30,00 € con la nota «Descuento de fianza».');
    await user.click(within(t).getByRole('button', { name: 'Guardar devolución' }));
    await waitFor(async () => expect((await leerReservas())[0].estado).toBe('devuelta'));
    const movs = await activos();
    expect(movs.find((m) => m.tipo === 'fianza_devuelta')?.importe).toBe(12000);
    expect(movs.filter((m) => m.tipo === 'gasto').map((m) => m.importe).sort()).toEqual([3000, 9000]);
    await waitFor(() => expect(document.querySelector('[data-alerta-prep="FURGO_DEVOLVER"]')).toBeNull());
  });
});
