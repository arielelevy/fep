import { db, nuevoId } from './db';
import { TIPOS_COLABORADOR, type Categoria, type Cliente, type Comunes, type Deuda, type MedioPago, type Movimiento, type Rol, type Saldo, type TipoMovimiento } from '../domain/tipos';

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

async function contexto(): Promise<{ usuario: string; negocio: string; rol: Rol }> {
  const [usuario, negocio] = await Promise.all([ajuste<string>('usuario_actual'), ajuste<string>('negocio_id')]);
  if (!usuario || !negocio) throw new Error('Base local sin preparar');
  const rol = (await db.usuarios.get(usuario))?.rol ?? 'titular';
  return { usuario, negocio, rol };
}

/** Permiso del colaborador (§3): sólo aportes y préstamos. Se comprueba aquí además de en la interfaz. */
export class SinPermiso extends Error {
  constructor() {
    super('Solo Felipe puede hacer este cambio');
    this.name = 'SinPermiso';
  }
}

export function puedeTipo(rol: Rol, tipo: TipoMovimiento): boolean {
  return rol === 'titular' || TIPOS_COLABORADOR.includes(tipo);
}

function exigir(rol: Rol, tipo?: TipoMovimiento) {
  if (tipo ? !puedeTipo(rol, tipo) : rol !== 'titular') throw new SinPermiso();
}

/** Cambia quién usa este dispositivo (en la v1, sin inicio de sesión; §3). */
export async function usarComo(rol: Rol): Promise<void> {
  const u = await db.usuarios.where('rol').equals(rol).first();
  if (u) await guardarAjuste('usuario_actual', u.id);
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
  saldos?: Saldo[];
  periodo_abono?: string | null;
  fianza_id?: string | null;
  fianza?: { entregada_a: string; motivo: string } | null;
  prestamo_id?: string | null;
}

function validar(d: DatosMovimiento) {
  if (!Number.isInteger(d.importe) || d.importe <= 0) throw new Error('Importe no válido');
  if (d.tipo === 'gasto' && !d.categoria_id) throw new Error('Falta la categoría');
  if ((d.tipo === 'cobro' || d.tipo === 'anticipo') && !d.cliente_id) throw new Error('Falta el cliente');
  if (d.tipo === 'fianza_devuelta' && !d.fianza_id) throw new Error('Falta la fianza');
  if (d.tipo === 'devolucion_prestamo' && !d.prestamo_id) throw new Error('Falta el préstamo');
  for (const s of d.saldos ?? []) if (!Number.isInteger(s.importe) || s.importe <= 0) throw new Error('Saldo no válido');
  if ((d.saldos ?? []).reduce((x, s) => x + s.importe, 0) > d.importe) throw new Error('El cobro no cubre lo saldado');
}

async function categoria(id: string | null): Promise<Categoria | undefined> {
  return id ? db.categorias.get(id) : undefined;
}

export async function crearMovimiento(d: DatosMovimiento): Promise<{ movimiento: Movimiento; deshacer: Deshacer }> {
  validar(d);
  const { usuario, negocio, rol } = await contexto();
  exigir(rol, d.tipo);
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
    saldos: d.saldos ?? [],
    periodo_abono: d.periodo_abono ?? null,
    fianza_id: d.fianza_id ?? null,
    fianza: d.fianza ?? null,
    prestamo_id: d.prestamo_id ?? null,
  };
  await db.transaction('rw', db.movimientos, db.ajustes, async () => {
    await db.movimientos.add(movimiento);
    if (d.tipo !== 'saldo_inicial') await guardarAjuste('ultimo_medio_pago', d.medio_pago);
  });
  return { movimiento, deshacer: () => marcarEliminado(movimiento.id, usuario) };
}

/** Borrado lógico (o su deshacer, con null): lee y escribe en una transacción y deja la auditoría. */
async function fijarEliminado(ids: string | string[], usuario: string, eliminado_en: string | null) {
  await db.transaction('rw', db.movimientos, async () => {
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      const m = await db.movimientos.get(id);
      if (!m) continue;
      await db.movimientos.put({
        ...m,
        eliminado_en,
        actualizado_en: new Date().toISOString(),
        modificado_por: usuario,
        version: m.version + 1,
      });
    }
  });
}

const marcarEliminado = (id: string | string[], usuario: string) => fijarEliminado(id, usuario, new Date().toISOString());

