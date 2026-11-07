// Informes (§10.9): cálculos de las cinco tarjetas con datos de ejemplo.
import { describe, expect, it } from 'vitest';
import { alquilerFurgoneta, anchoBarra, crecimiento, gastoPorCategoria, ganadoPorMes, margenesPorCliente, mesesHasta } from './calculos';
import { CATS, cliente, mov } from './ejemplo.test-util';

const MES = '2026-11';

describe('ganadoPorMes (§9.3)', () => {
  it('da 12 meses hasta el actual, con meses negativos y sin contar inversión, aportes ni borrados', () => {
    const movs = [
      mov('cobro', 10000, '2026-11-02', { cliente_id: 'a' }),
      mov('gasto', 3850, '2026-11-03', { categoria_id: 'c-gas' }),
      mov('gasto', 20000, '2026-11-04', { categoria_id: 'c-her', es_inversion: true }),
      mov('aporte', 50000, '2026-11-04'),
      mov('gasto', 12000, '2026-10-10', { categoria_id: 'c-gas' }),
      mov('cobro', 99999, '2026-10-10', { eliminado_en: '2026-10-11T00:00:00Z' }),
      mov('cobro', 5000, '2025-11-30'),
      mov('cobro', 7000, '2025-10-31'), // fuera de los 12 meses
    ];
    const r = ganadoPorMes(movs, MES);
    expect(r).toHaveLength(12);
    expect(r[0]).toEqual({ mes: '2025-12', ganado: 0 });
    expect(r[11]).toEqual({ mes: '2026-11', ganado: 6150 });
    expect(r[10]).toEqual({ mes: '2026-10', ganado: -12000 });
    expect(mesesHasta('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('gastoPorCategoria', () => {
  it('suma los gastos del mes por categoría, de mayor a menor', () => {
    const movs = [
      mov('gasto', 3000, '2026-11-01', { categoria_id: 'c-gas' }),
      mov('gasto', 2000, '2026-11-05', { categoria_id: 'c-gas' }),
      mov('gasto', 9000, '2026-11-06', { categoria_id: 'c-alq' }),
      mov('gasto', 25000, '2026-11-06', { categoria_id: 'c-her', es_inversion: true }),
      mov('gasto', 4000, '2026-10-30', { categoria_id: 'c-gas' }),
      mov('cobro', 4000, '2026-11-01'),
    ];
    const r = gastoPorCategoria(movs, CATS, MES);
    expect(r.map((x) => [x.nombre, x.importe])).toEqual([
      ['Herramientas y equipos nuevos', 25000],
      ['Alquiler de furgoneta', 9000],
      ['Gasolina (vehículo)', 5000],
    ]);
    expect(r[0].esInversion).toBe(true);
    expect(gastoPorCategoria(movs, CATS, '2026-09')).toEqual([]);
  });
});

describe('margenesPorCliente (§9.5)', () => {
  it('cobros − gastos imputados en el año, de mayor a menor; deja fuera los que no tienen movimientos', () => {
    const clientes = [cliente('a', 'Fam. García'), cliente('b', 'Sra. Morales'), cliente('c', 'Sin nada')];
    const movs = [
      mov('cobro', 6000, '2026-03-01', { cliente_id: 'a' }),
      mov('anticipo', 2000, '2026-04-01', { cliente_id: 'a' }),
      mov('gasto', 4500, '2026-04-02', { cliente_id: 'a', categoria_id: 'c-alq' }),
      mov('cobro', 12000, '2026-11-01', { cliente_id: 'b' }),
      mov('cobro', 50000, '2025-12-31', { cliente_id: 'a' }), // año anterior
    ];
    const r = margenesPorCliente(movs, clientes, MES);
    expect(r.map((x) => [x.nombre, x.cobrado, x.gastado, x.margen])).toEqual([
      ['Sra. Morales', 12000, 0, 12000],
      ['Fam. García', 8000, 4500, 3500],
    ]);
  });
});

describe('alquilerFurgoneta (§9.7)', () => {
  it('suma 3, 6 y 12 meses (incluido el actual) y la media mensual', () => {
    const movs = [
      mov('gasto', 9000, '2026-11-02', { categoria_id: 'c-alq' }),
      mov('gasto', 4500, '2026-09-15', { categoria_id: 'c-alq' }),
      mov('gasto', 6000, '2026-08-15', { categoria_id: 'c-alq' }),
      mov('gasto', 3000, '2025-12-01', { categoria_id: 'c-alq' }),
      mov('gasto', 7777, '2025-11-30', { categoria_id: 'c-alq' }), // 13 meses atrás
      mov('gasto', 5000, '2026-11-02', { categoria_id: 'c-gas' }),
    ];
    expect(alquilerFurgoneta(movs, CATS, MES)).toEqual([
      { meses: 3, total: 13500, media: 4500 },
      { meses: 6, total: 19500, media: 3250 },
      { meses: 12, total: 22500, media: 1875 },
    ]);
  });
});

describe('crecimiento (§9.8)', () => {
  it('ingresos del año, media por mes transcurrido, clientes activos y de abono', () => {
    const clientes = [
      cliente('a', 'A', { modalidad: 'abono', cuota_abono: 9000 }),
      cliente('b', 'B'),
      cliente('c', 'C', { activo: false, modalidad: 'abono' }),
      cliente('d', 'D', { eliminado_en: '2026-01-01T00:00:00Z' }),
    ];
    const movs = [
      mov('cobro', 30000, '2026-01-10'),
      mov('otro_ingreso', 2000, '2026-06-10'),
      mov('anticipo', 1000, '2026-11-01'),
      mov('aporte', 50000, '2026-02-01'),
      mov('cobro', 40000, '2025-12-31'),
    ];
    const c = crecimiento(movs, clientes, MES);
    expect(c.ingresosAnio).toBe(33000);
    expect(c.mediaMensual).toBe(3000); // 33.000 / 11 meses
    expect(c.clientesActivos).toBe(2);
    expect(c.clientesAbono).toBe(1);
    expect(c.porMes).toHaveLength(11);
    expect(c.porMes[0]).toEqual({ mes: '2026-01', ingresos: 30000 });
  });

  it('ancho de barra proporcional al mayor valor absoluto', () => {
    expect(anchoBarra(-50, 100)).toBe(50);
    expect(anchoBarra(1, 1000)).toBe(2);
    expect(anchoBarra(0, 100)).toBe(0);
  });
});
