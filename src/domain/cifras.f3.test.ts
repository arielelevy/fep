import { describe, expect, it } from 'vitest';
import {
  calcularAportes,
  calcularEnCaja,
  calcularGanado,
  desgloseEnCaja,
  efectoEnCaja,
  efectoEnGanado,
  esImporteAtipico,
  resumenMes,
} from './cifras';
import type { MedioPago, Movimiento, TipoMovimiento } from './tipos';

// Feature 3 (frente B). Cálculo de "En caja" y "Ganado" (§9.1, §9.3), en céntimos enteros,
// con borrado lógico y deshacer. Importes atípicos (§10.2.3.6, criterio 8).

let n = 0;
function mov(tipo: TipoMovimiento, importe: number, extra: Partial<Movimiento> = {}): Movimiento {
  const fecha = extra.fecha ?? '2026-10-11T10:00:00.000Z';
  return {
    id: `m${++n}`,
    negocio_id: 'n',
    creado_en: fecha,
    actualizado_en: fecha,
    creado_por: 'u',
    modificado_por: 'u',
    eliminado_en: null,
    version: 1,
    tipo,
    importe,
    fecha,
    categoria_id: tipo === 'gasto' ? 'gasolina' : null,
    medio_pago: 'efectivo' as MedioPago,
    cliente_id: null,
    nota: '',
    foto_id: null,
    es_inversion: false,
    con_iva: null,
    base: null,
    cuota_iva: null,
    ...extra,
  };
}

const OCTUBRE = '2026-10';

describe('Efecto de cada tipo de movimiento (§9.1)', () => {
  const casos: [TipoMovimiento, number, number][] = [
    // tipo, efecto en caja, efecto en Ganado (para 100 €)
    ['gasto', -10000, -10000],
    ['cobro', 10000, 10000],
    ['anticipo', 10000, 10000],
    ['otro_ingreso', 10000, 10000],
    ['aporte', 10000, 0],
    ['prestamo', 10000, 0],
    ['devolucion_prestamo', -10000, 0],
    ['fianza_entregada', -10000, 0],
    ['fianza_devuelta', 10000, 0],
    ['saldo_inicial', 10000, 0],
  ];
  it.each(casos)('%s: caja %i, Ganado %i', (tipo, caja, ganado) => {
    const m = mov(tipo, 10000);
    expect(efectoEnCaja(m)).toBe(caja);
    expect(efectoEnGanado(m)).toBe(ganado);
  });

  it('un gasto de inversión resta en caja pero no en Ganado', () => {
    const m = mov('gasto', 12000, { es_inversion: true });
    expect(efectoEnCaja(m)).toBe(-12000);
    expect(efectoEnGanado(m)).toBe(0);
  });
});

describe('"En caja" (§9.3)', () => {
  it('suma entradas y resta salidas desde el inicio, de cualquier mes', () => {
    const movs = [
      mov('saldo_inicial', 50000, { fecha: '2026-08-01T10:00:00.000Z' }),
      mov('gasto', 3850, { fecha: '2026-09-15T10:00:00.000Z' }),
      mov('cobro', 6000),
      mov('aporte', 50000),
      mov('fianza_entregada', 15000),
      mov('gasto', 12000, { es_inversion: true }),
    ];
    expect(calcularEnCaja(movs)).toBe(50000 - 3850 + 6000 + 50000 - 15000 - 12000);
  });

  it('sin movimientos es 0', () => {
    expect(calcularEnCaja([])).toBe(0);
  });

  it('se mantiene en céntimos enteros con muchos importes con decimales', () => {
    const movs = Array.from({ length: 1000 }, () => mov('gasto', 10)); // 1000 gastos de 0,10 €
    movs.push(mov('cobro', 20)); // 0,20 €
    const caja = calcularEnCaja(movs);
    expect(Number.isInteger(caja)).toBe(true);
    expect(caja).toBe(-10000 + 20);
  });

  it('ignora los movimientos con borrado lógico', () => {
    const borrado = mov('gasto', 3850, { eliminado_en: '2026-10-11T11:00:00.000Z' });
    expect(calcularEnCaja([mov('saldo_inicial', 50000), borrado])).toBe(50000);
  });

  it('desglose: efectivo y banco (Bizum, tarjeta y transferencia van a banco)', () => {
    const movs = [
      mov('saldo_inicial', 30000, { medio_pago: 'efectivo' }),
      mov('saldo_inicial', 90000, { medio_pago: 'transferencia' }),
      mov('gasto', 1000, { medio_pago: 'bizum' }),
      mov('gasto', 2000, { medio_pago: 'tarjeta' }),
      mov('gasto', 500, { medio_pago: 'efectivo' }),
    ];
    const d = desgloseEnCaja(movs);
    expect(d).toEqual({ efectivo: 29500, banco: 87000 });
    expect(d.efectivo + d.banco).toBe(calcularEnCaja(movs));
  });
});

