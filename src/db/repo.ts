import { db, nuevoId } from './db';
import { TIPOS_COLABORADOR, TIPOS_TRABAJO, type Categoria, type Cliente, type Comunes, type Deuda, type MedioPago, type Movimiento, type Rol, type Saldo, type TipoMovimiento, type Visita, type SerieRecurrente, type MotivoReprogramacion } from '../domain/tipos';
import { CATEGORIAS_INICIALES } from '../domain/categoriasIniciales';
import { prestamos as prestamosPendientes } from '../domain/cifras';
import { HORA_POR_DEFECTO, SEMANAS_MATERIALIZADAS, fechasSerie } from '../domain/agenda';
import { claveDia, sumarDias } from '../lib/fechas';

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
  // Si el usuario actual no existe (datos dañados o borrado), entra con el mínimo: colaborador, nunca titular.
  const rol = (await db.usuarios.get(usuario))?.rol ?? 'colaborador';
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
  const base = comunes(usuario, negocio);
  const cliente: Cliente = {
    ...base,
    ...d,
    nombre: d.nombre.trim(),
    historial_cuota: d.modalidad === 'abono' && d.cuota_abono ? [{ desde: claveDia(base.creado_en), cuota: d.cuota_abono }] : [],
    periodos_sin_abono: [],
  };
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

/**
 * Historia del abono al editar (QA ola 4, hallazgo 2): si cambia la cuota, se guarda desde hoy (los meses pasados
 * siguen con la suya); si se desactiva o pasa a puntual, se abre un tramo sin abono (lo ya vencido se conserva);
 * si vuelve a abono, se cierra.
 */
function historiaAbono(anterior: Cliente, nuevo: Cliente): Pick<Cliente, 'historial_cuota' | 'periodos_sin_abono'> {
  const hoy = claveDia(new Date());
  const alta = claveDia(anterior.creado_en);
  let historial = [...(anterior.historial_cuota ?? [])];
  if (!historial.length && anterior.cuota_abono && anterior.modalidad === 'abono') historial = [{ desde: alta, cuota: anterior.cuota_abono }];
  if (nuevo.cuota_abono && nuevo.cuota_abono !== (historial.at(-1)?.cuota ?? null)) {
    historial = historial.filter((h) => h.desde !== hoy);
    historial.push({ desde: historial.length ? hoy : alta, cuota: nuevo.cuota_abono });
  }
  const periodos = (anterior.periodos_sin_abono ?? []).map((p) => ({ ...p }));
  const antes = anterior.activo && anterior.modalidad === 'abono';
  const despues = nuevo.activo && nuevo.modalidad === 'abono';
  if (antes && !despues) periodos.push({ desde: hoy, hasta: null });
  if (!antes && despues) {
    const abierto = periodos.find((p) => p.hasta === null);
    if (abierto) abierto.hasta = hoy;
    else periodos.push({ desde: alta, hasta: hoy }); // no tenía abono hasta hoy: no se cobran meses anteriores
  }
  return { historial_cuota: historial, periodos_sin_abono: periodos };
}

