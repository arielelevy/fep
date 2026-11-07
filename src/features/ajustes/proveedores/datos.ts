// Proveedores de alquiler (§8.14, §10.10 punto 6) y antelación del aviso de furgoneta (§10.10 punto 5). Ola 8, encargo B.
//
// Se guardan en la tabla `ajustes` existente con la clave y la forma que lee Preparar trabajo (encargo A,
// `leerPlantillas()` → `proveedores_alquiler`: { id, nombre, telefono, precio_dia, fianza_habitual, habitual }), más la
// dirección (§8.14) y los campos comunes de §8. Precargan el formulario «Ya la reservé» y el botón «Llamar a …».
//
// Borrado lógico (§14): un proveedor quitado sale de `proveedores_alquiler` (A lee esa lista tal cual y no debe verlo)
// y se conserva con `eliminado_en` en `proveedores_alquiler_borrados`, porque las reservas viejas pueden apuntar a él.

import { db, nuevoId } from '../../../db/db';
import { guardarAjuste, leerAjuste, normalizarTelefono, type Deshacer } from '../../../db/repo';
import type { Comunes } from '../../../domain/tipos';
import { IMPORTE_MAXIMO } from '../../../lib/dinero';
import { CLAVE_PROVEEDORES, type ProveedorAlquiler } from '../../preparar/plantillas';
import { titular } from '../plantillas/datos';

export const CLAVE_BORRADOS = 'proveedores_alquiler_borrados';
export const CLAVE_AVISO_FURGO = 'aviso_furgo_dias';
export const AVISO_FURGO_POR_DEFECTO = 4;
export const AVISO_FURGO_OPCIONES = [3, 4, 5] as const;

export interface Proveedor extends ProveedorAlquiler, Comunes {
  direccion: string | null;
}

export interface DatosProveedor {
  nombre: string;
  telefono: string;
  direccion: string;
  /** Céntimos por día, o null si no se sabe. */
  precio_dia: number | null;
  /** Céntimos, o null si no se sabe. */
  fianza_habitual: number | null;
  habitual: boolean;
}

export const leerProveedores = () => leerAjuste<Proveedor[]>(CLAVE_PROVEEDORES, []);

