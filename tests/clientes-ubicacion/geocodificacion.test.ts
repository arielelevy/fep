// Geocodificación simulada tras una interfaz (ola 6, frente B; §13.3). El proveedor real queda fuera.
import { afterEach, describe, expect, it } from 'vitest';
import {
  claveDireccion,
  configurarGeocodificador,
  crearGeocodificadorSimulado,
  geocodificadorActual,
  geocodificar,
  type Geocodificador,
} from '../../src/geocodificacion';

afterEach(() => configurarGeocodificador(undefined));

describe('Proveedor simulado', () => {
  const g = crearGeocodificadorSimulado();

  it('es determinista y cae cerca del municipio (≈ 1 km), marcado como aproximado y de prueba', async () => {
    const a = await g.geocodificar('Calle Mayor 3', 'Rivas-Vaciamadrid');
    const b = await g.geocodificar('  calle   mayor 3 ', 'RIVAS-VACIAMADRID');
    expect(a).toEqual(b ? { ...b, etiqueta: a!.etiqueta } : null);
    expect(Math.abs(a!.lat - 40.3567)).toBeLessThanOrEqual(0.012);
    expect(Math.abs(a!.lon + 3.5321)).toBeLessThanOrEqual(0.012);
    expect(a).toMatchObject({ aproximado: true, simulado: true, etiqueta: 'Calle Mayor 3, Rivas-Vaciamadrid' });
    // Coordenadas con 5 decimales como mucho.
    expect(String(a!.lat).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(5);
  });

  it('calles distintas dan puntos distintos; municipio sin calle da su centro; desconocido cae en Madrid', async () => {
    const a = await g.geocodificar('Calle Mayor 3', 'Majadahonda');
    const b = await g.geocodificar('Avenida de España 10', 'Majadahonda');
    expect(a).not.toEqual(b);
    expect(await g.geocodificar('', 'Pozuelo de Alarcón')).toMatchObject({ lat: 40.4351, lon: -3.8137 });
    const x = await g.geocodificar('Calle Falsa 1', 'Pueblo Inventado');
    expect(Math.abs(x!.lat - 40.4168)).toBeLessThanOrEqual(0.012);
  });

  it('una dirección sin letras no se encuentra', async () => {
    expect(await g.geocodificar('123', '')).toBeNull();
    expect(await g.geocodificar('', '')).toBeNull();
  });
});

describe('geocodificar(): nunca lanza y nunca bloquea el guardado', () => {
  it('encontrada', async () => {
    const r = await geocodificar('Calle Mayor 3', 'Madrid', { enLinea: () => true });
    expect(r.estado).toBe('encontrada');
    expect(r.resultado).toBeTruthy();
  });
  it('sin dirección', async () => {
    expect(await geocodificar(' ', '', { enLinea: () => true })).toEqual({ estado: 'sin_direccion', resultado: null });
  });
  it('sin conexión (§14.1: geocodificar necesita red)', async () => {
    expect(await geocodificar('Calle Mayor 3', 'Madrid', { enLinea: () => false })).toEqual({ estado: 'sin_conexion', resultado: null });
  });
  it('sin servicio', async () => {
    configurarGeocodificador(null);
    expect(geocodificadorActual()).toBeNull();
    expect((await geocodificar('Calle Mayor 3', 'Madrid', { enLinea: () => true })).estado).toBe('sin_servicio');
  });
  it('proveedor que falla o tarda demasiado → error', async () => {
    configurarGeocodificador(crearGeocodificadorSimulado({ fallar: true }));
    expect((await geocodificar('Calle Mayor 3', 'Madrid', { enLinea: () => true })).estado).toBe('error');
    configurarGeocodificador(crearGeocodificadorSimulado({ retrasoMs: 200 }));
    expect((await geocodificar('Calle Mayor 3', 'Madrid', { enLinea: () => true, esperaMs: 20 })).estado).toBe('error');
  });
  it('no encontrada', async () => {
    expect((await geocodificar('123', '', { enLinea: () => true })).estado).toBe('no_encontrada');
  });
  it('el proveedor real se enchufa por la interfaz sin tocar las pantallas', async () => {
    const real: Geocodificador = { nombre: 'real', geocodificar: async () => ({ lat: 1, lon: 2, etiqueta: 'x', aproximado: false, simulado: false }) };
    configurarGeocodificador(real);
    expect((await geocodificar('Calle', 'Madrid', { enLinea: () => true })).resultado).toMatchObject({ lat: 1, lon: 2, simulado: false });
  });
});

it('claveDireccion ignora mayúsculas, tildes y espacios (no se vuelve a geocodificar si no cambia, §13.3)', () => {
  expect(claveDireccion(' Calle  Mayor 3', 'Alcalá de Henares')).toBe(claveDireccion('calle mayor 3', 'ALCALA DE HENARES'));
  expect(claveDireccion('Calle Mayor 3', 'Madrid')).not.toBe(claveDireccion('Calle Mayor 4', 'Madrid'));
});

it('por defecto, el simulado sólo en desarrollo y pruebas (o activado a mano); en producción no hay servicio', async () => {
  const { usarGeocodificacionSimulada } = await import('../../src/geocodificacion');
  expect(import.meta.env.MODE).toBe('test');
  expect(usarGeocodificacionSimulada()).toBe(true);
  configurarGeocodificador(undefined);
  expect(geocodificadorActual()?.nombre).toBe('simulado');
});
