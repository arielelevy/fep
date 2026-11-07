import { beforeEach, describe, expect, it } from 'vitest';
import { db, reiniciarBase } from './db';
import { crearMovimiento, editarMovimiento, eliminarMovimiento, guardarSaldoInicial, leerAjuste } from './repo';
import { calcularEnCaja, calcularGanado } from '../domain/cifras';
import { claveMes } from '../lib/fechas';

const activos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();
const catId = async (clave: string) => (await db.categorias.where('clave').equals(clave).first())!.id;

beforeEach(async () => {
  await reiniciarBase('fergo-prueba-repo');
});

describe('capa de datos local (IndexedDB)', () => {
  it('siembra usuario titular y categorías iniciales', async () => {
    const usuarios = await db.usuarios.toArray();
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0]).toMatchObject({ nombre: 'Felipe', rol: 'titular', etiqueta_aportante: 'papá' });
    expect(await db.categorias.where('tipo').equals('gasto').count()).toBe(21);
    const herramientas = await db.categorias.where('clave').equals('herramientas').first();
    expect(herramientas?.es_inversion).toBe(true);
  });

  it('crea un gasto con UUID, céntimos, trazabilidad y recuerda el medio de pago', async () => {
    const usuario = await leerAjuste<string>('usuario_actual', '');
    const { movimiento } = await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'bizum' });
    expect(movimiento.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(movimiento).toMatchObject({ importe: 3850, creado_por: usuario, modificado_por: usuario, eliminado_en: null, version: 1, es_inversion: false });
    expect(await leerAjuste('ultimo_medio_pago', 'efectivo')).toBe('bizum');
  });

  it('hereda "inversión" de la categoría', async () => {
    const { movimiento } = await crearMovimiento({ tipo: 'gasto', importe: 12000, fecha: new Date().toISOString(), categoria_id: await catId('herramientas'), medio_pago: 'efectivo' });
    expect(movimiento.es_inversion).toBe(true);
  });

  it('exige importe entero positivo y categoría en gastos (los dos campos obligatorios)', async () => {
    const fecha = new Date().toISOString();
    await expect(crearMovimiento({ tipo: 'gasto', importe: 0, fecha, categoria_id: await catId('gasolina'), medio_pago: 'efectivo' })).rejects.toThrow();
    await expect(crearMovimiento({ tipo: 'gasto', importe: 38.5, fecha, categoria_id: await catId('gasolina'), medio_pago: 'efectivo' })).rejects.toThrow();
    await expect(crearMovimiento({ tipo: 'gasto', importe: 3850, fecha, categoria_id: null, medio_pago: 'efectivo' })).rejects.toThrow();
    expect(await db.movimientos.count()).toBe(0);
  });

  it('deshacer un alta lo borra de forma lógica y las cifras vuelven al valor anterior', async () => {
    await guardarSaldoInicial(50000, 0);
    const antes = await activos();
    const mes = claveMes(new Date());
    const { movimiento, deshacer } = await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    expect(calcularEnCaja(await activos())).toBe(calcularEnCaja(antes) - 3850);
    expect(calcularGanado(await activos(), mes)).toBe(-3850);
    await deshacer();
    expect(calcularEnCaja(await activos())).toBe(50000);
    expect(calcularGanado(await activos(), mes)).toBe(0);
    const guardado = await db.movimientos.get(movimiento.id);
    expect(guardado?.eliminado_en).not.toBeNull(); // sigue en la base: borrado lógico
    expect(guardado?.version).toBe(2);
  });

  it('edita (incluida la fecha) y deshace la edición', async () => {
    const { movimiento } = await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: '2026-10-11T10:00:00.000Z', categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    const { movimiento: editado, deshacer } = await editarMovimiento(movimiento.id, { importe: 4000, fecha: '2026-10-09T10:00:00.000Z', categoria_id: await catId('herramientas') });
    expect(editado).toMatchObject({ importe: 4000, fecha: '2026-10-09T10:00:00.000Z', es_inversion: true, version: 2 });
    await deshacer();
    const restaurado = await db.movimientos.get(movimiento.id);
    expect(restaurado).toMatchObject({ importe: 3850, fecha: '2026-10-11T10:00:00.000Z', es_inversion: false, version: 3 });
  });

  it('elimina con borrado lógico y deshace', async () => {
    const { movimiento } = await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    const { deshacer } = await eliminarMovimiento(movimiento.id);
    expect(await activos()).toHaveLength(0);
    expect(await db.movimientos.count()).toBe(1);
    await deshacer();
    expect(await activos()).toHaveLength(1);
  });

  it('el saldo inicial cuenta en caja pero no en Ganado', async () => {
    await guardarSaldoInicial(30000, 90000);
    const movs = await activos();
    expect(calcularEnCaja(movs)).toBe(120000);
    expect(calcularGanado(movs, claveMes(new Date()))).toBe(0);
    expect(await leerAjuste('saldo_inicial_hecho', false)).toBe(true);
  });
});
