// Propuesta de días y horas libres para mover (§10.7).
import { describe, expect, it } from 'vitest';
import type { Ubicacion } from '../../clima';
import type { Visita } from '../../domain/tipos';
import { desdeMadrid } from '../../lib/fechas';
import { combinar, previsionFija } from './fixtures/clima';
import { esHuecoLibre, horasLibres, NOTA_HORAS, proponerMover, type EntradaPropuesta } from './huecos';

const HOY = '2026-11-07'; // sábado
const AHORA = desdeMadrid(2026, 11, 7, 10);
const U: Ubicacion = { lat: 40.4, lon: -3.7 };

function visita(id: string, fecha: string, hora: string | null = '09:00', d: Partial<Visita> = {}): Visita {
  return {
    id, negocio_id: 'n', creado_en: '', actualizado_en: '', creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1,
    cliente_id: 'c1', fecha, hora_inicio: hora, duracion: 120, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: null,
    incluida_en_abono: true, requiere_vehiculo: false, ayudantes: 0, estado: 'programada', serie_id: null, fecha_serie: null,
    reprogramada_desde: null, motivo_reprogramacion: null, motivo_cancelacion: '', hecha_en: null, ...d,
  };
}
const enAlerta = visita('v', '2026-11-09'); // lunes 9, 09:00–11:00

describe('esHuecoLibre: duración + 30 min de desplazamiento', () => {
  const otras = [visita('o', '2026-11-10', '12:00', { duracion: 60 })]; // 12:00–13:00 → ocupa 11:30–13:30
  it.each([
    ['09:30', 120, true], // acaba 11:30
    ['09:31', 120, false],
    ['13:30', 60, true],
    ['13:29', 60, false],
    ['12:00', 30, false],
  ])('%s durante %i min → %s', (hora, dur, libre) => {
    expect(esHuecoLibre('2026-11-10', hora as string, dur as number, otras)).toBe(libre);
  });
  it('ignora la propia visita, las canceladas, las borradas y otros días', () => {
    const vs = [visita('yo', '2026-11-10', '09:00'), visita('c', '2026-11-10', '09:00', { estado: 'cancelada' }), visita('b', '2026-11-10', '09:00', { eliminado_en: 'x' }), visita('x', '2026-11-11', '09:00')];
    expect(esHuecoLibre('2026-11-10', '09:00', 120, vs, 'yo')).toBe(true);
  });
});

describe('proponerMover', () => {
  it('sin previsión (app real): 3 días siguientes con hueco, el primero sugerido, a la hora original', () => {
    const p = proponerMover({ visita: enAlerta, visitas: [enAlerta], cliente: { dias_preferidos: [] }, ahora: AHORA });
    expect(p.visita_id).toBe('v');
    expect(p.dias.map((d) => [d.fecha, d.texto_dia, d.hora, d.tiempo, d.sugerido])).toEqual([
      ['2026-11-10', 'Martes 10', '09:00', 'Sin previsión', true],
      ['2026-11-11', 'Miércoles 11', '09:00', 'Sin previsión', false],
      ['2026-11-12', 'Jueves 12', '09:00', 'Sin previsión', false],
    ]);
    expect(p.horas[0]).toMatchObject({ hora: '09:00', original: true, tiempo: 'Sin previsión' });
    expect(p.horas).toHaveLength(4);
    expect(p.nota_horas).toBe(NOTA_HORAS);
  });

  it('con previsión: prefiere verde, nunca rojo; ámbar sólo si no hay más', () => {
    const clima = {
      ubicacion: U,
      avisos: [],
      // martes 10 y miércoles 11 llueve toda la mañana y la tarde (rojo para césped); jueves 12 ámbar; resto verde.
      prevision: previsionFija(U, HOY, combinar(
        (h) => (h.startsWith('2026-11-10') || h.startsWith('2026-11-11') ? { prob_precipitacion: 90, precipitacion: 4 } : null),
        (h) => (h.startsWith('2026-11-12') ? { prob_precipitacion: 45 } : null),
      )),
    };
    const p = proponerMover({ visita: enAlerta, visitas: [enAlerta], cliente: undefined, clima, ahora: AHORA });
    expect(p.dias.map((d) => [d.fecha, d.semaforo, d.sugerido])).toEqual([
      ['2026-11-13', 'verde', true],
      // desde el sábado 14 (hoy + 7) ya no hay semáforo, sólo previsión orientativa: van detrás de los verdes
      ['2026-11-14', 'gris', false],
      ['2026-11-15', 'gris', false],
    ]);
    expect(p.dias[0].tiempo).toBe('Sol');
    expect(p.dias[1].tiempo).toBe('Previsión orientativa');
    expect(p.dias.some((d) => d.fecha === '2026-11-10' || d.fecha === '2026-11-11')).toBe(false);
  });

  it('salta días sin hueco y no propone horas que chocan', () => {
    // El martes 10 está lleno de 08:00 a 20:00; el miércoles 11, ocupado por la mañana.
    const lleno = [visita('a', '2026-11-10', '08:00', { duracion: 720 }), visita('b', '2026-11-11', '08:00', { duracion: 180 })];
    const e: EntradaPropuesta = { visita: enAlerta, visitas: [enAlerta, ...lleno], cliente: undefined, ahora: AHORA };
    const p = proponerMover(e);
    expect(p.dias[0].fecha).toBe('2026-11-11');
    expect(p.dias[0].hora).toBe('11:30'); // 08:00–11:00 + 30 min
    expect(p.dias.map((d) => d.fecha)).not.toContain('2026-11-10');
    for (const h of horasLibres(e, '2026-11-11', 20)) expect(esHuecoLibre('2026-11-11', h.hora, 120, lleno)).toBe(true);
    expect(horasLibres(e, '2026-11-11')[0].original).toBe(false);
  });

  it('respeta los días preferidos del cliente y completa con otros marcados', () => {
    const p = proponerMover({ visita: enAlerta, visitas: [enAlerta], cliente: { dias_preferidos: [3] }, ahora: AHORA }); // miércoles
    expect(p.dias.map((d) => [d.fecha, d.fuera_de_preferidos])).toEqual([
      ['2026-11-11', false],
      ['2026-11-18', false],
      ['2026-11-10', true],
    ]);
  });

  it('horas: la original primero si está libre; hora razonable (08:00–18:00, fin ≤ 20:00)', () => {
    const e: EntradaPropuesta = { visita: visita('v', '2026-11-09', '16:00', { duracion: 180 }), visitas: [], cliente: undefined, ahora: AHORA };
    const hs = horasLibres(e, '2026-11-10', 100);
    expect(hs[0]).toMatchObject({ hora: '16:00', original: true });
    expect(hs.map((h) => h.hora)).not.toContain('17:30'); // acabaría 20:30
    expect(hs.map((h) => h.hora)).not.toContain('07:30');
    expect(hs.at(-1)!.hora).toBe('17:00');
  });
});
