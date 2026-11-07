// Plantillas de material por tipo de trabajo y plantilla de ropa (§8.12, §10.10 puntos 3 y 4). Ola 8, encargo B.
//
// Se guardan en la tabla `ajustes` existente, con las claves y la forma que lee Preparar trabajo (encargo A,
// src/features/preparar/plantillas.ts → `leerPlantillas()`), sin cambiar el esquema:
//   - `plantillas_material`: Partial<Record<TipoTrabajo, string[]>>
//   - `plantilla_ropa`: PrendaPlantilla[]
// La trazabilidad de §3 (quién y cuándo cambió cada plantilla) va aparte, en `plantillas_preparacion_meta`, para no
// cambiar la forma que lee A. Solo el titular las cambia (§3); cada cambio devuelve su «Deshacer» (§5.4.1).
// Si no hay nada guardado, se parte de lo que fija la especificación (§8.12), sin inventar artículos.

import { db } from '../../../db/db';
import { borrarAjuste, guardarAjuste, leerAjuste, SinPermiso, type Deshacer } from '../../../db/repo';
import { TIPOS_TRABAJO, type TipoTrabajo } from '../../../domain/tipos';
import type { PlantillasMaterial, PrendaPlantilla } from '../../preparar/modelo';
import { CLAVE_PLANTILLA_ROPA, CLAVE_PLANTILLAS_MATERIAL, MATERIAL_POR_DEFECTO, ROPA_POR_DEFECTO } from '../../preparar/plantillas';

export const CLAVE_META = 'plantillas_preparacion_meta';
export const LARGO_MAXIMO = 60;

/** Usuario actual; solo el titular cambia plantillas y proveedores (§3). */
export async function titular(): Promise<{ usuario: string; negocio: string }> {
  const usuario = await leerAjuste<string>('usuario_actual', '');
  const negocio = await leerAjuste<string>('negocio_id', '');
  if (!usuario || !negocio) throw new Error('Base local sin preparar');
  if ((await db.usuarios.get(usuario))?.rol !== 'titular') throw new SinPermiso();
  return { usuario, negocio };
}

interface Meta {
  actualizado_en: string;
  modificado_por: string;
  version: number;
}

/**
 * Guarda una clave de `ajustes` con su traza y devuelve el «Deshacer», que deja la clave y la traza como estaban
 * (si antes no había nada, se borra y vuelve la plantilla de la especificación).
 */
export async function guardarConTraza(clave: string, valor: unknown): Promise<{ deshacer: Deshacer }> {
  const { usuario } = await titular();
  let antes: unknown = null;
  let metaAntes: Record<string, Meta> = {};
  await db.transaction('rw', db.ajustes, async () => {
    antes = await leerAjuste<unknown>(clave, null);
    metaAntes = await leerAjuste<Record<string, Meta>>(CLAVE_META, {});
    const previa = metaAntes[clave];
    await guardarAjuste(clave, valor);
    await guardarAjuste(CLAVE_META, {
      ...metaAntes,
      [clave]: { actualizado_en: new Date().toISOString(), modificado_por: usuario, version: (previa?.version ?? 0) + 1 },
    });
  });
  const copia = structuredClone(antes);
  const metaCopia = structuredClone(metaAntes);
  return {
    deshacer: async () => {
      await db.transaction('rw', db.ajustes, async () => {
        if (copia === null) await borrarAjuste(clave);
        else await guardarAjuste(clave, copia);
        await guardarAjuste(CLAVE_META, metaCopia);
      });
    },
  };
}

export const normal = (t: string) => t.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
const limpio = (t: string) => t.trim().replace(/\s+/g, ' ');
const capital = (t: string) => t.charAt(0).toLocaleUpperCase('es') + t.slice(1);

/** Valida un nombre de artículo o prenda: no vacío, corto y sin repetir en la lista. */
export function validarNombre(nombre: string, existentes: string[], excluir?: string): string {
  const n = limpio(nombre);
  if (!n) throw new Error('Escribe el nombre');
  if (n.length > LARGO_MAXIMO) throw new Error(`Como mucho ${LARGO_MAXIMO} letras`);
  if (existentes.some((x) => normal(x) === normal(n) && (excluir === undefined || normal(x) !== normal(excluir)))) throw new Error('Ya está en la lista');
  return capital(n);
}

// ---------- Material ----------

export async function leerMaterial(): Promise<PlantillasMaterial> {
  return (await leerAjuste<PlantillasMaterial | null>(CLAVE_PLANTILLAS_MATERIAL, null)) ?? MATERIAL_POR_DEFECTO;
}

/** Lista de un tipo de trabajo, sin repetidos ni vacíos. */
export function articulosLimpios(articulos: string[]): string[] {
  const r: string[] = [];
  for (const a of articulos) {
    const n = limpio(a);
    if (n && !r.some((x) => normal(x) === normal(n))) r.push(capital(n).slice(0, LARGO_MAXIMO));
  }
  return r;
}

/** Sustituye la lista de un tipo de trabajo. Una lista vacía quita el tipo (sin plantilla). */
export async function guardarMaterialTipo(tipo: TipoTrabajo, articulos: string[]): Promise<{ deshacer: Deshacer }> {
  if (!TIPOS_TRABAJO.some((t) => t.id === tipo)) throw new Error('Tipo de trabajo no válido');
  const actual = await leerMaterial();
  const lista = articulosLimpios(articulos);
  const nuevo: PlantillasMaterial = { ...actual };
  if (lista.length) nuevo[tipo] = lista;
  else delete nuevo[tipo];
  return guardarConTraza(CLAVE_PLANTILLAS_MATERIAL, nuevo);
}

