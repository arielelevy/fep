import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claveDia, sumarDias } from '../../src/lib/fechas';
import {
  UBICACION_REFERENCIA, almacenEnMemoria, almacenLocal, claveUbicacion, configurarClima, crearProveedorSimulado, crearServicioClima,
  diasPrevision, evaluarVisita, horaSimulada, redondear, textoActualizado, usePrevision14Dias, useSemaforoVisita,
  type Prevision, type ProveedorClima, type Ubicacion, type VisitaClima,
} from '../../src/clima';

// Proveedor simulado, caché con hora de actualización, «Sin previsión» y hooks para las pantallas.

const U: Ubicacion = { lat: 40.4168, lon: -3.7038 };
const AHORA = new Date('2026-11-07T08:00:00Z');

afterEach(() => {
  configurarClima(null);
  vi.useRealTimers();
});

describe('Proveedor simulado (interfaz ProveedorClima)', () => {
  it('es determinista, redondea a 2 decimales y da 16 días desde hoy (más ayer para las 12 h previas)', async () => {
    const p = crearProveedorSimulado({ ahora: () => AHORA });
    const a = await p.prevision(U, 16);
    const b = await p.prevision({ lat: 40.4201, lon: -3.6999 }, 16); // mismo punto redondeado
    expect(a.ubicacion).toEqual({ lat: 40.42, lon: -3.7 });
    expect(a.horas).toEqual(b.horas);
    expect(a.fuente).toBe('simulada');
    expect(a.horas).toHaveLength(17 * 24);
    expect(a.horas[0].hora).toBe(`${sumarDias(claveDia(AHORA), -1)}T00`);
    expect(a.dias.map((d) => d.fecha)).toHaveLength(16);
    expect(a.dias[0].fecha).toBe(claveDia(AHORA));
    for (const h of a.horas) {
      expect(h.prob_precipitacion).toBeGreaterThanOrEqual(0);
      expect(h.prob_precipitacion).toBeLessThanOrEqual(100);
      expect(h.rachas).toBeGreaterThanOrEqual(h.viento);
    }
    expect(horaSimulada(U, '2026-11-09T10')).toEqual(horaSimulada(redondear(U), '2026-11-09T10'));
  });

  it('acepta escenarios, avisos y fallos para pruebas y demostraciones', async () => {
    const p = crearProveedorSimulado({
      ahora: () => AHORA,
      escenario: (_u, hora) => (hora === '2026-11-09T10' ? { codigo_wmo: 95 } : null),
      avisos: [{ fecha: '2026-11-09', nivel: 'naranja', fenomeno: 'viento' }],
    });
    const prev = await p.prevision(U, 16);
    expect(prev.horas.find((h) => h.hora === '2026-11-09T10')?.codigo_wmo).toBe(95);
    expect(await p.avisos!(U, '2026-11-08', '2026-11-10')).toHaveLength(1);
    expect(await p.avisos!(U, '2026-11-10', '2026-11-12')).toHaveLength(0);
    await expect(crearProveedorSimulado({ fallar: true }).prevision(U, 16)).rejects.toThrow('no responde');
  });
});