describe('"Ganado en [mes]" (§9.3)', () => {
  it('cobros + anticipos + otros ingresos − gastos no inversión del mes', () => {
    const movs = [
      mov('cobro', 6000),
      mov('anticipo', 2000),
      mov('otro_ingreso', 1000),
      mov('gasto', 3850),
      mov('gasto', 12000, { es_inversion: true }),
      mov('aporte', 50000),
      mov('saldo_inicial', 50000),
      mov('fianza_entregada', 15000),
      mov('prestamo', 30000),
    ];
    expect(calcularGanado(movs, OCTUBRE)).toBe(6000 + 2000 + 1000 - 3850);
  });

  it('sólo cuenta el mes natural pedido', () => {
    const movs = [mov('gasto', 3850, { fecha: '2026-09-30T10:00:00.000Z' }), mov('gasto', 1000)];
    expect(calcularGanado(movs, OCTUBRE)).toBe(-1000);
    expect(calcularGanado(movs, '2026-09')).toBe(-3850);
  });

  it('usa el mes de Madrid, no el de UTC', () => {
    // 31/10 23:30 UTC ya es 1 de noviembre a las 00:30 en Madrid (UTC+1 tras el cambio de hora).
    const m = mov('gasto', 1000, { fecha: '2026-10-31T23:30:00.000Z' });
    expect(calcularGanado([m], OCTUBRE)).toBe(0);
    expect(calcularGanado([m], '2026-11')).toBe(-1000);
    // 30/09 22:30 UTC es 1 de octubre a las 00:30 en Madrid (UTC+2 en verano).
    const s = mov('gasto', 500, { fecha: '2026-09-30T22:30:00.000Z' });
    expect(calcularGanado([s], OCTUBRE)).toBe(-500);
  });

  it('puede ser negativo', () => {
    expect(calcularGanado([mov('gasto', 12000)], OCTUBRE)).toBe(-12000);
  });

  it('ignora los movimientos con borrado lógico', () => {
    const movs = [mov('cobro', 6000), mov('gasto', 3850, { eliminado_en: 'x' })];
    expect(calcularGanado(movs, OCTUBRE)).toBe(6000);
  });
});