/** Edita un cliente (también desactivar y notas). Devuelve el deshacer de 8 s. */
export async function editarCliente(id: string, cambios: Partial<DatosCliente>): Promise<{ cliente: Cliente; deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  exigir(rol);
  const { anterior, cliente } = await db.transaction('rw', db.clientes, async () => {
    const anterior = await db.clientes.get(id);
    if (!anterior) throw new Error('Cliente no encontrado');
    const cliente: Cliente = { ...anterior, ...cambios, actualizado_en: new Date().toISOString(), modificado_por: usuario, version: anterior.version + 1 };
    Object.assign(cliente, historiaAbono(anterior, cliente));
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
  /** Visita de la que sale el trabajo (flujo «Hecho», ola 5). */
  visita_id?: string | null;
}): Promise<{ deuda: Deuda; cobro: Movimiento | null; deshacer: Deshacer }> {
  const { usuario, negocio, rol } = await contexto();
  exigir(rol);
  if (!Number.isInteger(d.precio) || d.precio <= 0) throw new Error('Precio no válido');
  if (!Number.isInteger(d.cobrado) || d.cobrado < 0) throw new Error('Importe no válido');
  const fecha = d.fecha ?? new Date().toISOString();
  const deuda: Deuda = { ...comunes(usuario, negocio), cliente_id: d.cliente_id, concepto: d.concepto.trim() || 'Trabajo', importe: d.precio, fecha, visita_id: d.visita_id ?? null };
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
/**
 * Categoría del descuento de fianza: «Alquiler de furgoneta» (grupo Movilidad, decisión de Ariel). Si falta o está
 * borrada, se vuelve a crear desde las categorías iniciales en vez de fallar o usar un id inexistente.
 */
async function categoriaDescuentoFianza(): Promise<Categoria> {
  const c = await db.categorias.where('clave').equals('alquiler_furgoneta').first();
  if (c && !c.eliminado_en) return c;
  const ini = CATEGORIAS_INICIALES.find((x) => x.clave === 'alquiler_furgoneta')!;
  const { usuario, negocio } = await contexto();
  const nueva: Categoria = {
    ...(c ?? comunes(usuario, negocio)), clave: ini.clave, nombre: ini.nombre, nombre_corto: ini.nombre_corto, grupo: ini.grupo,
    icono: ini.icono, tipo: ini.tipo, es_inversion: ini.es_inversion, visible: true, orden_manual: ini.orden, contador_uso_60d: 0,
    eliminado_en: null, actualizado_en: new Date().toISOString(), modificado_por: usuario, version: (c?.version ?? 0) + 1,
  };
  await db.categorias.put(nueva);
  return nueva;
}

export async function devolverFianza(fianzaId: string, devuelto: number, medio: MedioPago): Promise<{ deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  exigir(rol, 'fianza_devuelta');
  const fecha = new Date().toISOString();
  const ids: string[] = [];
  // Todo en una transacción y contra lo que ya está resuelto: devolver o descontar dos veces la misma fianza falla.
  await db.transaction('rw', [db.movimientos, db.ajustes, db.categorias, db.usuarios], async () => {
    const entrega = await db.movimientos.get(fianzaId);
    if (!entrega || entrega.tipo !== 'fianza_entregada' || entrega.eliminado_en) throw new Error('Fianza no encontrada');
    const ligados = await db.movimientos.filter((m) => !m.eliminado_en && m.fianza_id === fianzaId).toArray();
    const resuelto = ligados.reduce((s, m) => s + m.importe, 0);
    const restante = entrega.importe - resuelto;
    if (restante <= 0) throw new Error('Esta fianza ya está devuelta');
    if (!Number.isInteger(devuelto) || devuelto < 0 || devuelto > restante) throw new Error('Importe no válido');
    if (devuelto > 0)
      ids.push((await crearMovimiento({ tipo: 'fianza_devuelta', importe: devuelto, fecha, categoria_id: null, medio_pago: medio, fianza_id: fianzaId, nota: entrega.fianza?.motivo ?? '' })).movimiento.id);
    const diferencia = restante - devuelto;
    if (diferencia > 0) {
      const movilidad = await categoriaDescuentoFianza();
      ids.push((await crearMovimiento({ tipo: 'gasto', importe: diferencia, fecha, categoria_id: movilidad.id, medio_pago: medio, fianza_id: fianzaId, nota: 'Descuento de fianza' })).movimiento.id);
    }
  });
  return { deshacer: () => marcarEliminado(ids, usuario) };
}

/**
 * Devolver a Pablo (§9.1): reparte el importe del préstamo más antiguo al más reciente y crea todas las devoluciones
 * en una sola transacción (o todas o ninguna). No deja devolver más de lo pendiente.
 */
export async function devolverPrestamos(d: { importe: number; fecha: string; medio_pago: MedioPago; nota?: string }): Promise<{ movimientos: Movimiento[]; deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  exigir(rol, 'devolucion_prestamo');
  if (!Number.isInteger(d.importe) || d.importe <= 0) throw new Error('Importe no válido');
  const creados: Movimiento[] = [];
  await db.transaction('rw', [db.movimientos, db.ajustes, db.categorias, db.usuarios], async () => {
    const abiertos = prestamosPendientes(await db.movimientos.toArray()).filter((p) => p.pendiente > 0);
    const total = abiertos.reduce((s, p) => s + p.pendiente, 0);
    if (d.importe > total) throw new Error('Es más de lo que queda por devolver');
    let resto = d.importe;
    for (const p of abiertos) {
      if (resto <= 0) break;
      const parte = Math.min(resto, p.pendiente);
      creados.push((await crearMovimiento({ tipo: 'devolucion_prestamo', importe: parte, fecha: d.fecha, categoria_id: null, medio_pago: d.medio_pago, nota: d.nota, prestamo_id: p.prestamo.id })).movimiento);
      resto -= parte;
    }
  });
  return { movimientos: creados, deshacer: () => marcarEliminado(creados.map((m) => m.id), usuario) };
}

// ---------- Ola 5: agenda (visitas, series y «Hecho») ----------

export type DatosVisita = Omit<Visita, keyof Comunes | 'estado' | 'serie_id' | 'fecha_serie' | 'reprogramada_desde' | 'motivo_reprogramacion' | 'motivo_cancelacion' | 'hecha_en'>;
export type DatosSerie = Omit<SerieRecurrente, keyof Comunes>;

function validarVisita(v: Pick<Visita, 'cliente_id' | 'fecha' | 'tipos_trabajo' | 'duracion' | 'precio' | 'hora_inicio'>) {
  if (!v.cliente_id) throw new Error('Falta el cliente');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha)) throw new Error('Fecha no válida');
  if (v.hora_inicio !== null && !/^\d{2}:\d{2}$/.test(v.hora_inicio)) throw new Error('Hora no válida');
  if (v.tipos_trabajo.length === 0) throw new Error('Elige al menos un tipo de trabajo');
  if (!Number.isInteger(v.duracion) || v.duracion <= 0) throw new Error('Duración no válida');
  if (v.precio !== null && (!Number.isInteger(v.precio) || v.precio <= 0)) throw new Error('Precio no válido');
}

