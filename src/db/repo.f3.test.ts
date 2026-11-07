import { beforeEach, describe, expect, it } from 'vitest';
import { db, reiniciarBase } from './db';
import { crearMovimiento, editarMovimiento, eliminarMovimiento, guardarSaldoInicial, leerAjuste } from './repo';
import { calcularEnCaja, calcularGanado, esImporteAtipico } from '../domain/cifras';
import { claveMes } from '../lib/fechas';

// Feature 3 (frente B). Registro de gasto sobre la base local: campos obligatorios, último medio
// de pago, borrado lógico, deshacer de alta, edición y borrado con sus cifras (§4.3, §5.4, §10.2.3).

const activos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();
const catId = async (clave: string) => (await db.categorias.where('clave').equals(clave).first())!.id;
const mes = () => claveMes(new Date());
const cifras = async () => {
  const a = await activos();
  return { caja: calcularEnCaja(a), ganado: calcularGanado(a, mes()) };
};
const gasto = async (importe: number, clave = 'gasolina', extra: Record<string, unknown> = {}) =>
  crearMovimiento({ tipo: 'gasto', importe, fecha: new Date().toISOString(), categoria_id: await catId(clave), medio_pago: 'efectivo', ...extra });

beforeEach(async () => {
  await reiniciarBase('fergo-prueba-f3-repo');
  await guardarSaldoInicial(50000, 0);
});

describe('Registro de gasto en la base local', () => {
  it('sólo importe y categoría son obligatorios: lo demás queda vacío por defecto', async () => {
    const { movimiento } = await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    expect(movimiento).toMatchObject({ nota: '', cliente_id: null, foto_id: null });
    expect(await db.movimientos.get(movimiento.id)).toBeTruthy();
  });

  it('sin importe válido o sin categoría no se guarda nada', async () => {
    const antes = await db.movimientos.count();
    await expect(gasto(0)).rejects.toThrow();
    await expect(gasto(-100)).rejects.toThrow();
    await expect(gasto(10.5)).rejects.toThrow();
    await expect(crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: null, medio_pago: 'efectivo' })).rejects.toThrow();
    expect(await db.movimientos.count()).toBe(antes);
  });

  it('recuerda el último medio de pago usado en un gasto', async () => {
    expect(await leerAjuste('ultimo_medio_pago', 'efectivo')).toBe('efectivo');
    await gasto(1000, 'gasolina', { medio_pago: 'tarjeta' });
    expect(await leerAjuste('ultimo_medio_pago', 'efectivo')).toBe('tarjeta');
    await gasto(1000, 'gasolina', { medio_pago: 'bizum' });
    expect(await leerAjuste('ultimo_medio_pago', 'efectivo')).toBe('bizum');
  });

  it('el saldo inicial no cambia el último medio de pago', async () => {
    await gasto(1000, 'gasolina', { medio_pago: 'bizum' });
    await guardarSaldoInicial(0, 1000);
    expect(await leerAjuste('ultimo_medio_pago', 'efectivo')).toBe('bizum');
  });

  it('guarda el importe en céntimos enteros tal cual', async () => {
    const { movimiento } = await gasto(3850);
    const guardado = await db.movimientos.get(movimiento.id);
    expect(guardado?.importe).toBe(3850);
    expect(Number.isInteger(guardado?.importe)).toBe(true);
  });
});

describe('Criterios 2 y 3 con la base local', () => {
  it('criterio 2: guardar un gasto baja "En caja" y "Ganado" por ese importe', async () => {
    const antes = await cifras();
    await gasto(3850);
    const despues = await cifras();
    expect(despues.caja).toBe(antes.caja - 3850);
    expect(despues.ganado).toBe(antes.ganado - 3850);
  });

  it('criterio 3: deshacer el alta devuelve las cifras y conserva el registro (borrado lógico)', async () => {
    await gasto(1500, 'vertedero');
    const antes = await cifras();
    const { movimiento, deshacer } = await gasto(3850);
    await deshacer();
    expect(await cifras()).toEqual(antes);
    const fila = await db.movimientos.get(movimiento.id);
    expect(fila?.eliminado_en).toEqual(expect.any(String));
    expect((await activos()).some((m) => m.id === movimiento.id)).toBe(false);
  });

  it('un gasto de inversión baja "En caja" pero no "Ganado"', async () => {
    const antes = await cifras();
    await gasto(12000, 'herramientas');
    const despues = await cifras();
    expect(despues.caja).toBe(antes.caja - 12000);
    expect(despues.ganado).toBe(antes.ganado);
  });
});

