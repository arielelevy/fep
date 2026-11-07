// Geocodificación de direcciones de clientes (§13.3, §10.4.3) tras una interfaz propia.
// Ola 6, frente B. El proveedor real (Google, Apple MapKit o Nominatim) es decisión del equipo de IT y queda
// fuera: aquí sólo hay un proveedor SIMULADO, determinista y sin red, para poder guardar coordenadas y ver el
// tiempo de cada visita. El real se enchufa con `configurarGeocodificador(...)` sin tocar las pantallas.
//
// Reglas: se geocodifica al crear o editar el cliente; no se vuelve a geocodificar si la dirección no cambia;
// sin conexión no se bloquea el guardado (el cliente queda sin coordenadas y se busca después).

export interface Coordenadas {
  lat: number;
  lon: number;
}

export interface ResultadoGeocodificacion extends Coordenadas {
  /** Dirección tal como la entendió el proveedor ("Calle Mayor 3, Rivas-Vaciamadrid"). */
  etiqueta: string;
  /** El punto es aproximado (municipio sin calle, o proveedor simulado). */
  aproximado: boolean;
  /** Datos de prueba: la interfaz lo indica para no presentarlos como reales. */
  simulado: boolean;
}

/** Proveedor de geocodificación (§13.3). Devuelve null si no encuentra la dirección. */
export interface Geocodificador {
  readonly nombre: string;
  geocodificar(direccion: string, municipio: string, senal?: AbortSignal): Promise<ResultadoGeocodificacion | null>;
}

export type EstadoGeocodificacion = 'encontrada' | 'no_encontrada' | 'sin_direccion' | 'sin_conexion' | 'sin_servicio' | 'error';

export interface RespuestaGeocodificacion {
  estado: EstadoGeocodificacion;
  resultado: ResultadoGeocodificacion | null;
}

/** Textos neutros para cada estado sin coordenadas (microcopy §17: sin culpas ni tecnicismos). */
export const TEXTOS_GEOCODIFICACION: Record<Exclude<EstadoGeocodificacion, 'encontrada'>, string> = {
  no_encontrada: 'No encuentro esa dirección. Revisa la calle y el municipio.',
  sin_direccion: 'Añade la dirección para ver el tiempo de cada visita.',
  sin_conexion: 'Sin conexión. Guardo el cliente y buscamos la ubicación al volver.',
  sin_servicio: 'El mapa no está disponible ahora. Guardo el cliente igualmente.',
  error: 'No pude buscar la dirección ahora. Guardo el cliente igualmente.',
};

// ---------- Proveedor simulado ----------

/** Centros aproximados de municipios donde trabaja FERGO (Madrid y alrededores). */
const MUNICIPIOS: Record<string, Coordenadas> = {
  madrid: { lat: 40.4168, lon: -3.7038 },
  aravaca: { lat: 40.4617, lon: -3.7838 },
  'pozuelo de alarcon': { lat: 40.4351, lon: -3.8137 },
  majadahonda: { lat: 40.4731, lon: -3.8722 },
  'las rozas': { lat: 40.4929, lon: -3.8737 },
  'las rozas de madrid': { lat: 40.4929, lon: -3.8737 },
  'boadilla del monte': { lat: 40.405, lon: -3.8783 },
  'villaviciosa de odon': { lat: 40.3577, lon: -3.9006 },
  alcorcon: { lat: 40.3458, lon: -3.8249 },
  mostoles: { lat: 40.3223, lon: -3.865 },
  getafe: { lat: 40.3057, lon: -3.7329 },
  leganes: { lat: 40.3272, lon: -3.7635 },
  fuenlabrada: { lat: 40.2842, lon: -3.7942 },
  'rivas-vaciamadrid': { lat: 40.3567, lon: -3.5321 },
  'rivas vaciamadrid': { lat: 40.3567, lon: -3.5321 },
  alcobendas: { lat: 40.5475, lon: -3.642 },
  'san sebastian de los reyes': { lat: 40.5474, lon: -3.6261 },
  'tres cantos': { lat: 40.6009, lon: -3.7083 },
  torrelodones: { lat: 40.5772, lon: -3.9287 },
  galapagar: { lat: 40.578, lon: -4.0037 },
  'collado villalba': { lat: 40.6348, lon: -4.0053 },
  colmenarejo: { lat: 40.5608, lon: -4.0173 },
  'alcala de henares': { lat: 40.4818, lon: -3.3635 },
  'torrejon de ardoz': { lat: 40.4598, lon: -3.4797 },
  'san lorenzo de el escorial': { lat: 40.5918, lon: -4.1474 },
  'villanueva de la canada': { lat: 40.4467, lon: -4.0045 },
  'villanueva del pardillo': { lat: 40.4904, lon: -3.9662 },
};