describe('Caché y «Sin previsión» (§11.1, §14)', () => {
  const contar = (base: ProveedorClima) => {
    const llamadas = { n: 0 };
    const p: ProveedorClima = { nombre: base.nombre, prevision: (u, d, s) => { llamadas.n++; return base.prevision(u, d, s); }, avisos: base.avisos };
    return { p, llamadas };
  };

  it('usa la caché si tiene menos de 3 h; pasadas 3 h y con conexión, la refresca', async () => {
    let ahora = AHORA;
    const { p, llamadas } = contar(crearProveedorSimulado({ ahora: () => ahora }));
    const s = crearServicioClima({ proveedor: p, ahora: () => ahora, enLinea: () => true });
    expect((await s.prevision(U)).estado).toBe('fresca');
    ahora = new Date(AHORA.getTime() + 2.9 * 3_600_000);
    expect((await s.prevision(U)).estado).toBe('fresca');
    expect(llamadas.n).toBe(1);
    ahora = new Date(AHORA.getTime() + 3.1 * 3_600_000);
    const r = await s.prevision(U);
    expect(llamadas.n).toBe(2);
    expect(r.prevision?.actualizado_en).toBe(ahora.toISOString());
  });

  it('sin conexión usa la última guardada con su hora; si no hay ninguna, «sin_datos» y el semáforo sale gris', async () => {
    let ahora = AHORA;
    let conexion = true;
    const s = crearServicioClima({ proveedor: crearProveedorSimulado({ ahora: () => ahora }), ahora: () => ahora, enLinea: () => conexion });
    await s.prevision(U);
    conexion = false;
    ahora = new Date(AHORA.getTime() + 5 * 3_600_000);
    const r = await s.prevision(U);
    expect(r).toMatchObject({ estado: 'guardada', motivo: 'Sin conexión' });
    expect(textoActualizado(r.prevision, ahora)).toBe('Actualizado hace 5 h');

    const otra = await s.prevision({ lat: 41.6, lon: -0.9 });
    expect(otra).toEqual({ prevision: null, estado: 'sin_datos', motivo: 'Sin conexión' });
    const visita: VisitaClima = { fecha: claveDia(ahora), hora_inicio: '12:00', duracion: 60, tipos_trabajo: ['piscina'] };
    expect(evaluarVisita({ visita, ubicacion: { lat: 41.6, lon: -0.9 }, prevision: otra.prevision, motivoSinPrevision: otra.motivo, ahora })).toMatchObject({ nivel: 'gris', etiqueta: 'Sin previsión', motivo: 'Sin conexión' });
  });

  it('si el proveedor no responde (fallo o demasiado lento): la guardada o «sin_datos», sin romper', async () => {
    let fallar = false;
    let ahora = AHORA;
    const s = crearServicioClima({ proveedor: crearProveedorSimulado({ ahora: () => ahora, fallar: () => fallar }), ahora: () => ahora, enLinea: () => true });
    await s.prevision(U);
    fallar = true;
    ahora = new Date(AHORA.getTime() + 4 * 3_600_000);
    expect(await s.prevision(U)).toMatchObject({ estado: 'guardada', motivo: 'El servicio del tiempo no responde' });
    const lento: ProveedorClima = { nombre: 'lento', prevision: () => new Promise(() => {}) };
    const s2 = crearServicioClima({ proveedor: lento, enLinea: () => true, tiempoEsperaMs: 20 });
    expect(await s2.prevision(U)).toEqual({ prevision: null, estado: 'sin_datos', motivo: 'El servicio del tiempo no responde' });
    expect(await s2.avisos(U, '2026-11-07', '2026-11-20')).toEqual([]);
  });

  it('sin proveedor configurado: «sin_datos» (no inventa previsión)', async () => {
    const s = crearServicioClima({ proveedor: null, enLinea: () => true });
    expect(await s.prevision(U)).toMatchObject({ prevision: null, estado: 'sin_datos' });
  });

  it('varias peticiones del mismo punto a la vez hacen una sola consulta', async () => {
    const { p, llamadas } = contar(crearProveedorSimulado({ ahora: () => AHORA }));
    const s = crearServicioClima({ proveedor: p, ahora: () => AHORA, enLinea: () => true });
    await Promise.all([s.prevision(U), s.prevision({ lat: 40.42, lon: -3.7 }), s.prevision(U)]);
    expect(llamadas.n).toBe(1);
    expect(claveUbicacion(U)).toBe('40.42,-3.70');
  });

  it('el almacén local guarda en localStorage y se puede leer en otra sesión', async () => {
    const almacen = almacenLocal('prueba.clima.');
    const s = crearServicioClima({ proveedor: crearProveedorSimulado({ ahora: () => AHORA }), almacen, ahora: () => AHORA, enLinea: () => true });
    await s.prevision(U);
    expect(window.localStorage.getItem(`prueba.clima.${claveUbicacion(U)}`)).toContain('"fuente":"simulada"');
    const otra = crearServicioClima({ proveedor: null, almacen: almacenLocal('prueba.clima.'), ahora: () => AHORA, enLinea: () => false });
    expect(otra.guardada(U)?.fuente).toBe('simulada');
  });

  it('«Actualizado hace …» sólo con más de 3 h', () => {
    const p = { actualizado_en: AHORA.toISOString() } as Prevision;
    expect(textoActualizado(p, new Date(AHORA.getTime() + 2 * 3_600_000))).toBeNull();
    expect(textoActualizado(p, new Date(AHORA.getTime() + 3.5 * 3_600_000))).toBe('Actualizado hace 3 h');
    expect(textoActualizado(p, new Date(AHORA.getTime() + 30 * 3_600_000))).toBe('Actualizado hace 1 día');
    expect(textoActualizado(null)).toBeNull();
  });
});