function validar(d: DatosProveedor, lista: Proveedor[], id?: string): { nombre: string; telefono: string | null; direccion: string | null } {
  const nombre = d.nombre.trim().replace(/\s+/g, ' ');
  if (!nombre) throw new Error('Falta el nombre');
  if (nombre.length > 60) throw new Error('Como mucho 60 letras');
  if (lista.some((p) => p.id !== id && p.nombre.trim().toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es'))) throw new Error('Ya tienes un proveedor con ese nombre');
  const telefono = d.telefono.trim() ? normalizarTelefono(d.telefono) : null;
  if (d.telefono.trim() && !telefono) throw new Error('Teléfono no válido');
  for (const x of [d.precio_dia, d.fianza_habitual]) {
    if (x !== null && (!Number.isInteger(x) || x < 0 || x > IMPORTE_MAXIMO)) throw new Error('Importe no válido');
  }
  return { nombre, telefono, direccion: d.direccion.trim() || null };
}

/** Cambia la lista en una transacción y devuelve el «Deshacer» que la deja como estaba. */
async function cambiar(cambio: (lista: Proveedor[], borrados: Proveedor[]) => { lista: Proveedor[]; borrados?: Proveedor[] }): Promise<Deshacer> {
  let antes: Proveedor[] = [];
  let borradosAntes: Proveedor[] = [];
  await db.transaction('rw', db.ajustes, async () => {
    antes = await leerProveedores();
    borradosAntes = await leerAjuste<Proveedor[]>(CLAVE_BORRADOS, []);
    const r = cambio(structuredClone(antes), structuredClone(borradosAntes));
    await guardarAjuste(CLAVE_PROVEEDORES, r.lista);
    if (r.borrados) await guardarAjuste(CLAVE_BORRADOS, r.borrados);
  });
  const copia = structuredClone(antes);
  const copiaBorrados = structuredClone(borradosAntes);
  return async () => {
    await db.transaction('rw', db.ajustes, async () => {
      await guardarAjuste(CLAVE_PROVEEDORES, copia);
      await guardarAjuste(CLAVE_BORRADOS, copiaBorrados);
    });
  };
}

/** Solo uno es el habitual: marcar uno desmarca los demás. El primero que se añade queda como habitual. */
const conHabitual = (lista: Proveedor[], id: string | null) =>
  lista.map((p) => (id === null ? p : p.habitual !== (p.id === id) ? { ...p, habitual: p.id === id } : p));

export async function guardarProveedor(d: DatosProveedor, id?: string): Promise<{ proveedor: Proveedor; deshacer: Deshacer }> {
  const { usuario, negocio } = await titular();
  let proveedor!: Proveedor;
  const deshacer = await cambiar((lista) => {
    const v = validar(d, lista, id);
    const ahora = new Date().toISOString();
    const previo = id ? lista.find((p) => p.id === id) : undefined;
    if (id && !previo) throw new Error('Proveedor no encontrado');
    const habitual = d.habitual || lista.filter((p) => p.id !== id).length === 0;
    proveedor = {
      ...(previo ?? { id: nuevoId(), negocio_id: negocio, creado_en: ahora, creado_por: usuario, eliminado_en: null, version: 0 }),
      ...v,
      precio_dia: d.precio_dia,
      fianza_habitual: d.fianza_habitual,
      habitual,
      actualizado_en: ahora,
      modificado_por: usuario,
      version: (previo?.version ?? 0) + 1,
    };
    const nueva = previo ? lista.map((p) => (p.id === id ? proveedor : p)) : [...lista, proveedor];
    return { lista: conHabitual(nueva, habitual ? proveedor.id : null) };
  });
  return { proveedor, deshacer };
}

export async function marcarHabitual(id: string): Promise<{ deshacer: Deshacer }> {
  const { usuario } = await titular();
  const deshacer = await cambiar((lista) => {
    if (!lista.some((p) => p.id === id)) throw new Error('Proveedor no encontrado');
    const ahora = new Date().toISOString();
    return {
      lista: conHabitual(lista, id).map((p, i) =>
        p.habitual !== lista[i].habitual ? { ...p, actualizado_en: ahora, modificado_por: usuario, version: p.version + 1 } : p,
      ),
    };
  });
  return { deshacer };
}

/** Quitar (borrado lógico). Si era el habitual, pasa a serlo el siguiente. */
export async function quitarProveedor(id: string): Promise<{ deshacer: Deshacer }> {
  const { usuario } = await titular();
  const deshacer = await cambiar((lista, borrados) => {
    const p = lista.find((x) => x.id === id);
    if (!p) throw new Error('Proveedor no encontrado');
    const ahora = new Date().toISOString();
    let resto = lista.filter((x) => x.id !== id);
    if (p.habitual && resto.length) resto = conHabitual(resto, resto[0].id);
    return { lista: resto, borrados: [...borrados, { ...p, habitual: false, eliminado_en: ahora, modificado_por: usuario, actualizado_en: ahora, version: p.version + 1 }] };
  });
  return { deshacer };
}

// ---------- Antelación del aviso de furgoneta (§10.10.5: por defecto 4 días; 3 a 5) ----------

export async function leerAvisoFurgo(): Promise<number> {
  const n = await leerAjuste<number>(CLAVE_AVISO_FURGO, AVISO_FURGO_POR_DEFECTO);
  return (AVISO_FURGO_OPCIONES as readonly number[]).includes(n) ? n : AVISO_FURGO_POR_DEFECTO;
}

export async function guardarAvisoFurgo(dias: number): Promise<{ deshacer: Deshacer }> {
  if (!(AVISO_FURGO_OPCIONES as readonly number[]).includes(dias)) throw new Error('Entre 3 y 5 días');
  await titular();
  const antes = await leerAvisoFurgo();
  await guardarAjuste(CLAVE_AVISO_FURGO, dias);
  return { deshacer: () => guardarAjuste(CLAVE_AVISO_FURGO, antes) };
}
