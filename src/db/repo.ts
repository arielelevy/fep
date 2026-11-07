import { db, nuevoId } from './db';
import type { Categoria, MedioPago, Movimiento, TipoMovimiento } from '../domain/tipos';

// Escrituras locales (§14.2): se guardan al instante en IndexedDB. Toda escritura guarda
// creado_por / modificado_por (§3) y usa borrado lógico (§4.3). Cada operación devuelve
// su "deshacer" para la barra de 8 s (§5.4.1).

export type Deshacer = () => Promise<void>;

async function ajuste<T>(clave: string): Promise<T | undefined> {
  return (await db.ajustes.get(clave))?.valor as T | undefined;
}

export async function leerAjuste<T>(clave: string, porDefecto: T): Promise<T> {
  return (await ajuste<T>(clave)) ?? porDefecto;
}

export async function guardarAjuste(clave: string, valor: unknown): Promise<void> {
  await db.ajustes.put({ clave, valor });
}

export async function borrarAjuste(clave: string): Promise<void> {
  await db.ajustes.delete(clave);
}

async function contexto(): Promise<{ usuario: string; negocio: string }> {
  const [usuario, negocio] = await Promise.all([ajuste<string>('usuario_actual'), ajuste<string>('negocio_id')]);
  if (!usuario || !negocio) throw new Error('Base local sin preparar');
  return { usuario, negocio };
}

export interface DatosMovimiento {
  tipo: TipoMovimiento;
  importe: number;
  fecha: string;
  categoria_id: string | null;
  medio_pago: MedioPago;
  nota?: string;
  cliente_id?: string | null;
  foto_id?: string | null;
}

function validar(d: DatosMovimiento) {
  if (!Number.isInteger(d.importe) || d.importe <= 0) throw new Error('Importe no válido');
  if (d.tipo === 'gasto' && !d.categoria_id) throw new Error('Falta la categoría');
}

async function categoria(id: string | null): Promise<Categoria | undefined> {
  return id ? db.categorias.get(id) : undefined;
}

export async function crearMovimiento(d: DatosMovimiento): Promise<{ movimiento: Movimiento; deshacer: Deshacer }> {
  validar(d);
  const { usuario, negocio } = await contexto();
  const cat = await categoria(d.categoria_id);
  const ahora = new Date().toISOString();
  const movimiento: Movimiento = {
    id: nuevoId(),
    negocio_id: negocio,
    creado_en: ahora,
    actualizado_en: ahora,
    creado_por: usuario,
    modificado_por: usuario,
    eliminado_en: null,
    version: 1,
    tipo: d.tipo,
    importe: d.importe,
    fecha: d.fecha,
    categoria_id: d.categoria_id,
    medio_pago: d.medio_pago,
    cliente_id: d.cliente_id ?? null,
    nota: d.nota?.trim() ?? '',
    foto_id: d.foto_id ?? null,
    es_inversion: cat?.es_inversion ?? false, // heredado de la categoría (§8.6)
    con_iva: null,
    base: null,
    cuota_iva: null,
  };
  await db.transaction('rw', db.movimientos, db.ajustes, async () => {
    await db.movimientos.add(movimiento);
    if (d.tipo === 'gasto') await guardarAjuste('ultimo_medio_pago', d.medio_pago);
  });
  return { movimiento, deshacer: () => marcarEliminado(movimiento.id, usuario) };
}

/** Borrado lógico (o su deshacer, con null): lee y escribe en una transacción y deja la auditoría. */
async function fijarEliminado(id: string, usuario: string, eliminado_en: string | null) {
  await db.transaction('rw', db.movimientos, async () => {
    const m = await db.movimientos.get(id);
    if (!m) return;
    await db.movimientos.put({
      ...m,
      eliminado_en,
      actualizado_en: new Date().toISOString(),
      modificado_por: usuario,
      version: m.version + 1,
    });
  });
}

const marcarEliminado = (id: string, usuario: string) => fijarEliminado(id, usuario, new Date().toISOString());

export async function editarMovimiento(
  id: string,
  cambios: Partial<DatosMovimiento>,
): Promise<{ movimiento: Movimiento; deshacer: Deshacer }> {
  const { usuario } = await contexto();
  // Lectura y escritura en una transacción: dos ediciones seguidas no se pisan la versión.
  const { anterior, movimiento } = await db.transaction('rw', db.movimientos, db.categorias, async () => {
    const anterior = await db.movimientos.get(id);
    if (!anterior) throw new Error('Movimiento no encontrado');
    const cat = 'categoria_id' in cambios ? await categoria(cambios.categoria_id ?? null) : undefined;
    const movimiento: Movimiento = {
      ...anterior,
      ...cambios,
      nota: cambios.nota !== undefined ? cambios.nota.trim() : anterior.nota,
      es_inversion: cat ? cat.es_inversion : anterior.es_inversion,
      actualizado_en: new Date().toISOString(),
      modificado_por: usuario,
      version: anterior.version + 1,
    };
    validar(movimiento);
    await db.movimientos.put(movimiento);
    return { anterior, movimiento };
  });
  return {
    movimiento,
    deshacer: () =>
      db.transaction('rw', db.movimientos, async () => {
        const actual = await db.movimientos.get(id);
        await db.movimientos.put({
          ...anterior,
          // Deshacer la edición no resucita un movimiento eliminado después.
          eliminado_en: actual?.eliminado_en ?? anterior.eliminado_en,
          actualizado_en: new Date().toISOString(),
          modificado_por: usuario,
          version: (actual?.version ?? movimiento.version) + 1,
        });
      }),
  };
}

export async function eliminarMovimiento(id: string): Promise<{ deshacer: Deshacer }> {
  const { usuario } = await contexto();
  await marcarEliminado(id, usuario);
  return { deshacer: () => fijarEliminado(id, usuario, null) };
}

/** Saldo inicial (§9.3): un movimiento por efectivo y otro por banco; cuenta en caja, no en Ganado. */
export async function guardarSaldoInicial(efectivo: number, banco: number): Promise<{ deshacer: Deshacer }> {
  const fecha = new Date().toISOString();
  const deshacer: Deshacer[] = [];
  // Una sola transacción: las cifras de Hoy y el paso de bienvenida cambian a la vez.
  await db.transaction('rw', db.movimientos, db.ajustes, db.categorias, async () => {
    if (efectivo > 0) deshacer.push((await crearMovimiento({ tipo: 'saldo_inicial', importe: efectivo, fecha, categoria_id: null, medio_pago: 'efectivo' })).deshacer);
    if (banco > 0) deshacer.push((await crearMovimiento({ tipo: 'saldo_inicial', importe: banco, fecha, categoria_id: null, medio_pago: 'transferencia' })).deshacer);
    await guardarAjuste('saldo_inicial_hecho', true);
  });
  return {
    deshacer: async () => {
      await db.transaction('rw', db.movimientos, db.ajustes, async () => {
        for (const d of deshacer) await d();
        await guardarAjuste('saldo_inicial_hecho', false);
      });
    },
  };
}

export async function guardarFoto(blob: Blob): Promise<string> {
  const id = nuevoId();
  await db.fotos.add({ id, blob, creado_en: new Date().toISOString(), subida: false });
  return id;
}
