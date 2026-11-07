// Lógica pura de Preparar trabajo (§10.8): ropa por personas, lista de material, recordatorio, reparto y progreso.
import { describe, expect, it } from 'vitest';
import type { Visita } from '../../domain/tipos';
import { desdeMadrid } from '../../lib/fechas';
import {
  antelacion, bloques, categoriaDeArticulo, diasAlquiler, estadoFurgo, listaMaterial, listaRopa, materialListo, necesitaPreparacion,
  opcionesRecordatorio, personas, recordatorioPorDefecto, repartir, textoListaCompra, textoPersonas, textoProgreso, textoTrabajos, tituloDia,
} from './logica';
import type { ReservaVehiculo } from './modelo';
import { MATERIAL_POR_DEFECTO, ROPA_POR_DEFECTO } from './plantillas';

const v = (d: Partial<Visita> = {}): Visita =>
  ({
    id: 'v1', cliente_id: 'c1', fecha: '2026-11-11', hora_inicio: '08:30', duracion: 120, tipos_trabajo: ['setos_poda'], descripcion: '',
    precio: null, incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0, estado: 'programada', eliminado_en: null, ...d,
  }) as Visita;

describe('Ropa por cantidad de personas (§10.8.3)', () => {
  it('N = 1 + máximo de ayudantes del día', () => {
    expect(personas([v({ ayudantes: 2 }), v({ ayudantes: 1 })])).toBe(3);
    expect(personas([v()])).toBe(1);
    expect(textoPersonas(3)).toBe('Tú y 2 ayudantes');
    expect(textoPersonas(2)).toBe('Tú y 1 ayudante');
    expect(textoPersonas(1)).toBe('Tú solo');
  });

  it('cantidades entre paréntesis, pares para guantes y botas, y agua y protector sin multiplicar', () => {
    const tres = listaRopa(ROPA_POR_DEFECTO, 3, ['polo']).map((p) => p.texto);
    expect(tres).toEqual([
      'Polos FERGO (3)', 'Pantalones (3)', 'Guantes (3 pares)', 'Botas (3 pares)', 'Gafas de protección (3)', 'Protecciones auditivas (3)',
      'Gorras FERGO (3)', 'Agua y protector',
    ]);
    expect(listaRopa(ROPA_POR_DEFECTO, 3, ['polo'])[0].marcada).toBe(true);
    expect(listaRopa(ROPA_POR_DEFECTO, 1).map((p) => p.texto).slice(0, 3)).toEqual(['Polo FERGO (1)', 'Pantalón (1)', 'Guantes (1 par)']);
  });
});

describe('Material (§10.8.2)', () => {
  it('une las plantillas de los tipos del día sin duplicados, conserva el estado guardado y añade los extra al final', () => {
    const plantillas = { ...MATERIAL_POR_DEFECTO, desbroce: ['Gasolina de mezcla', 'Tanza'] };
    const items = listaMaterial([v({ tipos_trabajo: ['setos_poda'] }), v({ tipos_trabajo: ['desbroce'] })], plantillas, [
      { nombre: 'gasolina de mezcla', estado: 'comprar' },
      { nombre: 'Escalera', estado: 'lo_tengo', extra: true },
    ]);
    expect(items.map((i) => [i.nombre, i.estado])).toEqual([
      ['Cuchillas cortasetos', 'sin_revisar'], ['Gasolina de mezcla', 'comprar'], ['Sacos de restos', 'sin_revisar'], ['Lona', 'sin_revisar'],
      ['Tanza', 'sin_revisar'], ['Escalera', 'lo_tengo'],
    ]);
    expect(textoListaCompra(items)).toBe('Lista de compra: gasolina de mezcla');
    expect(materialListo(items)).toBe(false);
    expect(materialListo(items.map((i) => ({ ...i, estado: i.estado === 'comprar' ? 'comprado' : 'lo_tengo' })))).toBe(true);
  });

  it('sin plantilla para el tipo no inventa artículos', () => {
    expect(listaMaterial([v({ tipos_trabajo: ['corte_cesped'] })], MATERIAL_POR_DEFECTO)).toEqual([]);
  });

  it('deduce la categoría del gasto por el nombre del artículo', () => {
    expect(categoriaDeArticulo('Gasolina de mezcla')).toBe('gasolina_mezcla');
    expect(categoriaDeArticulo('Cuchillas cortasetos')).toBe('repuestos');
    expect(categoriaDeArticulo('Sacos de restos')).toBe('vertedero');
    expect(categoriaDeArticulo('Cloro en pastillas', 'piscina')).toBe('productos_piscina');
    expect(categoriaDeArticulo('Lona')).toBe('otros_gastos');
  });
});