const visitaNueva = (base: Comunes, d: DatosVisita, serie: { id: string; fecha: string } | null): Visita => ({
  ...base,
  ...d,
  descripcion: d.descripcion.trim(),
  estado: 'programada',
  serie_id: serie?.id ?? null,
  fecha_serie: serie?.fecha ?? null,
  reprogramada_desde: null,
  motivo_reprogramacion: null,
  motivo_cancelacion: '',
  hecha_en: null,
});

/** Guarda una lista de visitas con su estado anterior como deshacer (borrado lógico de las nuevas). */
async function restaurarVisitas(anteriores: Visita[], nuevas: string[], usuario: string) {
  await db.transaction('rw', db.visitas, async () => {
    const ahora = new Date().toISOString();
    for (const a of anteriores) {
      const actual = await db.visitas.get(a.id);
      await db.visitas.put({ ...a, actualizado_en: ahora, modificado_por: usuario, version: (actual?.version ?? a.version) + 1 });
    }
    for (const id of nuevas) {
      const v = await db.visitas.get(id);
      if (v) await db.visitas.put({ ...v, eliminado_en: ahora, actualizado_en: ahora, modificado_por: usuario, version: v.version + 1 });
    }
  });
}

/** Nueva visita puntual (§7.2). */
export async function crearVisita(d: DatosVisita): Promise<{ visita: Visita; deshacer: Deshacer }> {
  validarVisita(d);
  const { usuario, negocio, rol } = await contexto();
  exigir(rol);
  const visita = visitaNueva(comunes(usuario, negocio), d, null);
  await db.visitas.add(visita);
  return { visita, deshacer: () => restaurarVisitas([], [visita.id], usuario) };
}