describe('Criterios 2 y 3 sobre las cifras (gasto y deshacer)', () => {
  const base = [mov('saldo_inicial', 50000), mov('cobro', 9000), mov('gasto', 1500)];

  it('criterio 2: un gasto baja "En caja" y "Ganado" por ese importe', () => {
    const cajaAntes = calcularEnCaja(base);
    const ganadoAntes = calcularGanado(base, OCTUBRE);
    const conGasto = [...base, mov('gasto', 3850)];
    expect(calcularEnCaja(conGasto)).toBe(cajaAntes - 3850);
    expect(calcularGanado(conGasto, OCTUBRE)).toBe(ganadoAntes - 3850);
  });

  it('criterio 3: deshacer (borrado lógico del gasto) devuelve las cifras al valor anterior', () => {
    const cajaAntes = calcularEnCaja(base);
    const ganadoAntes = calcularGanado(base, OCTUBRE);
    const gasto = mov('gasto', 3850);
    const deshecho = [...base, { ...gasto, eliminado_en: '2026-10-11T10:00:05.000Z', version: 2 }];
    expect(calcularEnCaja(deshecho)).toBe(cajaAntes);
    expect(calcularGanado(deshecho, OCTUBRE)).toBe(ganadoAntes);
  });

  it('deshacer un borrado (eliminado_en vuelve a null) recupera el efecto', () => {
    const gasto = mov('gasto', 3850);
    const borrado = { ...gasto, eliminado_en: 'x' };
    const restaurado = { ...borrado, eliminado_en: null };
    expect(calcularEnCaja([...base, restaurado])).toBe(calcularEnCaja([...base, gasto]));
    expect(calcularGanado([...base, restaurado], OCTUBRE)).toBe(calcularGanado([...base, gasto], OCTUBRE));
  });
});

describe('Tarjetas del mes y aportes', () => {
  it('Cobrado, Gastado (sin inversiones) e inversión aparte (§10.3.2)', () => {
    const movs = [mov('cobro', 6000), mov('anticipo', 1000), mov('gasto', 3850), mov('gasto', 12000, { es_inversion: true }), mov('aporte', 50000)];
    expect(resumenMes(movs, OCTUBRE)).toEqual({ cobrado: 7000, gastado: 3850, inversion: 12000 });
  });

  it('Aportes: total histórico, sin préstamos ni borrados', () => {
    const movs = [mov('aporte', 50000, { fecha: '2026-01-01T10:00:00.000Z' }), mov('aporte', 10000), mov('prestamo', 30000), mov('aporte', 999, { eliminado_en: 'x' })];
    expect(calcularAportes(movs)).toBe(60000);
  });
});

describe('Criterio 8: importes atípicos (§10.2.3.6)', () => {
  const media40 = [mov('gasto', 3500), mov('gasto', 4500), mov('gasto', 4000)]; // media 40 €

  it('3.850 € en una categoría con media de 40 € pide confirmación', () => {
    expect(esImporteAtipico(385000, 'gasolina', media40)).toBe(true);
  });

  it('justo 5 veces la media no se pregunta; un céntimo más sí', () => {
    expect(esImporteAtipico(20000, 'gasolina', media40)).toBe(false);
    expect(esImporteAtipico(20001, 'gasolina', media40)).toBe(true);
  });

  it('un importe habitual no se pregunta', () => {
    expect(esImporteAtipico(4200, 'gasolina', media40)).toBe(false);
  });

  it('sin historial en la categoría no se pregunta', () => {
    expect(esImporteAtipico(385000, 'gasolina', [])).toBe(false);
    expect(esImporteAtipico(385000, 'vertedero', media40)).toBe(false);
  });

  it('sólo cuenta gastos activos de esa categoría', () => {
    const movs = [
      mov('gasto', 4000),
      mov('gasto', 1_000_000, { eliminado_en: 'x' }), // borrado: no sube la media
      mov('gasto', 1_000_000, { categoria_id: 'herramientas' }), // otra categoría
      mov('cobro', 1_000_000, { categoria_id: 'gasolina' }), // no es gasto
    ];
    expect(esImporteAtipico(385000, 'gasolina', movs)).toBe(true);
  });

  it('al editar, el propio movimiento no cuenta para la media', () => {
    const editado = mov('gasto', 385000);
    const movs = [mov('gasto', 4000), editado];
    // Con el propio 3.850 € dentro, la media sería 1.945 € y no se preguntaría.
    expect(esImporteAtipico(385000, 'gasolina', movs)).toBe(false);
    expect(esImporteAtipico(385000, 'gasolina', movs, editado.id)).toBe(true);
  });
});