describe('Recordatorio de compra (§10.8.2)', () => {
  const ahora = desdeMadrid(2026, 11, 7, 10); // sábado 7, 10:00
  it('por defecto el día siguiente a las 18:00, siempre antes del trabajo', () => {
    expect(recordatorioPorDefecto(ahora, '2026-11-11', [v()])).toBe('2026-11-08T18:00');
  });
  it('si no cabe, el mismo día dentro de 2 horas; si tampoco, la víspera a las 18:00; si nada cabe, ninguno', () => {
    expect(recordatorioPorDefecto(ahora, '2026-11-08', [v({ fecha: '2026-11-08', hora_inicio: '09:00' })])).toBe('2026-11-07T12:00');
    expect(recordatorioPorDefecto(desdeMadrid(2026, 11, 7, 16), '2026-11-08', [v({ hora_inicio: '08:00' })])).toBe('2026-11-07T18:00');
    expect(recordatorioPorDefecto(desdeMadrid(2026, 11, 7, 10), '2026-11-07', [v({ hora_inicio: '11:00' })])).toBeNull();
  });
  it('opciones rápidas solo antes del trabajo y en el futuro', () => {
    expect(opcionesRecordatorio(ahora, '2026-11-11', [v()]).map((o) => o.texto)).toEqual(['Esta tarde', 'Mañana 18:00', 'Mañana 09:00']);
    expect(opcionesRecordatorio(desdeMadrid(2026, 11, 7, 19), '2026-11-08', [v({ hora_inicio: '10:00' })]).map((o) => o.texto)).toEqual(['Mañana 09:00']);
  });
});

describe('Furgoneta y reparto (§9.5, §10.8.1)', () => {
  it('reparto a partes iguales en céntimos: la suma cuadra', () => {
    expect(repartir(9000, 2)).toEqual([4500, 4500]);
    expect(repartir(10001, 3)).toEqual([3334, 3334, 3333]);
    expect(repartir(10001, 3).reduce((a, b) => a + b, 0)).toBe(10001);
  });
  it('días de alquiler y estado del bloque', () => {
    expect(diasAlquiler('2026-11-10T19:00', '2026-11-11T20:00')).toBe(2);
    expect(diasAlquiler('2026-11-11T08:00', '2026-11-11T20:00')).toBe(1);
    expect(estadoFurgo([v()], undefined)).toBe('no_aplica');
    expect(estadoFurgo([v({ requiere_vehiculo: true })], undefined)).toBe('sin_reservar');
    expect(estadoFurgo([v({ requiere_vehiculo: true })], { estado: 'reservada', eliminado_en: null } as ReservaVehiculo)).toBe('reservada');
  });
});

describe('Cabecera y progreso (§10.8)', () => {
  it('textos de la cabecera', () => {
    expect(antelacion('2026-11-11', '2026-11-07')).toBe('EN 4 DÍAS');
    expect(antelacion('2026-11-08', '2026-11-07')).toBe('MAÑANA');
    expect(antelacion('2026-11-07', '2026-11-07')).toBe('HOY');
    expect(tituloDia('2026-11-11', [v()], [{ id: 'c1', nombre: 'Urb. El Olivar' }])).toBe('Miércoles 11 · Urb. El Olivar');
    expect(tituloDia('2026-11-11', [v(), v({ id: 'v2' })], [])).toBe('Miércoles 11 · 2 trabajos');
    expect(textoTrabajos([v({ tipos_trabajo: ['desbroce', 'setos_poda'] })])).toBe('Desbroce y setos y poda');
  });
  it('solo cuentan los bloques que aplican', () => {
    const ropa = listaRopa(ROPA_POR_DEFECTO, 1);
    expect(bloques([v()], undefined, [], ropa).map((b) => b.id)).toEqual(['ropa']);
    const b = bloques([v({ requiere_vehiculo: true })], { estado: 'reservada', eliminado_en: null } as ReservaVehiculo, [{ nombre: 'Lona', estado: 'lo_tengo' }], ropa);
    expect(b.map((x) => [x.id, x.listo])).toEqual([['furgoneta', true], ['material', true], ['ropa', false]]);
    expect(textoProgreso(b)).toBe('2 de 3 listos');
    expect(textoProgreso(b.slice(0, 1).concat({ ...b[2] }))).toBe('1 de 2 listo');
  });
  it('§10.8.4: hay preparación con furgoneta, ayudantes o material de plantilla', () => {
    expect(necesitaPreparacion([v({ tipos_trabajo: ['corte_cesped'] })], MATERIAL_POR_DEFECTO)).toBe(false);
    expect(necesitaPreparacion([v({ tipos_trabajo: ['corte_cesped'], ayudantes: 1 })], MATERIAL_POR_DEFECTO)).toBe(true);
    expect(necesitaPreparacion([v()], MATERIAL_POR_DEFECTO)).toBe(true);
  });
});