export async function editarMovimiento(
  id: string,
  cambios: Partial<DatosMovimiento>,
): Promise<{ movimiento: Movimiento; deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  // Lectura y escritura en una transacción: dos ediciones seguidas no se pisan la versión.
  const { anterior, movimiento } = await db.transaction('rw', db.movimientos, db.categorias, async () => {
    const anterior = await db.movimientos.get(id);
    if (!anterior) throw new Error('Movimiento no encontrado');
    exigir(rol, anterior.tipo);
    if (cambios.tipo) exigir(rol, cambios.tipo);
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

/**
 * Borrado lógico. Al borrar una fianza o un préstamo se borran con él sus devoluciones (y el gasto por
 * descuento de fianza), para que las cifras no queden descuadradas; el deshacer los devuelve todos.
 */
export async function eliminarMovimiento(id: string): Promise<{ deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  const m = await db.movimientos.get(id);
  if (!m) throw new Error('Movimiento no encontrado');
  exigir(rol, m.tipo);
  const ligados =
    m.tipo === 'fianza_entregada' || m.tipo === 'prestamo'
      ? (await db.movimientos.filter((x) => !x.eliminado_en && (x.fianza_id === id || x.prestamo_id === id)).toArray()).map((x) => x.id)
      : [];
  const ids = [id, ...ligados];
  await marcarEliminado(ids, usuario);
  return { deshacer: () => fijarEliminado(ids, usuario, null) };
}

/** Saldo inicial (§9.3): un movimiento por efectivo y otro por banco; cuenta en caja, no en Ganado. */
export async function guardarSaldoInicial(efectivo: number, banco: number): Promise<{ deshacer: Deshacer }> {
  const fecha = new Date().toISOString();
  const deshacer: Deshacer[] = [];
  // Una sola transacción: las cifras de Hoy y el paso de bienvenida cambian a la vez.
  await db.transaction('rw', [db.movimientos, db.ajustes, db.categorias, db.usuarios], async () => {
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

/** Marca o desmarca un paso de la bienvenida leyendo el valor actual (dos toques seguidos no se pisan). */
export async function alternarPaso(paso: 'cliente' | 'avisos'): Promise<void> {
  await db.transaction('rw', db.ajustes, async () => {
    const actual = ((await db.ajustes.get('pasos_bienvenida'))?.valor as Record<string, boolean>) ?? {};
    await db.ajustes.put({ clave: 'pasos_bienvenida', valor: { ...actual, [paso]: !actual[paso] } });
  });
}

export async function guardarFoto(blob: Blob): Promise<string> {
  const id = nuevoId();
  await db.fotos.add({ id, blob, creado_en: new Date().toISOString(), subida: false });
  return id;
}

// ---------- Ola 4: clientes, trabajos hechos y fianzas ----------

const comunes = (usuario: string, negocio: string): Comunes => {
  const ahora = new Date().toISOString();
  return { id: nuevoId(), negocio_id: negocio, creado_en: ahora, actualizado_en: ahora, creado_por: usuario, modificado_por: usuario, eliminado_en: null, version: 1 };
};

/** Teléfono a E.164 (§4.3). Sin prefijo se asume España (+34). Devuelve null si no parece un teléfono. */
export function normalizarTelefono(texto: string): string | null {
  const t = texto.replace(/[\s\-().]/g, '');
  if (!t) return null;
  const e164 = t.startsWith('+') ? t : t.startsWith('00') ? '+' + t.slice(2) : '+34' + t;
  if (!/^\+\d{8,15}$/.test(e164)) return null;
  if (e164.startsWith('+34') && e164.length !== 12) return null;
  return e164;
}

export type DatosCliente = Omit<Cliente, keyof Comunes>;

function validarCliente(c: DatosCliente) {
  if (!c.nombre.trim()) throw new Error('Falta el nombre');
  if (c.servicios.length === 0) throw new Error('Elige al menos un servicio');
  if (c.modalidad === 'abono' && (!c.cuota_abono || c.cuota_abono <= 0)) throw new Error('Falta la cuota del abono');
  if (c.dia_cobro_abono !== null && (c.dia_cobro_abono < 1 || c.dia_cobro_abono > 28)) throw new Error('Día de cobro entre 1 y 28');
}

export async function crearCliente(d: DatosCliente): Promise<{ cliente: Cliente; deshacer: Deshacer }> {
  validarCliente(d);
  const { usuario, negocio, rol } = await contexto();
  exigir(rol);
  const cliente: Cliente = { ...comunes(usuario, negocio), ...d, nombre: d.nombre.trim() };
  await db.clientes.add(cliente);
  return {
    cliente,
    deshacer: () =>
      db.transaction('rw', db.clientes, async () => {
        const c = await db.clientes.get(cliente.id);
        if (c) await db.clientes.put({ ...c, eliminado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(), modificado_por: usuario, version: c.version + 1 });
      }),
  };
}

/** Edita un cliente (también desactivar y notas). Devuelve el deshacer de 8 s. */
export async function editarCliente(id: string, cambios: Partial<DatosCliente>): Promise<{ cliente: Cliente; deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  exigir(rol);
  const { anterior, cliente } = await db.transaction('rw', db.clientes, async () => {
    const anterior = await db.clientes.get(id);
    if (!anterior) throw new Error('Cliente no encontrado');
    const cliente: Cliente = { ...anterior, ...cambios, actualizado_en: new Date().toISOString(), modificado_por: usuario, version: anterior.version + 1 };
    validarCliente(cliente);
    await db.clientes.put(cliente);
    return { anterior, cliente };
  });
  return {
    cliente,
    deshacer: () =>
      db.transaction('rw', db.clientes, async () => {
        const actual = await db.clientes.get(id);
        await db.clientes.put({ ...anterior, actualizado_en: new Date().toISOString(), modificado_por: usuario, version: (actual?.version ?? cliente.version) + 1 });
      }),
  };
}

/**
 * Trabajo hecho y su cobro (hoja «¿Cobraste a …?», §10.1.4): anota la deuda del trabajo y, si se cobró algo,
 * el cobro que la salda (entera o en parte). Lo que no se cobró queda en "Te deben". Un solo deshacer.
 */
export async function anotarTrabajo(d: {
  cliente_id: string;
  concepto: string;
  precio: number;
  cobrado: number;
  medio_pago: MedioPago;
  fecha?: string;
}): Promise<{ deuda: Deuda; cobro: Movimiento | null; deshacer: Deshacer }> {
  const { usuario, negocio, rol } = await contexto();
  exigir(rol);
  if (!Number.isInteger(d.precio) || d.precio <= 0) throw new Error('Precio no válido');
  if (!Number.isInteger(d.cobrado) || d.cobrado < 0) throw new Error('Importe no válido');
  const fecha = d.fecha ?? new Date().toISOString();
  const deuda: Deuda = { ...comunes(usuario, negocio), cliente_id: d.cliente_id, concepto: d.concepto.trim() || 'Trabajo', importe: d.precio, fecha, visita_id: null };
  const cat = await db.categorias.where('clave').equals('cobro_trabajo').first();
  let cobro: Movimiento | null = null;
  await db.transaction('rw', [db.deudas, db.movimientos, db.ajustes, db.categorias, db.usuarios], async () => {
    await db.deudas.add(deuda);
    if (d.cobrado > 0)
      cobro = (
        await crearMovimiento({
          tipo: 'cobro', importe: d.cobrado, fecha, categoria_id: cat?.id ?? null, medio_pago: d.medio_pago, cliente_id: d.cliente_id,
          nota: deuda.concepto, saldos: [{ clave: `deuda:${deuda.id}`, importe: Math.min(d.cobrado, d.precio) }],
        })
      ).movimiento;
  });
  const cobroId = (cobro as Movimiento | null)?.id;
  return {
    deuda,
    cobro,
    deshacer: () =>
      db.transaction('rw', db.deudas, db.movimientos, async () => {
        const x = await db.deudas.get(deuda.id);
        if (x) await db.deudas.put({ ...x, eliminado_en: new Date().toISOString(), modificado_por: usuario, version: x.version + 1 });
        if (cobroId) await marcarEliminado(cobroId, usuario);
      }),
  };
}

/**
 * Devolución de fianza (§9.6): «Entera» o «Me descontaron algo». Crea la devolución por lo devuelto y,
 * si falta algo, un gasto automático de Movilidad por la diferencia con nota «Descuento de fianza».
 */
export async function devolverFianza(fianzaId: string, devuelto: number, medio: MedioPago): Promise<{ deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  exigir(rol, 'fianza_devuelta');
  const entrega = await db.movimientos.get(fianzaId);
  if (!entrega || entrega.tipo !== 'fianza_entregada' || entrega.eliminado_en) throw new Error('Fianza no encontrada');
  if (!Number.isInteger(devuelto) || devuelto < 0 || devuelto > entrega.importe) throw new Error('Importe no válido');
  const movilidad = await db.categorias.where('clave').equals('alquiler_furgoneta').first();
  const fecha = new Date().toISOString();
  const ids: string[] = [];
  await db.transaction('rw', [db.movimientos, db.ajustes, db.categorias, db.usuarios], async () => {
    if (devuelto > 0)
      ids.push((await crearMovimiento({ tipo: 'fianza_devuelta', importe: devuelto, fecha, categoria_id: null, medio_pago: medio, fianza_id: fianzaId, nota: entrega.fianza?.motivo ?? '' })).movimiento.id);
    const diferencia = entrega.importe - devuelto;
    if (diferencia > 0)
      ids.push((await crearMovimiento({ tipo: 'gasto', importe: diferencia, fecha, categoria_id: movilidad!.id, medio_pago: medio, fianza_id: fianzaId, nota: 'Descuento de fianza' })).movimiento.id);
  });
  return { deshacer: () => marcarEliminado(ids, usuario) };
}
