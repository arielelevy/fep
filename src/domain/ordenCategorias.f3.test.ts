import { describe, expect, it } from 'vitest';
import { CATEGORIAS_INICIALES } from './categoriasIniciales';
import { DIAS_FRECUENCIA, VISIBLES_EN_CUADRICULA, ordenarCategoriasGasto, usosUltimos60Dias } from './ordenCategorias';
import type { Categoria, Movimiento } from './tipos';

// Feature 3 (frente B). §5.1.5: el orden de la cuadrícula se ajusta por frecuencia de uso de los
// últimos 60 días; las 8 más usadas visibles y el resto en "Más". §9.2: orden inicial sin historial.

const categorias: Categoria[] = CATEGORIAS_INICIALES.map((c) => ({
  id: c.clave, negocio_id: 'n', creado_en: '', actualizado_en: '', creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1,
  clave: c.clave, nombre: c.nombre, nombre_corto: c.nombre_corto, grupo: c.grupo, icono: c.icono, tipo: c.tipo,
  es_inversion: c.es_inversion, visible: c.visible, orden_manual: c.orden, contador_uso_60d: 0,
}));

const ahora = new Date('2026-10-11T10:00:00.000Z');
const DIA = 86_400_000;
const hace = (ms: number) => new Date(ahora.getTime() - ms).toISOString();
let n = 0;
const gasto = (cat: string, fecha: string, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `o${++n}`, negocio_id: 'n', creado_en: fecha, actualizado_en: fecha, creado_por: 'u', modificado_por: 'u', eliminado_en: null, version: 1,
  tipo: 'gasto', importe: 1000, fecha, categoria_id: cat, medio_pago: 'efectivo', cliente_id: null, nota: '', foto_id: null,
  es_inversion: false, con_iva: null, base: null, cuota_iva: null, ...extra,
});
const veces = (k: number, cat: string, dias = 1) => Array.from({ length: k }, () => gasto(cat, hace(dias * DIA)));

describe('Orden de categorías por frecuencia (§5.1.5)', () => {
  it('constantes: 60 días y 8 visibles', () => {
    expect(DIAS_FRECUENCIA).toBe(60);
    expect(VISIBLES_EN_CUADRICULA).toBe(8);
  });

  it('siempre 8 en la cuadrícula; el resto de gastos visibles va a "Más"', () => {
    const visibles = categorias.filter((c) => c.tipo === 'gasto' && c.visible).length;
    const { cuadricula, resto } = ordenarCategoriasGasto(categorias, [], ahora);
    expect(cuadricula).toHaveLength(8);
    expect(cuadricula.length + resto.length).toBe(visibles);
    expect(new Set([...cuadricula, ...resto].map((c) => c.id)).size).toBe(visibles);
  });

  it('ordena de más a menos usada', () => {
    const movs = [...veces(5, 'telefono'), ...veces(3, 'publicidad'), ...veces(4, 'fitosanitarios'), ...veces(1, 'ropa')];
    const { cuadricula } = ordenarCategoriasGasto(categorias, movs, ahora);
    expect(cuadricula.slice(0, 4).map((c) => c.clave)).toEqual(['telefono', 'fitosanitarios', 'publicidad', 'ropa']);
  });

  it('a igual uso, desempata por el orden inicial de §9.2', () => {
    const movs = [...veces(2, 'ayudantes'), ...veces(2, 'gasolina')];
    const { cuadricula } = ordenarCategoriasGasto(categorias, movs, ahora);
    expect(cuadricula.slice(0, 2).map((c) => c.clave)).toEqual(['gasolina', 'ayudantes']);
  });

  it('9 categorías usadas: la menos usada pasa a "Más"', () => {
    const claves = ['telefono', 'publicidad', 'fitosanitarios', 'ropa', 'peajes', 'material_riego', 'material_piscina', 'impuestos', 'otros_gastos'];
    const movs = claves.flatMap((c, i) => veces(20 - i, c));
    const { cuadricula, resto } = ordenarCategoriasGasto(categorias, movs, ahora);
    expect(cuadricula.map((c) => c.clave)).toEqual(claves.slice(0, 8));
    expect(resto[0].clave).toBe('otros_gastos');
    // Las del orden inicial sin uso quedan en "Más".
    expect(resto.map((c) => c.clave)).toContain('gasolina');
  });

  it('ventana de 60 días: dentro justo en el límite, fuera un minuto antes y nada del futuro', () => {
    const movs = [
      gasto('telefono', hace(60 * DIA)), // límite exacto: cuenta
      gasto('publicidad', hace(60 * DIA + 60_000)), // 60 días y 1 minuto: no cuenta
      gasto('impuestos', new Date(ahora.getTime() + DIA).toISOString()), // futuro: no cuenta
    ];
    const usos = usosUltimos60Dias(movs, ahora);
    expect(usos.get('telefono')).toBe(1);
    expect(usos.has('publicidad')).toBe(false);
    expect(usos.has('impuestos')).toBe(false);
  });

  it('no cuenta borrados ni movimientos que no son gastos', () => {
    const movs = [
      gasto('telefono', hace(DIA), { eliminado_en: 'x' }),
      gasto('publicidad', hace(DIA), { tipo: 'cobro' }),
    ];
    expect(usosUltimos60Dias(movs, ahora).size).toBe(0);
  });

  it('no muestra categorías ocultas, eliminadas ni de ingreso, aunque tengan usos', () => {
    const conEliminada = categorias.map((c) => (c.clave === 'telefono' ? { ...c, eliminado_en: 'x' } : c));
    const movs = [...veces(9, 'seguro_vehiculo'), ...veces(9, 'telefono'), ...veces(9, 'cobro_trabajo')];
    const { cuadricula, resto } = ordenarCategoriasGasto(conEliminada, movs, ahora);
    const todas = [...cuadricula, ...resto].map((c) => c.clave);
    expect(todas).not.toContain('seguro_vehiculo');
    expect(todas).not.toContain('telefono');
    expect(todas).not.toContain('cobro_trabajo');
  });
});