describe('Edición y borrado lógico', () => {
  it('editar el importe ajusta las cifras y deshacer la edición las devuelve', async () => {
    const { movimiento } = await gasto(3850);
    const conGasto = await cifras();
    const { deshacer } = await editarMovimiento(movimiento.id, { importe: 4000 });
    expect((await cifras()).caja).toBe(conGasto.caja - 150);
    await deshacer();
    expect(await cifras()).toEqual(conGasto);
  });

  it('editar la fecha a otro mes saca el gasto del Ganado del mes actual', async () => {
    const { movimiento } = await gasto(3850);
    const conGasto = await cifras();
    await editarMovimiento(movimiento.id, { fecha: '2025-01-15T10:00:00.000Z' });
    const despues = await cifras();
    expect(despues.caja).toBe(conGasto.caja); // la caja es histórica: no cambia
    expect(despues.ganado).toBe(conGasto.ganado + 3850);
  });

  it('pasar a una categoría de inversión lo saca de "Ganado"', async () => {
    const { movimiento } = await gasto(3850);
    const conGasto = await cifras();
    const { movimiento: editado } = await editarMovimiento(movimiento.id, { categoria_id: await catId('herramientas') });
    expect(editado.es_inversion).toBe(true);
    expect((await cifras()).ganado).toBe(conGasto.ganado + 3850);
  });

  it('no deja editar a un importe no válido ni quitar la categoría', async () => {
    const { movimiento } = await gasto(3850);
    await expect(editarMovimiento(movimiento.id, { importe: 0 })).rejects.toThrow();
    await expect(editarMovimiento(movimiento.id, { categoria_id: null })).rejects.toThrow();
    expect((await db.movimientos.get(movimiento.id))?.importe).toBe(3850);
  });

  it('eliminar es lógico: sale de las cifras, sigue en la base y deshacer lo recupera', async () => {
    const antes = await cifras();
    const { movimiento } = await gasto(3850);
    const { deshacer } = await eliminarMovimiento(movimiento.id);
    expect(await cifras()).toEqual(antes);
    const fila = await db.movimientos.get(movimiento.id);
    expect(fila?.eliminado_en).toEqual(expect.any(String));
    expect(fila?.version).toBe(2);
    await deshacer();
    expect((await cifras()).caja).toBe(antes.caja - 3850);
    expect((await db.movimientos.get(movimiento.id))?.eliminado_en).toBeNull();
  });

  it('cada cambio sube la versión y registra quién lo hizo', async () => {
    const usuario = await leerAjuste<string>('usuario_actual', '');
    const { movimiento } = await gasto(3850);
    await editarMovimiento(movimiento.id, { nota: ' ticket ' });
    const fila = await db.movimientos.get(movimiento.id);
    expect(fila).toMatchObject({ version: 2, modificado_por: usuario, creado_por: usuario, nota: 'ticket' });
  });
});

describe('Criterio 8 con la base local', () => {
  it('con media de 40 € en la categoría, 3.850 € es atípico; los gastos borrados no cuentan', async () => {
    const gasolina = await catId('gasolina');
    await gasto(3500);
    await gasto(4500);
    const { deshacer } = await gasto(900000); // 9.000 €, deshecho: no debe subir la media
    await deshacer();
    expect(esImporteAtipico(385000, gasolina, await activos())).toBe(true);
    expect(esImporteAtipico(385000, gasolina, await db.movimientos.toArray())).toBe(true);
  });
});
