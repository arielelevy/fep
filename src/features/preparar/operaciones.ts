// Escrituras de Preparar trabajo (§10.8). Todo local primero (IndexedDB, tabla `ajustes` + movimientos): funciona sin
// conexión (§14). Cada escritura deja la trazabilidad de §8 (UUID, creado_por, modificado_por, version, borrado lógico)
// y devuelve su «Deshacer» (§5.4.1). Solo el titular cambia cosas (§3): Pablo ve la preparación y no puede tocarla.
//
// Dinero (§9.1, §9.5, §9.6): al recoger la furgoneta, «Registrar los dos» crea en una sola transacción el gasto de
// alquiler (categoría «Alquiler de furgoneta», imputado a partes iguales a los clientes de las visitas que cubre la
// reserva) y la fianza entregada (dinero aparte: resta de caja, suma a «En fianzas», no cuenta en «Ganado»). La
// devolución usa `devolverFianza` (el descuento va a «Alquiler de furgoneta», decisión de Ariel).

import { db, nuevoId } from '../../db/db';
import { crearMovimiento, devolverFianza, guardarAjuste, leerAjuste, SinPermiso, type Deshacer } from '../../db/repo';
import type { MedioPago, TipoTrabajo, Visita } from '../../domain/tipos';
import { anadirArticuloPlantilla } from '../ajustes/plantillas/datos';
import { clientesDeVisitas, preparacionVacia, repartir } from './logica';
import { CLAVE_PREPARACIONES, CLAVE_RESERVAS, type EstadoMaterial, type ItemMaterial, type Preparacion, type ReservaVehiculo } from './modelo';

async function yo(): Promise<{ usuario: string; negocio: string }> {
  const usuario = await leerAjuste<string>('usuario_actual', '');
  const negocio = await leerAjuste<string>('negocio_id', '');
  if (!usuario || !negocio) throw new Error('Base local sin preparar');
  if ((await db.usuarios.get(usuario))?.rol !== 'titular') throw new SinPermiso();
  return { usuario, negocio };
}

export const leerPreparaciones = () => leerAjuste<Record<string, Preparacion>>(CLAVE_PREPARACIONES, {});
export const leerReservas = () => leerAjuste<ReservaVehiculo[]>(CLAVE_RESERVAS, []);

/** Reserva viva de un día (no cancelada ni borrada). */
export const reservaDelDia = (reservas: ReservaVehiculo[], fecha: string) =>
  reservas.find((r) => r.fecha === fecha && !r.eliminado_en && r.estado !== 'cancelada');

// ---------- Preparación (material, ropa, recordatorio) ----------

/** Cambia la preparación de un día con lectura y escritura en una transacción; devuelve su «Deshacer». */
async function cambiarPreparacion(fecha: string, cambio: (p: Preparacion) => void): Promise<{ preparacion: Preparacion; deshacer: Deshacer }> {
  const { usuario, negocio } = await yo();
  let antes: Record<string, Preparacion> = {};
  let preparacion!: Preparacion;
  await db.transaction('rw', db.ajustes, async () => {
    antes = await leerPreparaciones();
    const ahora = new Date().toISOString();
    const previa = antes[fecha];
    preparacion = structuredClone(
      previa ?? {
        id: nuevoId(), negocio_id: negocio, creado_en: ahora, actualizado_en: ahora, creado_por: usuario, modificado_por: usuario,
        eliminado_en: null, version: 0, ...preparacionVacia(fecha),
      },
    );
    cambio(preparacion);
    preparacion.actualizado_en = ahora;
    preparacion.modificado_por = usuario;
    preparacion.version += 1;
    await guardarAjuste(CLAVE_PREPARACIONES, { ...antes, [fecha]: preparacion });
  });
  const copia = structuredClone(antes);
  return { preparacion, deshacer: () => guardarAjuste(CLAVE_PREPARACIONES, copia) };
}

const igual = (a: string, b: string) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