/**
 * Crea las visitas que falten de las series activas hasta `semanas` semanas vista (§8.5).
 * Una visita de serie se identifica por (serie_id, fecha_serie): las movidas, canceladas o borradas no se recrean.
 */
export async function materializarSeries(hoy: string, semanas = SEMANAS_MATERIALIZADAS, soloSerie?: string): Promise<string[]> {
  const ctx = await contexto();
  if (ctx.rol !== 'titular') return [];
  const hasta = sumarDias(hoy, semanas * 7);
  const creadas: string[] = [];
  await db.transaction('rw', db.series, db.visitas, async () => {
    const series = (await db.series.toArray()).filter((s) => !s.eliminado_en && (!soloSerie || s.id === soloSerie));
    for (const s of series) {
      const existentes = new Set((await db.visitas.where('serie_id').equals(s.id).toArray()).map((v) => v.fecha_serie));
      for (const fecha of fechasSerie(s, hoy, hasta)) {
        if (existentes.has(fecha)) continue;
        const p = s.plantilla_visita;
        const v = visitaNueva(comunes(ctx.usuario, ctx.negocio), {
          cliente_id: s.cliente_id, fecha, hora_inicio: s.regla.hora, duracion: s.regla.duracion, tipos_trabajo: p.tipos_trabajo,
          descripcion: p.descripcion, precio: p.precio, incluida_en_abono: p.incluida_en_abono, requiere_vehiculo: p.requiere_vehiculo, ayudantes: p.ayudantes,
        }, { id: s.id, fecha });
        await db.visitas.add(v);
        creadas.push(v.id);
      }
    }
  });
  return creadas;
}

/** Nueva serie recurrente (§8.5) y sus visitas hasta hoy + 8 semanas. */
export async function crearSerie(d: DatosSerie, hoy: string = claveDiaHoy()): Promise<{ serie: SerieRecurrente; deshacer: Deshacer }> {
  const { usuario, negocio, rol } = await contexto();
  exigir(rol);
  validarVisita({ cliente_id: d.cliente_id, fecha: d.fecha_inicio, tipos_trabajo: d.plantilla_visita.tipos_trabajo, duracion: d.regla.duracion, precio: d.plantilla_visita.precio, hora_inicio: d.regla.hora });
  const serie: SerieRecurrente = { ...comunes(usuario, negocio), ...d };
  await db.series.add(serie);
  // Horizonte: hoy + 8 semanas (§8.5), aunque la serie empiece más adelante; fechasSerie ya arranca en fecha_inicio.
  const creadas = await materializarSeries(hoy, SEMANAS_MATERIALIZADAS, serie.id);
  return {
    serie,
    deshacer: async () => {
      await restaurarVisitas([], creadas, usuario);
      await db.transaction('rw', db.series, async () => {
        const s = await db.series.get(serie.id);
        if (s) await db.series.put({ ...s, eliminado_en: new Date().toISOString(), modificado_por: usuario, version: s.version + 1 });
      });
    },
  };
}

/** Edita una sola visita («Solo esta visita», §8.5). También sirve para editar la fecha. */
export async function editarVisita(id: string, cambios: Partial<DatosVisita>): Promise<{ visita: Visita; deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  exigir(rol);
  const { anterior, visita } = await db.transaction('rw', db.visitas, async () => {
    const anterior = await db.visitas.get(id);
    if (!anterior) throw new Error('Visita no encontrada');
    const visita: Visita = { ...anterior, ...cambios, actualizado_en: new Date().toISOString(), modificado_por: usuario, version: anterior.version + 1 };
    validarVisita(visita);
    await db.visitas.put(visita);
    return { anterior, visita };
  });
  return { visita, deshacer: () => restaurarVisitas([anterior], [], usuario) };
}

/**
 * «Esta y las siguientes» (§8.5, criterio 13): la serie original termina el día anterior a esta visita y nace
 * una serie nueva desde aquí con los cambios. Las visitas programadas de la serie desde esta fecha se
 * sustituyen; las pasadas y las ya hechas o canceladas no se tocan.
 */