describe('Franja de 14 días (§10.5.2)', () => {
  it('14 días desde hoy, días 8–14 orientativos, y sin datos se pinta igual (valores null)', async () => {
    const prev = await crearProveedorSimulado({ ahora: () => AHORA }).prevision(UBICACION_REFERENCIA, 16);
    const dias = diasPrevision(prev, AHORA);
    expect(dias).toHaveLength(14);
    expect(dias[0]).toMatchObject({ fecha: '2026-11-07', diaCorto: 'Sáb', numero: 7, orientativo: false });
    expect(dias.slice(7).every((d) => d.orientativo)).toBe(true);
    expect(dias.every((d) => d.icono !== null && d.max !== null && d.probLluvia !== null)).toBe(true);
    const vacios = diasPrevision(null, AHORA);
    expect(vacios.every((d) => d.icono === null && d.max === null)).toBe(true);
  });
});

describe('Hooks para las pantallas', () => {
  function Tarjeta({ visita, ubicacion }: { visita: VisitaClima; ubicacion: Ubicacion | null }) {
    const { semaforo, cargando } = useSemaforoVisita(visita, ubicacion);
    if (cargando && !semaforo) return <p>cargando</p>;
    return <p data-testid="sem">{`${semaforo?.nivel}|${semaforo?.etiqueta}|${semaforo?.motivo ?? ''}`}</p>;
  }
  function Franja() {
    const { dias, cargando } = usePrevision14Dias();
    return <p data-testid="franja">{cargando ? 'cargando' : dias.map((d) => `${d.numero}${d.orientativo ? '*' : ''}`).join(',')}</p>;
  }

  it('useSemaforoVisita: con coordenadas da el semáforo; sin coordenadas, «Falta la dirección del cliente»', async () => {
    const hoy = claveDia(new Date());
    configurarClima(crearServicioClima({
      proveedor: crearProveedorSimulado({ escenario: (_u, h) => (h === `${hoy}T23` ? { prob_precipitacion: 80, precipitacion: 3 } : { prob_precipitacion: 0, precipitacion: 0, codigo_wmo: 0, temperatura: 20, viento: 5, rachas: 8 }) }),
      almacen: almacenEnMemoria(),
      enLinea: () => true,
    }));
    const visita: VisitaClima = { fecha: hoy, hora_inicio: '23:00', duracion: 30, tipos_trabajo: ['corte_cesped'] };
    const { rerender } = render(<Tarjeta visita={visita} ubicacion={U} />);
    await waitFor(() => expect(screen.getByTestId('sem').textContent).toBe('rojo|Mejor mover · Lluvia toda la noche|'));
    rerender(<Tarjeta visita={visita} ubicacion={null} />);
    await waitFor(() => expect(screen.getByTestId('sem').textContent).toBe('gris|Sin previsión|Falta la dirección del cliente'));
  });

  it('useSemaforoVisita sin conexión ni datos guardados: «Sin previsión · Sin conexión»', async () => {
    configurarClima(crearServicioClima({ proveedor: crearProveedorSimulado(), almacen: almacenEnMemoria(), enLinea: () => false }));
    render(<Tarjeta visita={{ fecha: claveDia(new Date()), hora_inicio: '12:00', duracion: 60, tipos_trabajo: ['piscina'] }} ubicacion={U} />);
    await waitFor(() => expect(screen.getByTestId('sem').textContent).toBe('gris|Sin previsión|Sin conexión'));
  });

  it('usePrevision14Dias: 14 días con la ubicación de referencia, 8–14 marcados', async () => {
    configurarClima(crearServicioClima({ proveedor: crearProveedorSimulado(), almacen: almacenEnMemoria(), enLinea: () => true }));
    render(<Franja />);
    await waitFor(() => expect(screen.getByTestId('franja').textContent).not.toBe('cargando'));
    const partes = screen.getByTestId('franja').textContent!.split(',');
    expect(partes).toHaveLength(14);
    expect(partes.filter((x) => x.endsWith('*'))).toHaveLength(7);
  });
});
