// Tipos del clima y del semáforo de visitas (§11). Todas las horas son locales de Europe/Madrid (§4.3).

/** Coordenadas redondeadas a 2 decimales (~1 km) para agrupar consultas (§11.1). */
export interface Ubicacion {
  lat: number;
  lon: number;
}

/** Redondeo a 2 decimales (~1 km), §11.1: se consulta una vez por punto y las coordenadas van sin datos personales (§16.5). */
export const redondear = (u: Ubicacion): Ubicacion => ({ lat: Math.round(u.lat * 100) / 100, lon: Math.round(u.lon * 100) / 100 });

/** Centro de Madrid: ubicación de referencia de la franja de 14 días (§11.1; pregunta abierta §20.5). */
export const UBICACION_REFERENCIA: Ubicacion = { lat: 40.42, lon: -3.7 };

/** Una hora de previsión. `hora` es la clave local "AAAA-MM-DDTHH" de Madrid. */
export interface HoraClima {
  hora: string;
  prob_precipitacion: number; // %
  precipitacion: number; // mm en esa hora
  codigo_wmo: number;
  temperatura: number; // °C
  viento: number; // km/h, medio a 10 m
  rachas: number; // km/h
}

/** Resumen diario (franja de 14 días de la Agenda, §10.5). */
export interface DiaClima {
  fecha: string; // AAAA-MM-DD
  max: number;
  min: number;
  prob_precipitacion: number; // % máxima del día
  precipitacion: number; // mm del día
  codigo_wmo: number;
}

export interface Prevision {
  ubicacion: Ubicacion;
  horas: HoraClima[];
  dias: DiaClima[];
  actualizado_en: string; // ISO
  fuente: string; // "simulada", "open-meteo"…
}

export type NivelAviso = 'amarillo' | 'naranja' | 'rojo';
export type FenomenoAviso = 'viento' | 'lluvia' | 'tormenta' | 'calor' | 'nieve';

/** Aviso oficial (AEMET, formato CAP) ya asignado a la zona de la ubicación (§11.1, §13.4). */
export interface AvisoOficial {
  fecha: string; // AAAA-MM-DD
  nivel: NivelAviso;
  fenomeno: FenomenoAviso;
}

/** Proveedor de clima tras una interfaz propia (§13.2): el real (Open-Meteo/AEMET) se enchufa sin tocar el motor. */
export interface ProveedorClima {
  readonly nombre: string;
  /** Previsión horaria y diaria desde hoy (Madrid) para `dias` días (hasta 16). */
  prevision(ubicacion: Ubicacion, dias: number, senal?: AbortSignal): Promise<Prevision>;
  /** Avisos oficiales vigentes para la zona de la ubicación entre dos días (incluidos). */
  avisos?(ubicacion: Ubicacion, desde: string, hasta: string, senal?: AbortSignal): Promise<AvisoOficial[]>;
}

// ---------- Semáforo (§11.3, §11.4) ----------

export type NivelSemaforo = 'verde' | 'ambar' | 'rojo' | 'gris';

export type TipoCausa = 'lluvia' | 'cesped_mojado' | 'lluvia_dia' | 'viento' | 'rachas' | 'tormenta' | 'calor' | 'helada' | 'aviso';

/** Por qué una regla puso ámbar o rojo. `hora` es "HH:MM" local cuando aplica. */
export interface Causa {
  nivel: Exclude<NivelSemaforo, 'gris'>;
  tipo: TipoCausa;
  valor: number; // mm, %, km/h o °C según el tipo
  hora?: string;
  regla: string; // identificador de la regla, p. ej. "cesped.rojo.lluvia"
  fenomeno?: FenomenoAviso;
  nivelAviso?: NivelAviso;
}

export interface Semaforo {
  nivel: NivelSemaforo;
  /** Texto del estado, nunca solo color (§5.6.3): "Se puede ir", "Con cuidado", "Mejor mover", "Sin previsión", "Previsión orientativa". */
  estado: string;
  /** Etiqueta corta (máx. 40 caracteres, §11.4): "Se puede ir · Sol, 22°", "Lluvia a partir de las 13:00". */
  etiqueta: string;
  /** Consejo opcional cuando hay una acción útil (§11.4). */
  consejo?: string;
  /** Propuesta concreta del consejo (p. ej. mover a las 08:00 por el calor). */
  propuesta?: { hora: string };
  /** Por qué no hay semáforo (gris): "Falta la dirección del cliente", "Sin conexión"… */
  motivo?: string;
  /** Visita a más de 7 días: no se calcula semáforo (§11.3). */
  orientativo: boolean;
  causas: Causa[];
  calculado_en: string; // ISO
  /** Hora de la previsión usada, si la hubo. */
  actualizado_en?: string;
  /** Datos de prueba (proveedor simulado): la interfaz puede indicarlo. */
  simulado?: boolean;
}

/** Lo mínimo de una visita que necesita el motor. */
export interface VisitaClima {
  fecha: string; // AAAA-MM-DD
  hora_inicio: string | null; // "HH:MM"; sin hora se toma 09:00 (§8.4)
  duracion: number; // minutos
  tipos_trabajo: string[];
}