/** Minúsculas, sin tildes ni espacios sobrantes. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hash entero estable (FNV-1a) para que la misma dirección dé siempre el mismo punto. */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const redondear5 = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Proveedor simulado y determinista: el municipio conocido da su centro y la calle desplaza el punto hasta
 * ±0,012° (≈ 1 km). Un municipio desconocido cae en Madrid. Una dirección sin letras ("123") no se encuentra.
 */
export function crearGeocodificadorSimulado(op: { fallar?: boolean; retrasoMs?: number } = {}): Geocodificador {
  return {
    nombre: 'simulado',
    async geocodificar(direccion, municipio, senal) {
      if (op.retrasoMs) await new Promise((r) => setTimeout(r, op.retrasoMs));
      if (senal?.aborted) throw new DOMException('Cancelado', 'AbortError');
      if (op.fallar) throw new Error('Geocodificador simulado: fallo');
      const calle = normalizar(direccion);
      const pueblo = normalizar(municipio);
      if (!/[a-z]/.test(calle) && !pueblo) return null;
      if (calle && !/[a-z]/.test(calle)) return null;
      const centro = MUNICIPIOS[pueblo] ?? MUNICIPIOS.madrid;
      const h = calle ? hash(`${calle}|${pueblo}`) : 0;
      const dLat = calle ? ((h % 2001) / 1000 - 1) * 0.012 : 0;
      const dLon = calle ? (((h >>> 11) % 2001) / 1000 - 1) * 0.012 : 0;
      return {
        lat: redondear5(centro.lat + dLat),
        lon: redondear5(centro.lon + dLon),
        etiqueta: [direccion.trim(), municipio.trim()].filter(Boolean).join(', '),
        aproximado: true,
        simulado: true,
      };
    },
  };
}

// ---------- Servicio en uso ----------

let actual: Geocodificador | null | undefined;

const CLAVE_SIMULADA = 'fergo.geocodificacion.simulada';

/**
 * Proveedor simulado SOLO en desarrollo, en pruebas o activado a mano (localStorage
 * `fergo.geocodificacion.simulada = 1`), como el clima del frente A. En producción, mientras no se enchufe el real,
 * no hay servicio: un punto inventado podría quedar guardado y «Cómo llegar» llevaría a un sitio equivocado
 * (decisión pendiente de Ariel, ver informe de la ola 6, frente B).
 */
export function usarGeocodificacionSimulada(): boolean {
  try {
    if (window.localStorage.getItem(CLAVE_SIMULADA) === '1') return true;
  } catch {
    /* sin almacenamiento */
  }
  return Boolean(import.meta.env?.DEV || import.meta.env?.MODE === 'test');
}

/** Proveedor en uso (null = sin servicio: el cliente se guarda igual, sin coordenadas). */
export function geocodificadorActual(): Geocodificador | null {
  if (actual === undefined) actual = usarGeocodificacionSimulada() ? crearGeocodificadorSimulado() : null;
  return actual;
}

/** Enchufa el proveedor real o uno de pruebas. `null` = sin servicio. `undefined` vuelve al simulado. */
export function configurarGeocodificador(g: Geocodificador | null | undefined): void {
  actual = g;
}

const enLineaPorDefecto = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/**
 * Geocodifica sin lanzar nunca: devuelve un estado para que la pantalla muestre un texto neutro y el guardado
 * del cliente no se bloquee (§14.1: geocodificar es lo único que necesita conexión).
 */
export async function geocodificar(
  direccion: string,
  municipio: string,
  op: { senal?: AbortSignal; enLinea?: () => boolean; esperaMs?: number } = {},
): Promise<RespuestaGeocodificacion> {
  if (!direccion.trim() && !municipio.trim()) return { estado: 'sin_direccion', resultado: null };
  const g = geocodificadorActual();
  if (!g) return { estado: 'sin_servicio', resultado: null };
  if (!(op.enLinea ?? enLineaPorDefecto)()) return { estado: 'sin_conexion', resultado: null };
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    const espera = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error('Tiempo de espera agotado')), op.esperaMs ?? 8000);
    });
    const resultado = await Promise.race([g.geocodificar(direccion, municipio, op.senal), espera]);
    return resultado ? { estado: 'encontrada', resultado } : { estado: 'no_encontrada', resultado: null };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { estado: 'error', resultado: null };
  } finally {
    clearTimeout(temporizador);
  }
}

/** Clave de una dirección para saber si cambió (no se vuelve a geocodificar si no cambia, §13.3). */
export const claveDireccion = (direccion: string, municipio: string) => `${normalizar(direccion)}|${normalizar(municipio)}`;
