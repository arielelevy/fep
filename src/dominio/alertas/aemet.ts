// Avisos oficiales AEMET (§11.1, §13.4) en un formato parecido a CAP (Common Alerting Protocol), ya leído a objeto.
// NO se llama a AEMET real: el proveedor real (OpenData con clave de API) queda fuera. Aquí hay:
// - la estructura CAP mínima que se usa (info, parámetros Meteoalerta, área con polígono y zona);
// - `avisosDesdeCap`: asigna los avisos a una ubicación por polígono (§11.1) y los pasa a `AvisoOficial` por día;
// - `crearProveedorAemetSimulado(alertasCap)`: proveedor falso a partir de fixtures (ver fixtures/aemet.ts).
// En la app real NO hay proveedor de avisos activo: `proveedorAemetPorDefecto()` devuelve null.

import type { AvisoOficial, FenomenoAviso, NivelAviso, Ubicacion } from '../../clima';
import { claveDia, sumarDias } from '../../lib/fechas';
import { RANGO_AVISO } from './catalogo';

/** Parámetro CAP (`<parameter><valueName/><value/></parameter>`). */
export interface ParametroCap {
  valueName: string;
  value: string;
}

/** Área CAP: polígono «lat,lon lat,lon …» (cerrado) y código de zona Meteoalerta. */
export interface AreaCap {
  areaDesc: string;
  polygon: string;
  geocode: ParametroCap;
}

export interface InfoCap {
  language: string; // "es-ES"
  category: 'Met';
  event: string; // "Aviso amarillo de viento"
  urgency: string;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
  certainty: string;
  onset: string; // ISO con zona
  expires: string; // ISO con zona
  headline: string;
  parameter: ParametroCap[]; // AEMET-Meteoalerta nivel / fenomeno / parametro
  area: AreaCap[];
}

export interface AlertaCap {
  identifier: string;
  sender: string;
  sent: string;
  status: 'Actual' | 'Test' | 'Exercise';
  msgType: 'Alert' | 'Update' | 'Cancel';
  scope: 'Public';
  info: InfoCap[];
}

/** Proveedor de avisos oficiales (la misma firma que `ProveedorClima.avisos` de src/clima). */
export interface ProveedorAvisos {
  readonly nombre: string;
  avisos(u: Ubicacion, desde: string, hasta: string): Promise<AvisoOficial[]>;
}

/** Códigos de fenómeno Meteoalerta → fenómenos que importan a FERGO (§13.4). El resto se ignora. */
const FENOMENOS: Record<string, FenomenoAviso> = {
  VI: 'viento',
  PR: 'lluvia',
  TO: 'tormenta',
  TM: 'calor',
  NE: 'nieve',
};

const NIVELES: Record<string, NivelAviso> = { amarillo: 'amarillo', naranja: 'naranja', rojo: 'rojo' };

/** Punto dentro de polígono (ray casting) con «lat,lon lat,lon …». */
export function dentroDePoligono(u: Ubicacion, poligono: string): boolean {
  const pts = poligono
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number) as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i];
    const [yj, xj] = pts[j];
    if (yi > u.lat !== yj > u.lat && u.lon < ((xj - xi) * (u.lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const parametro = (info: InfoCap, nombre: string) => info.parameter.find((p) => p.valueName === nombre)?.value;

/**
 * Avisos que afectan a la ubicación entre dos días (incluidos), uno por día y fenómeno con el nivel más alto.
 * Ignora alertas de prueba, canceladas, verdes y fenómenos que no son de §13.4.
 */
export function avisosDesdeCap(alertas: AlertaCap[], u: Ubicacion, desde: string, hasta: string): AvisoOficial[] {
  const porClave = new Map<string, AvisoOficial>();
  for (const a of alertas) {
    if (a.status !== 'Actual' || a.msgType === 'Cancel') continue;
    for (const info of a.info) {
      const nivel = NIVELES[(parametro(info, 'AEMET-Meteoalerta nivel') ?? '').toLowerCase()];
      const codigo = (parametro(info, 'AEMET-Meteoalerta fenomeno') ?? '').split(';')[0].trim().toUpperCase();
      const fenomeno = FENOMENOS[codigo];
      if (!nivel || !fenomeno) continue;
      if (!info.area.some((ar) => dentroDePoligono(u, ar.polygon))) continue;
      // Días (Madrid) que cubre el aviso: de onset a expires (expires exclusivo al minuto).
      const inicio = claveDia(info.onset);
      const fin = claveDia(new Date(new Date(info.expires).getTime() - 60_000));
      for (let d = inicio < desde ? desde : inicio; d <= fin && d <= hasta; d = sumarDias(d, 1)) {
        const k = `${d}|${fenomeno}`;
        const previo = porClave.get(k);
        if (!previo || RANGO_AVISO[nivel] > RANGO_AVISO[previo.nivel]) porClave.set(k, { fecha: d, nivel, fenomeno });
      }
    }
  }
  return [...porClave.values()].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.fenomeno.localeCompare(y.fenomeno));
}

/** Proveedor falso a partir de alertas CAP (fixtures). Sin red. */
export function crearProveedorAemetSimulado(alertas: AlertaCap[] | (() => AlertaCap[])): ProveedorAvisos {
  return {
    nombre: 'aemet-simulado',
    async avisos(u, desde, hasta) {
      return avisosDesdeCap(typeof alertas === 'function' ? alertas() : alertas, u, desde, hasta);
    },
  };
}

/** En la app real no hay avisos oficiales hasta enchufar AEMET OpenData (fuera de alcance): null. */
export function proveedorAemetPorDefecto(): ProveedorAvisos | null {
  return null;
}