export async function editarSerieDesde(
  visitaId: string,
  cambios: { visita?: Partial<DatosVisita>; regla?: Partial<SerieRecurrente['regla']> },
  hoy: string = claveDiaHoy(),
): Promise<{ serie: SerieRecurrente; deshacer: Deshacer }> {
  const { usuario, negocio, rol } = await contexto();
  exigir(rol);
  const v = await db.visitas.get(visitaId);
  if (!v?.serie_id) throw new Error('La visita no es de una serie');
  const original = await db.series.get(v.serie_id);
  if (!original) throw new Error('Serie no encontrada');
  const desde = v.fecha_serie ?? v.fecha;
  const cv = cambios.visita ?? {};
  const regla = {
    ...original.regla,
    hora: cv.hora_inicio !== undefined ? cv.hora_inicio : original.regla.hora,
    duracion: cv.duracion ?? original.regla.duracion,
    ...cambios.regla,
  };
  const nueva: SerieRecurrente = {
    ...comunes(usuario, negocio),
    cliente_id: original.cliente_id,
    regla,
    fecha_inicio: cv.fecha ?? desde,
    fecha_fin: original.fecha_fin,
    plantilla_visita: {
      tipos_trabajo: cv.tipos_trabajo ?? original.plantilla_visita.tipos_trabajo,
      descripcion: cv.descripcion ?? original.plantilla_visita.descripcion,
      ayudantes: cv.ayudantes ?? original.plantilla_visita.ayudantes,
      requiere_vehiculo: cv.requiere_vehiculo ?? original.plantilla_visita.requiere_vehiculo,
      precio: cv.precio !== undefined ? cv.precio : original.plantilla_visita.precio,
      incluida_en_abono: cv.incluida_en_abono ?? original.plantilla_visita.incluida_en_abono,
    },
  };
  validarVisita({ cliente_id: nueva.cliente_id, fecha: nueva.fecha_inicio, tipos_trabajo: nueva.plantilla_visita.tipos_trabajo, duracion: regla.duracion, precio: nueva.plantilla_visita.precio, hora_inicio: regla.hora });
  const sustituidas: Visita[] = [];
  await db.transaction('rw', db.series, db.visitas, async () => {
    const ahora = new Date().toISOString();
    await db.series.put({ ...original, fecha_fin: sumarDias(desde, -1), actualizado_en: ahora, modificado_por: usuario, version: original.version + 1 });
    await db.series.add(nueva);
    const futuras = (await db.visitas.where('serie_id').equals(original.id).toArray()).filter(
      (x) => !x.eliminado_en && x.estado === 'programada' && (x.fecha_serie ?? x.fecha) >= desde,
    );
    for (const x of futuras) {
      sustituidas.push(x);
      await db.visitas.put({ ...x, eliminado_en: ahora, actualizado_en: ahora, modificado_por: usuario, version: x.version + 1 });
    }
  });
  const creadas = await materializarSeries(hoy, SEMANAS_MATERIALIZADAS, nueva.id); // horizonte hoy + 8 semanas (§8.5)
  return {
    serie: nueva,
    deshacer: async () => {
      await restaurarVisitas(sustituidas, creadas, usuario);
      await db.transaction('rw', db.series, async () => {
        const ahora = new Date().toISOString();
        const n = await db.series.get(nueva.id);
        if (n) await db.series.put({ ...n, eliminado_en: ahora, modificado_por: usuario, version: n.version + 1 });
        const o = await db.series.get(original.id);
        if (o) await db.series.put({ ...original, actualizado_en: ahora, modificado_por: usuario, version: o.version + 1 });
      });
    },
  };
}

/** Mover una visita a otro día u hora (§8.4). Guarda de dónde venía y el motivo. */
export async function moverVisita(id: string, fecha: string, hora: string | null, motivo: MotivoReprogramacion = 'propio'): Promise<{ visita: Visita; deshacer: Deshacer }> {
  const v = await db.visitas.get(id);
  if (!v) throw new Error('Visita no encontrada');
  const r = await editarVisita(id, { fecha, hora_inicio: hora });
  const desde = `${v.fecha} ${v.hora_inicio ?? HORA_POR_DEFECTO}`;
  await db.visitas.update(id, { reprogramada_desde: desde, motivo_reprogramacion: motivo });
  return { visita: { ...r.visita, reprogramada_desde: desde, motivo_reprogramacion: motivo }, deshacer: r.deshacer };
}

