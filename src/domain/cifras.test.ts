import { describe, expect, it } from 'vitest';
import {
  calcularAportes, calcularEnCaja, calcularEnFianzas, calcularGanado, desgloseEnCaja, esImporteAtipico, resumenMes,
} from './cifras';
import type { Movimiento, TipoMovimiento } from './tipos';

let n = 0;
function mov(tipo: TipoMovimiento, importe: number, extra: Partial<Movimiento> = {}): Movimiento {
  n += 1;
  return {
    id: `m${n}`, negocio_id: 'n', creado_en: '2026-10-01T00:00:00Z', actualizado_en: '2026-10-01T00:00:00Z',
    creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1,
    tipo, importe, fecha: '2026-10-11T10:00:00Z', categoria_id: tipo === 'gasto' ? 'gasolina' : null,
    medio_pago: 'efectivo', cliente_id: null, nota: '', foto_id: null, es_inversion: false,
    con_iva: null, base: null, cuota_iva: null, ...extra,
  };
}

describe('En caja (§9.3)', () => {
  it('suma entradas y resta salidas en céntimos enteros', () => {
    const movs = [mov('saldo_inicial', 50000), mov('gasto', 3850), mov('gasto', 1), mov('cobro', 6000)];
    const enCaja = calcularEnCaja(movs);
    expect(enCaja).toBe(50000 - 3850 - 1 + 6000);
    expect(Number.isInteger(enCaja)).toBe(true);
  });

  it('suma exacta de muchos céntimos (sin errores de coma flotante)', () => {
    const movs = Array.from({ length: 10 }, () => mov('gasto', 10)); // 10 × 0,10 €
    expect(calcularEnCaja(movs)).toBe(-100);
  });

  it('ignora los movimientos con borrado lógico', () => {
    const movs = [mov('saldo_inicial', 10000), mov('gasto', 2000, { eliminado_en: '2026-10-11T11:00:00Z' })];
    expect(calcularEnCaja(movs)).toBe(10000);
  });

  it('cuenta aportes, préstamos y fianzas según §9.1', () => {
    const movs = [mov('aporte', 50000), mov('prestamo', 30000), mov('devolucion_prestamo', 10000), mov('fianza_entregada', 15000), mov('fianza_devuelta', 12000)];
    expect(calcularEnCaja(movs)).toBe(50000 + 30000 - 10000 - 15000 + 12000);
    expect(calcularAportes(movs)).toBe(50000);
    expect(calcularEnFianzas(movs)).toBe(3000);
  });

  it('desglosa efectivo y banco (Bizum, tarjeta y transferencia van a banco)', () => {
    const movs = [mov('saldo_inicial', 10000), mov('saldo_inicial', 40000, { medio_pago: 'transferencia' }), mov('gasto', 1000, { medio_pago: 'bizum' }), mov('gasto', 500)];
    expect(desgloseEnCaja(movs)).toEqual({ efectivo: 9500, banco: 39000 });
  });
});

describe('Ganado del mes (§9.3)', () => {
  it('resta gastos no inversión y no cuenta saldo inicial ni aportes', () => {
    const movs = [mov('saldo_inicial', 50000), mov('aporte', 20000), mov('gasto', 3850), mov('cobro', 6000)];
    expect(calcularGanado(movs, '2026-10')).toBe(6000 - 3850);
  });

  it('no resta las inversiones (herramientas y equipos)', () => {
    const movs = [mov('gasto', 12000, { es_inversion: true }), mov('gasto', 1000)];
    expect(calcularGanado(movs, '2026-10')).toBe(-1000);
    expect(resumenMes(movs, '2026-10')).toEqual({ cobrado: 0, gastado: 1000, inversion: 12000 });
  });

  it('solo cuenta el mes natural en Madrid', () => {
    const movs = [mov('gasto', 1000, { fecha: '2026-09-30T22:30:00Z' }), mov('gasto', 500, { fecha: '2026-09-30T21:00:00Z' })];
    // 22:30 UTC del 30-sep = 00:30 del 1-oct en Madrid
    expect(calcularGanado(movs, '2026-10')).toBe(-1000);
    expect(calcularGanado(movs, '2026-09')).toBe(-500);
  });

  it('puede ser negativo y vuelve al valor anterior al borrar (deshacer)', () => {
    const g = mov('gasto', 3850);
    expect(calcularGanado([g], '2026-10')).toBe(-3850);
    expect(calcularGanado([{ ...g, eliminado_en: '2026-10-11T10:00:05Z' }], '2026-10')).toBe(0);
  });
});

describe('Importe atípico (§10.2.3.6, criterio 8)', () => {
  it('pide confirmación con 3.850 € en una categoría con media de 40 €', () => {
    const movs = [mov('gasto', 3000), mov('gasto', 5000)]; // media 40 €
    expect(esImporteAtipico(385000, 'gasolina', movs)).toBe(true);
  });

  it('no pregunta hasta 5 veces la media ni sin historial', () => {
    const movs = [mov('gasto', 4000)];
    expect(esImporteAtipico(20000, 'gasolina', movs)).toBe(false); // justo 5 veces
    expect(esImporteAtipico(20001, 'gasolina', movs)).toBe(true);
    expect(esImporteAtipico(385000, 'otra', movs)).toBe(false);
  });

  it('excluye borrados y el propio movimiento que se edita', () => {
    const a = mov('gasto', 4000);
    const b = mov('gasto', 385000);
    expect(esImporteAtipico(385000, 'gasolina', [a, b], b.id)).toBe(true);
    expect(esImporteAtipico(385000, 'gasolina', [{ ...a, eliminado_en: 'x' }, b], b.id)).toBe(false);
  });
});