function fijarItem(p: Preparacion, item: Pick<ItemMaterial, 'nombre' | 'tipo' | 'extra'>, cambios: Partial<ItemMaterial>) {
  const i = p.material.findIndex((x) => igual(x.nombre, item.nombre));
  if (i >= 0) p.material[i] = { ...p.material[i], ...cambios };
  else p.material.push({ nombre: item.nombre, tipo: item.tipo ?? null, extra: item.extra ?? false, estado: 'sin_revisar', gasto_id: null, ...cambios });
}

/** «Lo tengo» / «Comprar» / «Comprado» (o volver a «sin revisar» tocando el mismo botón otra vez). */
export function marcarMaterial(fecha: string, item: Pick<ItemMaterial, 'nombre' | 'tipo' | 'extra'>, estado: EstadoMaterial) {
  return cambiarPreparacion(fecha, (p) => fijarItem(p, item, { estado }));
}

/**
 * «+ Añadir otra cosa» (§10.8.2): se añade a esta preparación y, con «Añadir siempre para [tipo]», también a la
 * plantilla de material de ese tipo (función del encargo B, `anadirArticuloPlantilla`). Si ya estaba en la plantilla,
 * no se repite. «Deshacer» quita las dos cosas.
 */
export async function anadirArticulo(fecha: string, nombre: string, siemprePara: TipoTrabajo[] = []): Promise<{ deshacer: Deshacer }> {
  const limpio = nombre.trim();
  if (!limpio) throw new Error('Escribe qué necesitas');
  const deshaceres: Deshacer[] = [];
  try {
    for (const tipo of [...new Set(siemprePara)]) {
      try {
        deshaceres.push((await anadirArticuloPlantilla(tipo, limpio)).deshacer);
      } catch (e) {
        if (!(e instanceof Error && e.message === 'Ya está en la lista')) throw e;
      }
    }
    const p = await cambiarPreparacion(fecha, (x) => {
      if (x.material.some((i) => igual(i.nombre, limpio))) return;
      x.material.push({ nombre: limpio, extra: true, tipo: siemprePara[0] ?? null, estado: 'sin_revisar', gasto_id: null });
    });
    deshaceres.push(p.deshacer);
  } catch (e) {
    for (const d of deshaceres.reverse()) await d();
    throw e;
  }
  return {
    deshacer: async () => {
      for (const d of [...deshaceres].reverse()) await d();
    },
  };
}

/** «Recordarme»: fecha y hora local «AAAA-MM-DDTHH:MM» (null lo quita). El aviso push lo programa el servidor (otro encargo). */
export function guardarRecordatorio(fecha: string, momento: string | null) {
  if (momento !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(momento)) throw new Error('Hora no válida');
  return cambiarPreparacion(fecha, (p) => {
    p.recordatorio_compra = momento;
  });
}

/** Marca o desmarca una prenda. */
export function marcarRopa(fecha: string, clave: string, marcada: boolean) {
  return cambiarPreparacion(fecha, (p) => {
    p.ropa_marcada = marcada ? [...new Set([...p.ropa_marcada, clave])] : p.ropa_marcada.filter((x) => x !== clave);
  });
}

/**
 * «¿Registrar el gasto?» al comprar un artículo: crea el gasto (categoría deducida o la elegida, imputado al cliente de
 * la visita si hay una sola) y lo deja ligado al artículo, que queda «Comprado».
 */
export async function registrarGastoArticulo(
  fecha: string,
  item: Pick<ItemMaterial, 'nombre' | 'tipo' | 'extra'>,
  d: { importe: number; categoria_id: string; medio_pago: MedioPago; cliente_id: string | null },
): Promise<{ deshacer: Deshacer }> {
  await yo();
  const g = await crearMovimiento({
    tipo: 'gasto', importe: d.importe, fecha: new Date().toISOString(), categoria_id: d.categoria_id, medio_pago: d.medio_pago,
    cliente_id: d.cliente_id, nota: item.nombre,
  });
  try {
    const p = await cambiarPreparacion(fecha, (x) => fijarItem(x, item, { estado: 'comprado', gasto_id: g.movimiento.id }));
    return {
      deshacer: async () => {
        await g.deshacer();
        await p.deshacer();
      },
    };
  } catch (e) {
    await g.deshacer();
    throw e;
  }
}

// ---------- Furgoneta ----------

