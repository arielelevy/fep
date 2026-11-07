// Avisos AEMET simulados en formato tipo CAP (sin llamar a AEMET real).
import { describe, expect, it } from 'vitest';
import { avisosDesdeCap, crearProveedorAemetSimulado, dentroDePoligono, proveedorAemetPorDefecto } from './aemet';
import { avisoCap, POLIGONO_METROPOLITANA, POLIGONO_SIERRA } from './fixtures/aemet';

const MADRID = { lat: 40.42, lon: -3.7 };
const SIERRA = { lat: 40.75, lon: -4.0 };

it('punto en polígono', () => {
  expect(dentroDePoligono(MADRID, POLIGONO_METROPOLITANA)).toBe(true);
  expect(dentroDePoligono(SIERRA, POLIGONO_METROPOLITANA)).toBe(false);
  expect(dentroDePoligono(SIERRA, POLIGONO_SIERRA)).toBe(true);
});

describe('avisosDesdeCap', () => {
  it('un aviso por día que cubre (hora de Madrid), sólo en su zona', () => {
    const cap = [avisoCap({ id: 'a1', nivel: 'amarillo', fenomeno: 'VI', onset: '2026-11-09T12:00:00+01:00', expires: '2026-11-11T00:00:00+01:00' })];
    expect(avisosDesdeCap(cap, MADRID, '2026-11-07', '2026-11-20')).toEqual([
      { fecha: '2026-11-09', nivel: 'amarillo', fenomeno: 'viento' },
      { fecha: '2026-11-10', nivel: 'amarillo', fenomeno: 'viento' },
    ]);
    expect(avisosDesdeCap(cap, SIERRA, '2026-11-07', '2026-11-20')).toEqual([]);
    expect(avisosDesdeCap(cap, MADRID, '2026-11-10', '2026-11-10')).toHaveLength(1);
  });
  it('fenómenos de §13.4 (viento, lluvia, tormenta, calor, nieve); el resto, verdes, pruebas y cancelaciones se ignoran', () => {
    const base = { onset: '2026-11-09T00:00:00+01:00', expires: '2026-11-10T00:00:00+01:00' };
    const cap = [
      avisoCap({ id: '1', nivel: 'naranja', fenomeno: 'PR', ...base }),
      avisoCap({ id: '2', nivel: 'amarillo', fenomeno: 'TO', ...base }),
      avisoCap({ id: '3', nivel: 'rojo', fenomeno: 'TM', ...base }),
      avisoCap({ id: '4', nivel: 'amarillo', fenomeno: 'NE', ...base }),
      avisoCap({ id: '5', nivel: 'rojo', fenomeno: 'PO', ...base }),
      avisoCap({ id: '6', nivel: 'verde', fenomeno: 'VI', ...base }),
      avisoCap({ id: '7', nivel: 'rojo', fenomeno: 'VI', ...base, status: 'Test' }),
      avisoCap({ id: '8', nivel: 'rojo', fenomeno: 'VI', ...base, msgType: 'Cancel' }),
    ];
    expect(avisosDesdeCap(cap, MADRID, '2026-11-07', '2026-11-20').map((a) => `${a.fenomeno}:${a.nivel}`)).toEqual(['calor:rojo', 'lluvia:naranja', 'nieve:amarillo', 'tormenta:amarillo']);
  });
  it('si dos avisos del mismo fenómeno se pisan, queda el nivel más alto', () => {
    const cap = [
      avisoCap({ id: '1', nivel: 'amarillo', fenomeno: 'VI', onset: '2026-11-09T00:00:00+01:00', expires: '2026-11-10T00:00:00+01:00' }),
      avisoCap({ id: '2', nivel: 'naranja', fenomeno: 'VI', onset: '2026-11-09T15:00:00+01:00', expires: '2026-11-09T21:00:00+01:00' }),
    ];
    expect(avisosDesdeCap(cap, MADRID, '2026-11-07', '2026-11-20')).toEqual([{ fecha: '2026-11-09', nivel: 'naranja', fenomeno: 'viento' }]);
  });
});

it('proveedor simulado sin red; en la app real no hay proveedor de avisos', async () => {
  const p = crearProveedorAemetSimulado([avisoCap({ id: '1', nivel: 'amarillo', fenomeno: 'VI', onset: '2026-11-09T00:00:00+01:00', expires: '2026-11-10T00:00:00+01:00' })]);
  expect(await p.avisos(MADRID, '2026-11-07', '2026-11-20')).toEqual([{ fecha: '2026-11-09', nivel: 'amarillo', fenomeno: 'viento' }]);
  expect(proveedorAemetPorDefecto()).toBeNull();
});
