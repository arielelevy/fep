import { describe, expect, it } from 'vitest';
import { calcularEnCaja, calcularEnFianzas, calcularGanado, calcularPrestamoPendiente, fianzas, margenCliente } from './cifras';
import { calcularPendientes, cuotasVencidas, diasEntre, nivelAntiguedad, repartirCobro, textoAntiguedad, totalPendiente } from './pendientes';
import type { Cliente, Deuda, Movimiento, TipoMovimiento } from './tipos';

const comunes = { negocio_id: 'n', actualizado_en: '', creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1 };
let n = 0;
function mov(tipo: TipoMovimiento, importe: number, extra: Partial<Movimiento> = {}): Movimiento {
  n += 1;
  return {
    id: `m${n}`, ...comunes, creado_en: '2026-11-01T10:00:00Z', tipo, importe, fecha: '2026-11-05T10:00:00Z',
    categoria_id: null, medio_pago: 'efectivo', cliente_id: null, nota: '', foto_id: null, es_inversion: false,
    con_iva: null, base: null, cuota_iva: null, ...extra,
  };
}
const cliente = (extra: Partial<Cliente> = {}): Cliente => ({
  id: 'c1', ...comunes, creado_en: '2026-09-10T10:00:00Z', nombre: 'Fam. García', tipo: 'particular', telefono: null, telefono_2: null,
  contacto: '', direccion: '', municipio: '', lat: null, lon: null, servicios: ['jardin'], modalidad: 'abono', cuota_abono: 9000,
  dia_cobro_abono: 1, frecuencia_visitas: 'quincenal', dias_preferidos: [], hora_preferida: null, duracion_habitual: 120,
  tipos_trabajo_habituales: [], precio_habitual: null, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0,
  notas: '', activo: true, ...extra,
});
const deuda = (extra: Partial<Deuda> = {}): Deuda => ({ id: 'd1', ...comunes, creado_en: '', cliente_id: 'c1', concepto: 'Poda de setos', importe: 15000, fecha: '2026-11-01T10:00:00Z', visita_id: null, ...extra });
const ahora = new Date('2026-11-07T10:00:00Z');

describe('Antigüedad de pendientes (§9.4, criterio 11)', () => {
  it('hasta 6 días neutro, de 7 a 14 ámbar, 15 o más rojo', () => {
    expect([0, 6, 7, 14, 15, 40].map(nivelAntiguedad)).toEqual(['neutro', 'neutro', 'ambar', 'ambar', 'rojo', 'rojo']);
    expect(textoAntiguedad(11)).toBe('hace 11 días');
    expect(textoAntiguedad(1)).toBe('hace 1 día');
    expect(diasEntre('2026-10-31', '2026-11-07')).toBe(7);
    expect(diasEntre('2026-03-28', '2026-03-30')).toBe(2); // cambio de hora en Madrid
  });
});

describe('Cuotas de abono vencidas (§9.4)', () => {
  it('genera el cobro esperado el día de cobro de cada mes desde el alta', () => {
    expect(cuotasVencidas(cliente(), '2026-11-07')).toEqual([
      { periodo: '2026-10', vence: '2026-10-01' },
      { periodo: '2026-11', vence: '2026-11-01' },
    ]);
    // Antes del día de cobro, el mes aún no vence.
    expect(cuotasVencidas(cliente({ dia_cobro_abono: 10 }), '2026-11-07').map((c) => c.periodo)).toEqual(['2026-09', '2026-10']);
  });

  it('no genera nada para clientes puntuales, inactivos o sin cuota', () => {
    expect(cuotasVencidas(cliente({ modalidad: 'puntual' }), '2026-11-07')).toEqual([]);
    expect(cuotasVencidas(cliente({ activo: false }), '2026-11-07')).toEqual([]);
    expect(cuotasVencidas(cliente({ cuota_abono: null }), '2026-11-07')).toEqual([]);
  });
});

describe('Te deben (§9.3)', () => {
  it('suma cuotas vencidas y trabajos sin cobrar, menos lo saldado por los cobros', () => {
    const cobro = mov('cobro', 9000, { cliente_id: 'c1', saldos: [{ clave: 'abono:2026-10', importe: 9000 }], periodo_abono: '2026-10' });
    const parcial = mov('cobro', 5000, { cliente_id: 'c1', saldos: [{ clave: 'deuda:d1', importe: 5000 }] });
    const p = calcularPendientes([cliente()], [deuda()], [cobro, parcial], ahora);
    expect(p.map((x) => [x.concepto, x.pendiente])).toEqual([
      ['Abono de noviembre', 9000],
      ['Poda de setos', 10000],
    ]);
    expect(totalPendiente(p)).toBe(19000);
  });

  it('borrar el cobro devuelve el pendiente (todo sale de los cobros activos)', () => {
    const cobro = mov('cobro', 15000, { cliente_id: 'c1', saldos: [{ clave: 'deuda:d1', importe: 15000 }], eliminado_en: '2026-11-06T00:00:00Z' });
    expect(totalPendiente(calcularPendientes([], [deuda()], [cobro], ahora))).toBe(15000);
  });

  it('reparte un cobro del pendiente más antiguo al más reciente', () => {
    const p = calcularPendientes([cliente()], [deuda()], [], ahora);
    // Octubre y noviembre del abono (vencen el 1) y la poda (del 1-nov): primero lo más antiguo.
    expect(repartirCobro(20000, p)).toEqual([
      { clave: 'abono:2026-10', importe: 9000 },
      { clave: 'abono:2026-11', importe: 9000 },
      { clave: 'deuda:d1', importe: 2000 },
    ]);
  });
});

describe('Fianzas y préstamos (§9.1, §9.6)', () => {
  it('fianza devuelta con descuento: En fianzas vuelve a 0 y el descuento resta en Ganado', () => {
    const entrega = mov('fianza_entregada', 15000, { id: 'f1' });
    const devolucion = mov('fianza_devuelta', 12000, { fianza_id: 'f1' });
    const descuento = mov('gasto', 3000, { fianza_id: 'f1', nota: 'Descuento de fianza' });
    expect(calcularEnFianzas([entrega])).toBe(15000);
    expect(calcularEnFianzas([entrega, devolucion, descuento])).toBe(0);
    expect(fianzas([entrega, devolucion, descuento])[0].estado).toBe('devuelta_parcial');
    // El descuento ya estaba fuera de caja desde la entrega: no resta otra vez (§9.1).
    expect(calcularEnCaja([entrega, devolucion, descuento])).toBe(-15000 + 12000);
    expect(calcularGanado([entrega, devolucion, descuento], '2026-11')).toBe(-3000);
  });

  it('préstamo pendiente baja con las devoluciones y no cuenta en Ganado', () => {
    const prestamo = mov('prestamo', 30000, { id: 'p1' });
    const devolucion = mov('devolucion_prestamo', 10000, { prestamo_id: 'p1' });
    expect(calcularPrestamoPendiente([prestamo, devolucion])).toBe(20000);
    expect(calcularGanado([prestamo, devolucion], '2026-11')).toBe(0);
    expect(calcularEnCaja([prestamo, devolucion])).toBe(20000);
  });

  it('margen por cliente: cobros del cliente menos gastos imputados (§9.5)', () => {
    const movs = [mov('cobro', 81000, { cliente_id: 'c1' }), mov('gasto', 21400, { cliente_id: 'c1' }), mov('gasto', 999, { cliente_id: 'otro' })];
    expect(margenCliente(movs, 'c1', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z')).toEqual({ cobrado: 81000, gastado: 21400, margen: 59600 });
  });
});
