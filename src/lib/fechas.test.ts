import { describe, expect, it } from 'vitest';
import { claveDia, claveMes, desdeMadrid, encabezadoDia, etiquetaFechaCorta, fechaLarga, instanteDeClaveDia, sumarMeses } from './fechas';

describe('fechas en Europe/Madrid (§4.3)', () => {
  it('asigna el mes según la hora de Madrid, no la UTC', () => {
    // 31 oct 2026 23:30 UTC = 1 nov 00:30 en Madrid (horario de invierno, UTC+1)
    expect(claveMes('2026-10-31T23:30:00Z')).toBe('2026-11');
    expect(claveDia('2026-10-31T23:30:00Z')).toBe('2026-11-01');
    // 30 jun 22:30 UTC = 1 jul 00:30 en Madrid (verano, UTC+2)
    expect(claveMes('2026-06-30T22:30:00Z')).toBe('2026-07');
  });

  it('escribe la fecha larga en español', () => {
    expect(fechaLarga('2026-10-11T10:00:00Z')).toBe('Domingo, 11 de octubre');
  });

  it('convierte hora local de Madrid a instante, también en el cambio de hora', () => {
    expect(desdeMadrid(2026, 10, 11, 12, 0).toISOString()).toBe('2026-10-11T10:00:00.000Z');
    expect(desdeMadrid(2026, 1, 15, 9, 30).toISOString()).toBe('2026-01-15T08:30:00.000Z');
    expect(claveDia(instanteDeClaveDia('2026-03-29'))).toBe('2026-03-29');
  });

  it('nombra los grupos de Movimientos como la maqueta', () => {
    const ahora = new Date('2026-10-11T10:00:00Z');
    expect(encabezadoDia('2026-10-11', ahora)).toBe('HOY');
    expect(encabezadoDia('2026-10-10', ahora)).toBe('AYER');
    expect(encabezadoDia('2026-10-07', ahora)).toBe('MIÉRCOLES 7');
    expect(etiquetaFechaCorta('2026-10-11', ahora)).toBe('Hoy');
    expect(etiquetaFechaCorta('2026-10-08', ahora)).toBe('Jue 8 oct');
  });

  it('suma meses cruzando el año', () => {
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
  });
});