async function cambiarReservas(cambio: (r: ReservaVehiculo[]) => ReservaVehiculo[]): Promise<{ reservas: ReservaVehiculo[]; deshacer: Deshacer }> {
  let antes: ReservaVehiculo[] = [];
  let despues: ReservaVehiculo[] = [];
  await db.transaction('rw', db.ajustes, async () => {
    antes = await leerReservas();
    despues = cambio(structuredClone(antes));
    await guardarAjuste(CLAVE_RESERVAS, despues);
  });
  const copia = structuredClone(antes);
  return { reservas: despues, deshacer: () => guardarAjuste(CLAVE_RESERVAS, copia) };
}

export interface DatosReserva {
  fecha: string;
  proveedor_id: string | null;
  proveedor_nombre: string;
  proveedor_telefono: string | null;
  recogida: string;
  devolucion: string;
  precio: number;
  fianza_prevista: number;
  visitas: Visita[];
}

function validarReserva(d: DatosReserva) {
  if (!d.proveedor_nombre.trim()) throw new Error('Falta a quién se la alquilas');
  if (!Number.isInteger(d.precio) || d.precio < 0 || !Number.isInteger(d.fianza_prevista) || d.fianza_prevista < 0) throw new Error('Importe no válido');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.recogida) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.devolucion)) throw new Error('Fecha no válida');
  if (d.devolucion <= d.recogida) throw new Error('La devolución tiene que ser después de la recogida');
}

/** «Ya la reservé» (§10.8.1): guarda la reserva (o la corrige si ya había una y aún no se recogió). */
export async function guardarReserva(d: DatosReserva): Promise<{ reserva: ReservaVehiculo; deshacer: Deshacer }> {
  validarReserva(d);
  const { usuario, negocio } = await yo();
  let reserva!: ReservaVehiculo;
  const r = await cambiarReservas((lista) => {
    const ahora = new Date().toISOString();
    const previa = reservaDelDia(lista, d.fecha);
    if (previa && previa.estado !== 'reservada') throw new Error('La furgoneta ya está recogida');
    reserva = {
      ...(previa ?? { id: nuevoId(), negocio_id: negocio, creado_en: ahora, creado_por: usuario, eliminado_en: null, version: 0, gasto_ids: [], fianza_id: null }),
      actualizado_en: ahora,
      modificado_por: usuario,
      version: (previa?.version ?? 0) + 1,
      fecha: d.fecha,
      proveedor_id: d.proveedor_id,
      proveedor_nombre: d.proveedor_nombre.trim(),
      proveedor_telefono: d.proveedor_telefono,
      recogida: d.recogida,
      devolucion: d.devolucion,
      precio: d.precio,
      fianza_prevista: d.fianza_prevista,
      visitas: d.visitas.map((v) => v.id),
      estado: 'reservada',
    } as ReservaVehiculo;
    return previa ? lista.map((x) => (x.id === previa.id ? reserva : x)) : [...lista, reserva];
  });
  return { reserva, deshacer: r.deshacer };
}

/**
 * «¿Ya recogiste la furgoneta?» → «Registrar los dos» (§10.8.1, registro doble): en una transacción crea el gasto de
 * alquiler imputado a partes iguales a los clientes de las visitas (uno por cliente, la suma cuadra al céntimo) y la
 * fianza entregada, y marca la reserva como recogida. «Deshacer» lo quita todo.
 */
