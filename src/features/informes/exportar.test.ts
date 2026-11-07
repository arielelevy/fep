// Exportación (§15): filas de cada hoja, CSV es-ES y .xlsx válido (zip STORE leído a mano, con CRC).
import { describe, expect, it } from 'vitest';
import {
  aCsv,
  crc32,
  crearXlsx,
  filasClientes,
  filasFianzas,
  filasMovimientos,
  filasPrestamos,
  filasVisitas,
  hojasExportacion,
  importeConSigno,
  letraColumna,
  serieExcel,
} from './exportar';
import { CATS, cliente, leerZip, mov, visita } from './ejemplo.test-util';

const ANIO = { desde: '2026-01-01', hasta: '2026-12-31' };

function escena() {
  const clientes = [
    cliente('a', 'Fam. García', { notas: 'Perro; llamar "antes"' }),
    cliente('b', 'Chalet Las Encinas', { modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 5, servicios: ['piscina'] }),
    cliente('z', 'Borrado', { eliminado_en: '2026-02-01T00:00:00Z' }),
  ];
  const fianza = mov('fianza_entregada', 15000, '2026-03-01', { fianza: { entregada_a: 'Alquileres Sur', motivo: 'Furgoneta' } });
  const prestamo = mov('prestamo', 30000, '2026-02-01', { medio_pago: 'transferencia' });
  const movs = [
    mov('saldo_inicial', 100000, '2026-01-01'),
    mov('gasto', 3850, '2026-03-01', { categoria_id: 'c-gas', nota: 'Repsol; M-30', foto_id: 'f1', medio_pago: 'tarjeta' }),
    mov('gasto', 20000, '2026-03-02', { categoria_id: 'c-her', es_inversion: true }),
    mov('cobro', 6000, '2026-03-03', { cliente_id: 'a', medio_pago: 'bizum' }),
    mov('aporte', 50000, '2026-03-04'),
    fianza,
    mov('fianza_devuelta', 10000, '2026-03-05', { fianza_id: fianza.id }),
    mov('gasto', 5000, '2026-03-05', { fianza_id: fianza.id, categoria_id: 'c-alq', nota: 'Descuento de fianza' }),
    prestamo,
    mov('devolucion_prestamo', 10000, '2026-04-01', { prestamo_id: prestamo.id }),
    mov('gasto', 999, '2026-03-06', { categoria_id: 'c-gas', eliminado_en: '2026-03-07T00:00:00Z' }),
    mov('gasto', 777, '2025-12-31', { categoria_id: 'c-gas' }),
  ];
  const visitas = [
    visita('v1', 'b', '2026-05-10', { tipos_trabajo: ['piscina'], incluida_en_abono: true, precio: null, estado: 'hecha' }),
    visita('v2', 'a', '2027-01-10'),
    visita('v3', 'a', '2026-05-11', { eliminado_en: '2026-05-01T00:00:00Z' }),
  ];
  return { clientes, movs, visitas, fianza, prestamo };
}

describe('filas de las hojas', () => {
  it('Movimientos: columnas de §15, signo de §9.1, sí/no, foto en el móvil, sin borrados ni fuera de rango', () => {
    const { clientes, movs } = escena();
    const f = filasMovimientos(movs, CATS, clientes, ANIO);
    expect(f[0]).toEqual(['Fecha', 'Tipo', 'Categoría', 'Grupo', 'Importe', 'Medio de pago', 'Cliente', 'Nota', 'Inversión', 'Cuenta en ganado', 'Foto del ticket']);
    expect(f).toHaveLength(1 + 10);
    expect(f[1]).toEqual([{ fecha: '2026-01-01' }, 'Saldo inicial', '', '', { importe: 100000 }, 'Efectivo', '', '', 'No', 'No', '']);
    const gasolina = f.find((x) => x[7] === 'Repsol; M-30')!;
    expect(gasolina).toEqual([{ fecha: '2026-03-01' }, 'Gasto', 'Gasolina (vehículo)', 'Movilidad', { importe: -3850 }, 'Tarjeta', '', 'Repsol; M-30', 'No', 'Sí', 'Foto en el móvil']);
    const herramienta = f.find((x) => x[2] === 'Herramientas y equipos nuevos')!;
    expect(herramienta[8]).toBe('Sí');
    expect(herramienta[9]).toBe('No');
    const cobro = f.find((x) => x[1] === 'Cobro')!;
    expect(cobro[4]).toEqual({ importe: 6000 });
    expect(cobro[6]).toBe('Fam. García');
    expect(f.find((x) => x[1] === 'Devolución de préstamo')![4]).toEqual({ importe: -10000 });
    expect(f.find((x) => x[1] === 'Fianza entregada')![4]).toEqual({ importe: -15000 });
    expect(f.find((x) => x[1] === 'Fianza devuelta')![4]).toEqual({ importe: 10000 });
    expect(f.find((x) => x[7] === 'Descuento de fianza')![4]).toEqual({ importe: -5000 });
    expect(importeConSigno({ tipo: 'aporte', importe: 5 })).toBe(5);
  });

  it('Clientes, Visitas, Fianzas y Préstamos', () => {
    const { clientes, movs, visitas } = escena();
    const c = filasClientes(clientes);
    expect(c).toHaveLength(3);
    expect(c[1][0]).toBe('Chalet Las Encinas');
    expect(c[1].slice(7, 13)).toEqual(['Piscina', 'Abono', { importe: 9000 }, 5, '', 'Sí']);

    const v = filasVisitas(visitas, clientes, ANIO);
    expect(v).toHaveLength(2);
    expect(v[1]).toEqual([{ fecha: '2026-05-10' }, '09:00', 60, 'Chalet Las Encinas', 'Piscina', '', '', 'Sí', 'No', 0, 'Hecha']);

    const fz = filasFianzas(movs, ANIO);
    expect(fz).toHaveLength(2);
    expect(fz[1]).toEqual([
      { fecha: '2026-03-01' }, 'Alquileres Sur', 'Furgoneta', { importe: 15000 }, { importe: 10000 }, { importe: 5000 }, { importe: 0 }, 'Devuelta con descuento', 'Efectivo',
    ]);

    const pr = filasPrestamos(movs, ANIO);
    expect(pr).toHaveLength(2);
    expect(pr[1]).toEqual([{ fecha: '2026-02-01' }, { importe: 30000 }, { importe: 10000 }, { importe: 20000 }, 'Pendiente', 'Transferencia', '']);
    expect(filasPrestamos(movs, { desde: '2026-03-01', hasta: '2026-12-31' })).toHaveLength(1);
  });
});

