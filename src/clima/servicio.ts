import { DIAS_CORTOS, claveDia, diaSemanaDeClave, sumarDias } from '../lib/fechas';
import { redondear } from './proveedorSimulado';
import type { AvisoOficial, Prevision, ProveedorClima, Ubicacion } from './tipos';
import { iconoWmo, type IconoTiempo } from './wmo';

// Previsión con caché (§11.1, §14.1, §14.6): se guarda con su hora; al abrir la app, si tiene más de 3 horas y hay
// conexión, se refresca. Sin conexión o si el proveedor no responde se usa la última guardada, y si no hay ninguna
// el semáforo queda en «Sin previsión» sin romper la agenda.

export const HORAS_FRESCA = 3;
export const TIEMPO_ESPERA_MS = 8000;
export const DIAS_PREVISION = 16; // se piden 16, se usan 14 (§11.1)

/** Almacén de previsiones (localStorage en la app, memoria en las pruebas). */
export interface AlmacenClima {
  leer(clave: string): Prevision | null;
  guardar(clave: string, p: Prevision): void;
}

export function almacenEnMemoria(): AlmacenClima {
  const m = new Map<string, Prevision>();
  return { leer: (k) => m.get(k) ?? null, guardar: (k, p) => void m.set(k, p) };
}

/** Almacén en localStorage; si no está disponible (modo privado, sin permiso) cae a memoria sin romper. */
export function almacenLocal(prefijo = 'fergo.clima.'): AlmacenClima {
  const memoria = almacenEnMemoria();
  return {
    leer(k) {
      try {
        const t = window.localStorage.getItem(prefijo + k);
        return t ? (JSON.parse(t) as Prevision) : memoria.leer(k);
      } catch {
        return memoria.leer(k);
      }
    },
    guardar(k, p) {
      memoria.guardar(k, p);
      try {
        window.localStorage.setItem(prefijo + k, JSON.stringify(p));
      } catch {
        /* sin almacenamiento persistente: queda en memoria */
      }
    },
  };
}

export const claveUbicacion = (u: Ubicacion) => {
  const r = redondear(u);
  return `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
};

export type EstadoPrevision = 'fresca' | 'guardada' | 'sin_datos';

export interface ResultadoPrevision {
  prevision: Prevision | null;
  /** fresca: < 3 h o recién pedida; guardada: la última disponible (más vieja); sin_datos: no hay ninguna. */
  estado: EstadoPrevision;
  /** Por qué no está al día o no hay datos: "Sin conexión", "El servicio del tiempo no responde". */
  motivo?: string;
}

export const edadHoras = (p: Prevision, ahora: Date) => (ahora.getTime() - new Date(p.actualizado_en).getTime()) / 3_600_000;

/** "Actualizado hace 5 h" si tiene más de 3 horas (§14.6); null si está al día. */
export function textoActualizado(p: Prevision | null, ahora: Date = new Date()): string | null {
  if (!p) return null;
  const edad = edadHoras(p, ahora);
  if (edad <= HORAS_FRESCA) return null;
  const h = Math.floor(edad);
  if (h < 24) return `Actualizado hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Actualizado hace 1 día' : `Actualizado hace ${d} días`;
}

export interface OpcionesServicio {
  proveedor: ProveedorClima | null;
  almacen?: AlmacenClima;
  enLinea?: () => boolean;
  ahora?: () => Date;
  tiempoEsperaMs?: number;
}

export interface ServicioClima {
  /** Previsión de una ubicación: caché si está fresca; si no, la pide (con espera máxima) y la guarda. */
  prevision(u: Ubicacion, opciones?: { forzar?: boolean }): Promise<ResultadoPrevision>;
  /** Última previsión guardada, sin pedir nada (para pintar al instante, §10). */
  guardada(u: Ubicacion): Prevision | null;
  /** Avisos oficiales de la zona entre dos días (vacío si no hay proveedor o falla). */
  avisos(u: Ubicacion, desde: string, hasta: string): Promise<AvisoOficial[]>;
  readonly proveedor: ProveedorClima | null;
}

