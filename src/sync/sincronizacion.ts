// Sincronización local primero (§14). Todo se escribe antes en IndexedDB (Dexie) con UUID generado en el cliente y
// borrado lógico; la «cola de cambios» se deduce de los propios datos, sin tocar cada escritura:
//   - Un registro está pendiente si su `version` no es la última que se envió (cada creación, edición o borrado
//     lógico sube la versión). El borrado lógico viaja como un cambio más (`eliminado_en`).
//   - Los ajustes compartidos (preparaciones, reservas, plantillas, alertas…) están pendientes si su valor cambió.
//   - Las fotos de tickets se suben aparte, en segundo plano (`subida`).
// Se sincroniza al abrir la app, al recuperar la conexión y cada 60 segundos con la app abierta (§14.3).
//
// No hay servidor todavía (Supabase y sus cuentas están fuera de alcance sin autorización): el envío pasa por la
// interfaz `ServidorSync`. En la app instalada no hay ninguno configurado y los cambios quedan guardados en el móvil,
// pendientes; las pruebas usan un servidor simulado en memoria.

import { db } from '../db/db';
import { guardarAjuste, leerAjuste } from '../db/repo';

export const CLAVE_SYNC = 'sync_estado';
export const INTERVALO_SYNC_MS = 60_000;

/** Tablas que se sincronizan (todas llevan los campos comunes de §8). */
export const TABLAS_SYNC = ['movimientos', 'categorias', 'usuarios', 'clientes', 'deudas', 'visitas', 'series'] as const;
export type TablaSync = (typeof TABLAS_SYNC)[number];

/** Ajustes propios de este móvil: no se envían. */
export const AJUSTES_LOCALES = new Set(['usuario_actual', 'borrador_registro', CLAVE_SYNC, 'avisos_simulados']);

export interface Cambio {
  tabla: TablaSync | 'ajustes';
  id: string;
  version: number | null;
  datos: unknown;
}

export interface ServidorSync {
  /** Recibe un lote de cambios (alta, edición o borrado lógico). Si falla, se reintenta en la siguiente vuelta. */
  enviar(cambios: Cambio[]): Promise<void>;
  subirFoto(id: string, foto: Blob): Promise<void>;
}

export interface EstadoSync {
  /** tabla → id → versión enviada. */
  enviados: Partial<Record<TablaSync, Record<string, number>>>;
  /** clave de ajuste → valor enviado (JSON). */
  ajustes: Record<string, string>;
  ultima: string | null;
}

const estadoVacio = (): EstadoSync => ({ enviados: {}, ajustes: {}, ultima: null });

let servidor: ServidorSync | null = null;

/** Enchufa el servidor (o null). En la app instalada todavía no hay ninguno. */
export function configurarServidor(s: ServidorSync | null): void {
  servidor = s;
}
export const hayServidor = () => servidor !== null;

export async function leerEstadoSync(): Promise<EstadoSync> {
  return { ...estadoVacio(), ...(await leerAjuste<Partial<EstadoSync>>(CLAVE_SYNC, {})) };
}

export interface Pendientes {
  cambios: Cambio[];
  /** Ids de fotos sin subir. */
  fotos: string[];
}

/** La cola de cambios pendientes, deducida de los datos. */
export async function cambiosPendientes(): Promise<Pendientes> {
  const estado = await leerEstadoSync();
  const cambios: Cambio[] = [];
  for (const tabla of TABLAS_SYNC) {
    const enviados = estado.enviados[tabla] ?? {};
    const filas = (await db.table(tabla).toArray()) as { id: string; version: number }[];
    for (const f of filas) if (enviados[f.id] !== f.version) cambios.push({ tabla, id: f.id, version: f.version, datos: f });
  }
  for (const a of await db.ajustes.toArray()) {
    if (AJUSTES_LOCALES.has(a.clave)) continue;
    const json = JSON.stringify(a.valor);
    if (estado.ajustes[a.clave] !== json) cambios.push({ tabla: 'ajustes', id: a.clave, version: null, datos: a.valor });
  }
  const fotos = (await db.fotos.filter((f) => !f.subida).toArray()).map((f) => f.id);
  return { cambios, fotos };
}

export type ResultadoSync =
  | { estado: 'sin_servidor' | 'sin_conexion'; pendientes: number }
  | { estado: 'hecho'; enviados: number; fotos: number }
  | { estado: 'error'; pendientes: number };

let enCurso: Promise<ResultadoSync> | null = null;

const enLinea = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Envía lo pendiente si hay conexión y servidor. Nunca corre dos a la vez. */
export function sincronizar(): Promise<ResultadoSync> {
  if (enCurso) return enCurso;
  enCurso = (async (): Promise<ResultadoSync> => {
    const p = await cambiosPendientes();
    const total = p.cambios.length + p.fotos.length;
    if (!servidor) return { estado: 'sin_servidor', pendientes: total };
    if (!enLinea()) return { estado: 'sin_conexion', pendientes: total };
    const s = servidor;
    try {
      if (p.cambios.length) await s.enviar(p.cambios);
      // Se marca lo que se envió con la versión enviada: si algo cambió mientras tanto, sigue pendiente.
      await db.transaction('rw', db.ajustes, async () => {
        const e = await leerEstadoSync();
        for (const c of p.cambios) {
          if (c.tabla === 'ajustes') e.ajustes[c.id] = JSON.stringify(c.datos);
          else (e.enviados[c.tabla] ??= {})[c.id] = c.version as number;
        }
        e.ultima = new Date().toISOString();
        await guardarAjuste(CLAVE_SYNC, e);
      });
      let fotos = 0;
      for (const id of p.fotos) {
        const f = await db.fotos.get(id);
        if (!f || f.subida) continue;
        await s.subirFoto(id, f.blob);
        await db.fotos.update(id, { subida: true });
        fotos++;
      }
      return { estado: 'hecho', enviados: p.cambios.length, fotos };
    } catch (e) {
      console.error('No se pudo sincronizar; se reintenta luego', e);
      return { estado: 'error', pendientes: total };
    }
  })().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

/**
 * Conflictos (§14.4): última escritura gana POR CAMPO. Con la versión de partida (`base`), un campo cambiado solo en
 * un lado se queda con ese cambio; si cambió en los dos, gana el registro con `actualizado_en` más reciente.
 */
export function fusionarPorCampo<T extends { actualizado_en: string }>(base: T | null, local: T, remoto: T): T {
  const masNuevo = remoto.actualizado_en > local.actualizado_en ? remoto : local;
  if (!base) return { ...masNuevo };
  const r = { ...local } as Record<string, unknown>;
  const claves = new Set([...Object.keys(local), ...Object.keys(remoto)]);
  const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of claves) {
    const b = (base as Record<string, unknown>)[k];
    const l = (local as Record<string, unknown>)[k];
    const m = (remoto as Record<string, unknown>)[k];
    const cambioLocal = !igual(l, b);
    const cambioRemoto = !igual(m, b);
    if (cambioRemoto && !cambioLocal) r[k] = m;
    else if (cambioLocal && cambioRemoto) r[k] = (masNuevo as Record<string, unknown>)[k];
  }
  r.actualizado_en = masNuevo.actualizado_en;
  return r as T;
}