export async function registrarRecogida(
  reservaId: string,
  d: { precio: number; fianza: number; medio_pago: MedioPago; visitas: Visita[] },
): Promise<{ reserva: ReservaVehiculo; movimientos: string[]; deshacer: Deshacer }> {
  const { usuario } = await yo();
  if (!Number.isInteger(d.precio) || d.precio < 0 || !Number.isInteger(d.fianza) || d.fianza < 0 || d.precio + d.fianza === 0) throw new Error('Importe no válido');
  const deshaceres: Deshacer[] = [];
  const ids: string[] = [];
  let antes: ReservaVehiculo[] = [];
  let reserva!: ReservaVehiculo;
  await db.transaction('rw', [db.movimientos, db.ajustes, db.categorias, db.usuarios], async () => {
    antes = await leerReservas();
    const previa = antes.find((x) => x.id === reservaId && !x.eliminado_en);
    if (!previa) throw new Error('Reserva no encontrada');
    if (previa.estado !== 'reservada') throw new Error('La furgoneta ya está recogida');
    const fecha = new Date().toISOString();
    const nota = `Furgoneta · ${previa.proveedor_nombre}`;
    if (d.precio > 0) {
      const cat = await db.categorias.where('clave').equals('alquiler_furgoneta').first();
      if (!cat) throw new Error('Falta la categoría Alquiler de furgoneta');
      const clientes = clientesDeVisitas(d.visitas.filter((v) => previa.visitas.includes(v.id)));
      const partes = clientes.length ? repartir(d.precio, clientes.length) : [d.precio];
      for (let i = 0; i < partes.length; i++) {
        const g = await crearMovimiento({ tipo: 'gasto', importe: partes[i], fecha, categoria_id: cat.id, medio_pago: d.medio_pago, cliente_id: clientes[i] ?? null, nota });
        ids.push(g.movimiento.id);
        deshaceres.push(g.deshacer);
      }
    }
    let fianzaId: string | null = null;
    if (d.fianza > 0) {
      const f = await crearMovimiento({
        tipo: 'fianza_entregada', importe: d.fianza, fecha, categoria_id: null, medio_pago: d.medio_pago,
        fianza: { entregada_a: previa.proveedor_nombre, motivo: 'Furgoneta' },
      });
      fianzaId = f.movimiento.id;
      ids.push(fianzaId);
      deshaceres.push(f.deshacer);
    }
    reserva = {
      ...previa, estado: 'recogida', precio: d.precio, fianza_prevista: d.fianza, gasto_ids: ids.filter((x) => x !== fianzaId), fianza_id: fianzaId,
      actualizado_en: fecha, modificado_por: usuario, version: previa.version + 1,
    };
    await guardarAjuste(CLAVE_RESERVAS, antes.map((x) => (x.id === previa.id ? reserva : x)));
  });
  const copia = structuredClone(antes);
  return {
    reserva,
    movimientos: ids,
    deshacer: async () => {
      for (const x of deshaceres) await x();
      await guardarAjuste(CLAVE_RESERVAS, copia);
    },
  };
}

/**
 * «¿Devolviste la furgoneta? ¿Te devolvieron la fianza?» (§10.8.1): «Entera» o «Me descontaron algo» (importe devuelto).
 * La devolución y el gasto por la diferencia los hace `devolverFianza` (ya construido). La reserva queda devuelta.
 */
export async function registrarDevolucion(reservaId: string, devuelto: number, medio: MedioPago): Promise<{ deshacer: Deshacer }> {
  const { usuario } = await yo();
  const reservas = await leerReservas();
  const r = reservas.find((x) => x.id === reservaId && !x.eliminado_en);
  if (!r || r.estado !== 'recogida') throw new Error('Reserva no encontrada');
  const dinero = r.fianza_id ? await devolverFianza(r.fianza_id, devuelto, medio) : null;
  try {
    const c = await cambiarReservas((lista) =>
      lista.map((x) => (x.id === reservaId ? { ...x, estado: 'devuelta', actualizado_en: new Date().toISOString(), modificado_por: usuario, version: x.version + 1 } : x)),
    );
    return {
      deshacer: async () => {
        if (dinero) await dinero.deshacer();
        await c.deshacer();
      },
    };
  } catch (e) {
    if (dinero) await dinero.deshacer();
    throw e;
  }
}

/** Anular la reserva (antes de recogerla): borrado lógico. */
export async function cancelarReserva(reservaId: string): Promise<{ deshacer: Deshacer }> {
  const { usuario } = await yo();
  const c = await cambiarReservas((lista) =>
    lista.map((x) => {
      if (x.id !== reservaId) return x;
      if (x.estado !== 'reservada') throw new Error('La furgoneta ya está recogida');
      return { ...x, estado: 'cancelada', eliminado_en: new Date().toISOString(), modificado_por: usuario, version: x.version + 1 };
    }),
  );
  return { deshacer: c.deshacer };
}