describe('CSV es-ES', () => {
  it('BOM, «;», coma decimal, signo, fecha dd/mm/aaaa, sí/no y escape de ; y comillas', () => {
    const csv = aCsv([
      ['Fecha', 'Importe', 'Nota', 'Inversión', 'Ayudantes'],
      [{ fecha: '2026-03-01' }, { importe: -3850 }, 'Repsol; M-30', 'Sí', 2],
      [{ fecha: '2026-03-02' }, { importe: 123456 }, 'Dijo "vale"', 'No', 0],
      ['', { importe: 5 }, 'dos\nlíneas', 'No', 1.5],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lineas = csv.slice(1).split('\r\n');
    expect(lineas[0]).toBe('Fecha;Importe;Nota;Inversión;Ayudantes');
    expect(lineas[1]).toBe('01/03/2026;-38,50;"Repsol; M-30";Sí;2');
    expect(lineas[2]).toBe('02/03/2026;1234,56;"Dijo ""vale""";No;0');
    expect(lineas[3]).toBe(';0,05;"dos\nlíneas";No;1,5');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('xlsx', () => {
  it('es un zip STORE válido con las 5 hojas, sus valores, importes con formato «€» y fechas serie', () => {
    const { clientes, movs, visitas } = escena();
    const hojas = hojasExportacion({ movimientos: movs, categorias: CATS, clientes, visitas }, ANIO);
    const zip = leerZip(crearXlsx(hojas, new Date(2026, 10, 7, 10, 0)));
    expect([...zip.keys()]).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml', 'xl/worksheets/sheet5.xml',
    ]);
    const libro = zip.get('xl/workbook.xml')!;
    for (const n of ['Movimientos', 'Clientes', 'Visitas', 'Fianzas', 'Préstamos']) expect(libro).toContain(`name="${n}"`);
    expect(zip.get('[Content_Types].xml')).toContain('/xl/worksheets/sheet5.xml');
    expect(zip.get('xl/_rels/workbook.xml.rels')).toContain('Id="rId6"');
    expect(zip.get('xl/styles.xml')).toContain('formatCode="#,##0.00\\ &quot;€&quot;"');

    const s1 = zip.get('xl/worksheets/sheet1.xml')!;
    expect(s1).toContain('<c r="A1" t="inlineStr" s="3"><is><t xml:space="preserve">Fecha</t></is></c>');
    expect(s1).toContain('<v>-38.50</v>');
    expect(s1).toContain('<v>1000.00</v>');
    expect(s1).toContain('Repsol; M-30');
    expect(s1).toContain(`<c r="A2" s="2"><v>${serieExcel('2026-01-01')}</v></c>`);
    expect(serieExcel('2026-01-01')).toBe(46023);
    expect(zip.get('xl/worksheets/sheet2.xml')).toContain('Perro; llamar &quot;antes&quot;');
    expect(zip.get('xl/worksheets/sheet3.xml')).toContain('Chalet Las Encinas');
    expect(zip.get('xl/worksheets/sheet4.xml')).toContain('Alquileres Sur');
    expect(zip.get('xl/worksheets/sheet5.xml')).toContain('<v>200.00</v>');
  });

  it('crc32 y columnas', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect([0, 25, 26, 27, 701, 702].map(letraColumna)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
});