function conEspera<T>(p: Promise<T>, ms: number, control: AbortController): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const t = setTimeout(() => {
      control.abort();
      rechazar(new Error('El servicio del tiempo no responde'));
    }, ms);
    p.then((v) => { clearTimeout(t); resolver(v); }, (e) => { clearTimeout(t); rechazar(e); });
  });
}

export function crearServicioClima(op: OpcionesServicio): ServicioClima {
  const almacen = op.almacen ?? almacenEnMemoria();
  const enLinea = op.enLinea ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const ahora = op.ahora ?? (() => new Date());
  const enCurso = new Map<string, Promise<ResultadoPrevision>>();

  const pedir = async (u: Ubicacion, clave: string): Promise<ResultadoPrevision> => {
    const guardada = almacen.leer(clave);
    if (!op.proveedor) return guardada ? { prevision: guardada, estado: 'guardada', motivo: 'Sin proveedor del tiempo' } : { prevision: null, estado: 'sin_datos', motivo: 'Sin proveedor del tiempo' };
    if (!enLinea()) return guardada ? { prevision: guardada, estado: 'guardada', motivo: 'Sin conexión' } : { prevision: null, estado: 'sin_datos', motivo: 'Sin conexión' };
    try {
      const control = new AbortController();
      const p = await conEspera(op.proveedor.prevision(redondear(u), DIAS_PREVISION, control.signal), op.tiempoEsperaMs ?? TIEMPO_ESPERA_MS, control);
      almacen.guardar(clave, p);
      return { prevision: p, estado: 'fresca' };
    } catch {
      const motivo = 'El servicio del tiempo no responde';
      return guardada ? { prevision: guardada, estado: 'guardada', motivo } : { prevision: null, estado: 'sin_datos', motivo };
    }
  };

  return {
    proveedor: op.proveedor,
    guardada: (u) => almacen.leer(claveUbicacion(u)),
    async prevision(u, opciones = {}) {
      const clave = claveUbicacion(u);
      const guardada = almacen.leer(clave);
      if (!opciones.forzar && guardada && edadHoras(guardada, ahora()) < HORAS_FRESCA) return { prevision: guardada, estado: 'fresca' };
      // Varias visitas del mismo punto a la vez: una sola consulta (§11.1 agrupación).
      const actual = enCurso.get(clave);
      if (actual) return actual;
      const p = pedir(u, clave).finally(() => enCurso.delete(clave));
      enCurso.set(clave, p);
      return p;
    },
    async avisos(u, desde, hasta) {
      if (!op.proveedor?.avisos || !enLinea()) return [];
      try {
        const control = new AbortController();
        return await conEspera(op.proveedor.avisos(redondear(u), desde, hasta, control.signal), op.tiempoEsperaMs ?? TIEMPO_ESPERA_MS, control);
      } catch {
        return [];
      }
    },
  };
}

// ---------- Franja de 14 días (§10.5.2) ----------

export interface DiaPrevision {
  fecha: string;
  diaCorto: string; // "Lun"
  numero: number;
  icono: IconoTiempo | null; // null si no hay datos
  max: number | null;
  probLluvia: number | null;
  /** Días 8 a 14: «ORIENTATIVO» (§10.5.2). */
  orientativo: boolean;
}

/** 14 días desde hoy con su resumen; los días sin datos llevan valores null (la franja se pinta igual). */
export function diasPrevision(p: Prevision | null, ahora: Date = new Date(), dias = 14): DiaPrevision[] {
  const hoy = claveDia(ahora);
  const porFecha = new Map((p?.dias ?? []).map((d) => [d.fecha, d]));
  return Array.from({ length: dias }, (_, i) => {
    const fecha = sumarDias(hoy, i);
    const d = porFecha.get(fecha);
    return {
      fecha,
      diaCorto: DIAS_CORTOS[diaSemanaDeClave(fecha)],
      numero: Number(fecha.slice(8, 10)),
      icono: d ? iconoWmo(d.codigo_wmo) : null,
      max: d ? d.max : null,
      probLluvia: d ? d.prob_precipitacion : null,
      orientativo: i >= 7,
    };
  });
}
