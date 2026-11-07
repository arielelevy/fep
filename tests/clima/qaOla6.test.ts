// QA de la ola 6: correcciones del /code-review en el motor y el servicio del clima.
import { describe, expect, it } from 'vitest';
import { evaluarVisita } from '../../src/clima/semaforo';
import { almacenLocal } from '../../src/clima/servicio';
import type { HoraClima, Prevision, VisitaClima } from '../../src/clima/tipos';
import { claveDia, sumarDias } from '../../src/lib/fechas';

const AHORA = new Date('2026-11-07T08:00:00Z');
const HOY = claveDia(AHORA);
const DIA = sumarDias(HOY, 2);
const U = { lat: 40.42, lon: -3.7 };

function prevision(cambios: Record<string, Partial<HoraClima>> = {}): Prevision {
  const horas: HoraClima[] = [];
  for (let d = -1; d < 16; d++) {
    for (let h = 0; h < 24; h++) {
      const hora = `${sumarDias(HOY, d)}T${String(h).padStart(2, '0')}`;
      horas.push({ hora, prob_precipitacion: 0, precipitacion: 0, codigo_wmo: 0, temperatura: 20, viento: 5, rachas: 8, ...cambios[hora] });
    }
  }
  return { ubicacion: U, horas, dias: [], actualizado_en: AHORA.toISOString(), fuente: 'prueba' };
}

describe('Etiqueta ámbar «Lluvia a partir de las …»', () => {
  it('nombra la primera hora con lluvia, no la de mayor probabilidad', () => {
    // Setos 09:00–13:00: llueve (0,2 mm) desde las 10:00; la mayor probabilidad (65 %) es a las 12:00.
    const v: VisitaClima = { fecha: DIA, hora_inicio: '09:00', duracion: 240, tipos_trabajo: ['setos_poda'] };
    const p = prevision({
      [`${DIA}T10`]: { prob_precipitacion: 40, precipitacion: 0.2, codigo_wmo: 61 },
      [`${DIA}T12`]: { prob_precipitacion: 65, precipitacion: 0.3, codigo_wmo: 61 },
    });
    const s = evaluarVisita({ visita: v, ubicacion: U, prevision: p, ahora: AHORA });
    expect(s.nivel).toBe('ambar');
    expect(s.etiqueta).toBe('Lluvia a partir de las 10:00');
  });
});

describe('almacenLocal', () => {
  it('lee de localStorage una vez y después sirve lo leído desde memoria', () => {
    const p = prevision();
    window.localStorage.setItem('qa6.k', JSON.stringify(p));
    const a = almacenLocal('qa6.');
    const primera = a.leer('k');
    expect(primera?.actualizado_en).toBe(p.actualizado_en);
    expect(a.leer('k')).toBe(primera); // mismo objeto: no se vuelve a parsear
    expect(a.leer('otra')).toBeNull();
    window.localStorage.removeItem('qa6.k');
  });
});