/** Añade un artículo a un tipo de trabajo. También sirve para «Añadir siempre para [tipo]» desde Preparar (§10.8.2). */
export async function anadirArticuloPlantilla(tipo: TipoTrabajo, nombre: string): Promise<{ nombre: string; deshacer: Deshacer }> {
  const actual = await leerMaterial();
  const lista = actual[tipo] ?? [];
  const n = validarNombre(nombre, lista);
  const r = await guardarMaterialTipo(tipo, [...lista, n]);
  return { nombre: n, deshacer: r.deshacer };
}

export async function quitarArticuloPlantilla(tipo: TipoTrabajo, nombre: string): Promise<{ deshacer: Deshacer }> {
  const lista = (await leerMaterial())[tipo] ?? [];
  return guardarMaterialTipo(tipo, lista.filter((x) => normal(x) !== normal(nombre)));
}

export async function renombrarArticuloPlantilla(tipo: TipoTrabajo, antes: string, despues: string): Promise<{ deshacer: Deshacer }> {
  const lista = (await leerMaterial())[tipo] ?? [];
  const n = validarNombre(despues, lista, antes);
  return guardarMaterialTipo(tipo, lista.map((x) => (normal(x) === normal(antes) ? n : x)));
}

/** «Volver a la plantilla de siempre»: borra lo guardado y vuelve lo de §8.12. */
export const restaurarMaterial = () => guardarConTraza(CLAVE_PLANTILLAS_MATERIAL, MATERIAL_POR_DEFECTO);

// ---------- Ropa ----------

export async function leerRopa(): Promise<PrendaPlantilla[]> {
  const r = await leerAjuste<PrendaPlantilla[] | null>(CLAVE_PLANTILLA_ROPA, null);
  return Array.isArray(r) && r.length ? r : ROPA_POR_DEFECTO;
}

/** Plural sencillo en español para proponer el nombre de varias («Toalla» → «Toallas»). Se puede corregir a mano. */
export function pluralizar(nombre: string): string {
  const n = limpio(nombre);
  if (!n) return '';
  const [primera, ...resto] = n.split(' ');
  const cola = resto.length ? ` ${resto.join(' ')}` : '';
  if (/[sx]$/i.test(primera)) return n;
  if (/z$/i.test(primera)) return `${primera.slice(0, -1)}ces${cola}`;
  if (/[aeiouáéó]$/i.test(primera)) return `${primera}s${cola}`;
  if (/[íú]$/i.test(primera)) return `${primera}es${cola}`;
  return `${primera.replace(/ó(n)$/i, 'o$1').replace(/á(n)$/i, 'a$1')}es${cola}`;
}

export interface DatosPrenda {
  singular: string;
  plural: string;
  /** Se cuenta por pares: «Guantes (3 pares)». */
  pares: boolean;
  /** Una vez por equipo, no por persona: «Agua y protector». */
  porEquipo: boolean;
}

const claveNueva = (nombre: string, existentes: PrendaPlantilla[]) => {
  const base = normal(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'prenda';
  let k = base;
  for (let i = 2; existentes.some((p) => p.clave === k); i++) k = `${base}_${i}`;
  return k;
};

function prendaDe(d: DatosPrenda, clave: string, existentes: PrendaPlantilla[], excluir?: string): PrendaPlantilla {
  const singular = validarNombre(d.singular, existentes.map((p) => p.singular), excluir);
  const plural = limpio(d.plural) ? capital(limpio(d.plural)).slice(0, LARGO_MAXIMO) : pluralizar(singular);
  const p: PrendaPlantilla = { clave, singular, plural };
  if (d.pares && !d.porEquipo) p.unidad = { singular: 'par', plural: 'pares' };
  if (d.porEquipo) p.porEquipo = true;
  return p;
}

export async function anadirPrenda(d: DatosPrenda): Promise<{ prenda: PrendaPlantilla; deshacer: Deshacer }> {
  const actual = await leerRopa();
  const prenda = prendaDe(d, claveNueva(d.singular, actual), actual);
  const r = await guardarConTraza(CLAVE_PLANTILLA_ROPA, [...actual, prenda]);
  return { prenda, deshacer: r.deshacer };
}

export async function editarPrenda(clave: string, d: DatosPrenda): Promise<{ deshacer: Deshacer }> {
  const actual = await leerRopa();
  const previa = actual.find((p) => p.clave === clave);
  if (!previa) throw new Error('Prenda no encontrada');
  const prenda = prendaDe(d, clave, actual, previa.singular);
  return guardarConTraza(CLAVE_PLANTILLA_ROPA, actual.map((p) => (p.clave === clave ? prenda : p)));
}

export async function quitarPrenda(clave: string): Promise<{ deshacer: Deshacer }> {
  const actual = await leerRopa();
  const resto = actual.filter((p) => p.clave !== clave);
  if (!resto.length) throw new Error('Deja al menos una prenda');
  return guardarConTraza(CLAVE_PLANTILLA_ROPA, resto);
}

export const restaurarRopa = () => guardarConTraza(CLAVE_PLANTILLA_ROPA, ROPA_POR_DEFECTO);

/** «Por persona», «Por persona, en pares» o «Una para todo el equipo». */
export function textoCuenta(p: PrendaPlantilla): string {
  if (p.porEquipo) return 'Una para todo el equipo';
  return p.unidad ? 'Por persona, en pares' : 'Por persona';
}