/** Cancelar una visita (con motivo opcional). No se borra: queda en el historial como cancelada. */
export async function cancelarVisita(id: string, motivo = ''): Promise<{ deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  exigir(rol);
  const anterior = await db.visitas.get(id);
  if (!anterior) throw new Error('Visita no encontrada');
  await db.visitas.put({ ...anterior, estado: 'cancelada', motivo_cancelacion: motivo.trim(), actualizado_en: new Date().toISOString(), modificado_por: usuario, version: anterior.version + 1 });
  return { deshacer: () => restaurarVisitas([anterior], [], usuario) };
}

/** Borra una visita (borrado lógico), por ejemplo una creada por error. */
export async function eliminarVisita(id: string): Promise<{ deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  exigir(rol);
  const anterior = await db.visitas.get(id);
  if (!anterior) throw new Error('Visita no encontrada');
  await restaurarVisitas([], [id], usuario);
  return { deshacer: () => restaurarVisitas([anterior], [], usuario) };
}

/**
 * «Hecho» (§10.1.4, criterios 9 y 10): marca la visita como hecha y, si es puntual con precio, anota su deuda
 * por el precio y el cobro por lo cobrado (todo, otra cantidad o nada). Lo no cobrado queda en «Te deben»
 * y el cliente muestra «Te debe …». Una visita de abono o sin precio solo se marca hecha. Un solo deshacer.
 */
export async function completarVisita(
  visitaId: string,
  cobro: { cobrado: number; medio_pago: MedioPago } | null,
): Promise<{ visita: Visita; deuda: Deuda | null; cobro: Movimiento | null; deshacer: Deshacer }> {
  const { usuario, rol } = await contexto();
  exigir(rol);
  const anterior = await db.visitas.get(visitaId);
  if (!anterior || anterior.eliminado_en) throw new Error('Visita no encontrada');
  if (anterior.estado === 'hecha') throw new Error('La visita ya está hecha');
  if (anterior.estado === 'cancelada') throw new Error('La visita está cancelada');
  const ahora = new Date().toISOString();
  const visita: Visita = { ...anterior, estado: 'hecha', hecha_en: ahora, actualizado_en: ahora, modificado_por: usuario, version: anterior.version + 1 };
  let trabajo: Awaited<ReturnType<typeof anotarTrabajo>> | null = null;
  await db.transaction('rw', [db.visitas, db.deudas, db.movimientos, db.ajustes, db.categorias, db.usuarios], async () => {
    await db.visitas.put(visita);
    if (!anterior.incluida_en_abono && anterior.precio) {
      const medio = cobro?.medio_pago ?? ((await db.ajustes.get('ultimo_medio_pago'))?.valor as MedioPago) ?? 'efectivo';
      const concepto = anterior.descripcion || anterior.tipos_trabajo.map((x) => TIPOS_TRABAJO.find((y) => y.id === x)?.nombre ?? x).join(' y ') || 'Trabajo';
      trabajo = await anotarTrabajo({
        cliente_id: anterior.cliente_id, concepto, precio: anterior.precio,
        cobrado: Math.max(0, cobro?.cobrado ?? 0), medio_pago: medio, fecha: ahora, visita_id: anterior.id,
      });
    }
  });
  const t = trabajo as Awaited<ReturnType<typeof anotarTrabajo>> | null;
  return {
    visita,
    deuda: t?.deuda ?? null,
    cobro: t?.cobro ?? null,
    deshacer: async () => {
      if (t) await t.deshacer();
      await restaurarVisitas([anterior], [], usuario);
    },
  };
}

const claveDiaHoy = () => claveDia(new Date());
