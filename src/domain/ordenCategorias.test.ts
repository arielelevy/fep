import { describe, expect, it } from 'vitest';
import { CATEGORIAS_INICIALES } from './categoriasIniciales';
import { ordenarCategoriasGasto } from './ordenCategorias';
import type { Categoria, Movimiento } from './tipos';

const categorias: Categoria[] = CATEGORIAS_INICIALES.map((c) => ({
  id: c.clave, negocio_id: 'n', creado_en: '', actualizado_en: '', creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1,
  clave: c.clave, nombre: c.nombre, nombre_corto: c.nombre_corto, grupo: c.grupo, icono: c.icono, tipo: c.tipo,
  es_inversion: c.es_inversion, visible: c.visible, orden_manual: c.orden, contador_uso_60d: 0,
}));

const ahora = new Date('2026-10-11T10:00:00Z');
const diasAtras = (d: number) => new Date(ahora.getTime() - d * 86400000).toISOString();
let n = 0;
const gasto = (cat: string, fecha: string, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `g${++n}`, negocio_id: 'n', creado_en: fecha, actualizado_en: fecha, creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1,
  tipo: 'gasto', importe: 1000, fecha, categoria_id: cat, medio_pago: 'efectivo', cliente_id: null, nota: '', foto_id: null,
  es_inversion: false, con_iva: null, base: null, cuota_iva: null, ...extra,
});

describe('Cuadrícula de categorías por frecuencia (§5.1.5)', () => {
  it('sin historial usa el orden inicial de §9.2 (mockup p. 2)', () => {
    const { cuadricula, resto } = ordenarCategoriasGasto(categorias, [], ahora);
    expect(cuadricula.map((c) => c.nombre_corto)).toEqual([
      'Gasolina', 'Alquiler furgo', 'Repuestos', 'Plantas y abono', 'Piscina', 'Vertedero', 'Herramientas', 'Ayudante',
    ]);
    // Las ocultas al inicio no aparecen ni en "Más"; los ingresos tampoco.
    const claves = resto.map((c) => c.clave);
    expect(claves).not.toContain('seguro_vehiculo');
    expect(claves).not.toContain('cuota_autonomos');
    expect(claves).not.toContain('cobro_trabajo');
    expect(claves).toContain('material_riego');
  });

  it('sube las más usadas de los últimos 60 días y deja las 8 primeras visibles', () => {
    const movs = [
      gasto('material_riego', diasAtras(1)), gasto('material_riego', diasAtras(2)), gasto('material_riego', diasAtras(59)),
      gasto('ropa', diasAtras(3)),
    ];
    const { cuadricula, resto } = ordenarCategoriasGasto(categorias, movs, ahora);
    expect(cuadricula[0].clave).toBe('material_riego');
    expect(cuadricula[1].clave).toBe('ropa');
    expect(cuadricula).toHaveLength(8);
    expect(resto.map((c) => c.clave)).toContain('ayudantes'); // desplazada a "Más"
  });

  it('no cuenta usos de hace más de 60 días ni los borrados', () => {
    const movs = [gasto('telefono', diasAtras(61)), gasto('telefono', diasAtras(70)), gasto('publicidad', diasAtras(1), { eliminado_en: 'x' })];
    const { cuadricula } = ordenarCategoriasGasto(categorias, movs, ahora);
    expect(cuadricula.map((c) => c.clave)).not.toContain('telefono');
    expect(cuadricula.map((c) => c.clave)).not.toContain('publicidad');
  });
});
