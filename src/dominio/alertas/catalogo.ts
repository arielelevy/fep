// Catálogo de alertas de clima (§12.2), niveles del semáforo con texto (§11.4, §17) y umbrales.
// Los umbrales del SEMÁFORO por tipo de trabajo (§11.3) viven en un solo lugar: `UMBRALES` de src/clima (frente A
// de la ola 6). Aquí sólo se reexportan y se documentan; los de ANTELACIÓN de las alertas (§12.2) están en
// `UMBRALES_ALERTAS`. Lo que la especificación no fija está marcado «supuesto» y anotado en PREGUNTAS.md.

import { ESTADOS, UMBRALES } from '../../clima';
import type { AccionAlerta, CanalAlerta, NivelAlerta, NivelSemaforoAlerta, SeccionAlerta, TipoAlertaClima } from './tipos';

export { UMBRALES as UMBRALES_SEMAFORO };

/** Antelaciones y criterios de las alertas de clima (§12.2). Configurables en un solo lugar. */
export const UMBRALES_ALERTAS = {
  /** CLIMA_INFO: ámbar o rojo por primera vez, 5 días antes. */
  diasInfo: 5,
  /** CLIMA_DECIDIR: sigue en rojo 2 días antes… */
  diasDecidir: 2,
  /** …y 4 días antes si ya es rojo con probabilidad de lluvia ≥ 80 %. */
  diasDecidirFuerte: 4,
  probLluviaFuerte: 80,
  /** CLIMA_AEMET: al emitirse, hasta 3 días antes. */
  diasAemet: 3,
  /** Más de 7 días vista no hay semáforo (§11.3): tampoco alertas. */
  diasSemaforo: 7,
  // ---- Mover visita (§10.7) ----
  /** Días propuestos. */
  opcionesDia: 3,
  /** Supuesto: se buscan días hasta el final de la franja de 14 días. */
  horizonteDias: 14,
  /** Supuesto: «hora razonable» = empezar entre 08:00 y 18:00 y acabar a las 20:00 como tarde. */
  horaPrimera: '08:00',
  horaUltimaInicio: '18:00',
  horaFinMaxima: '20:00',
  /** Supuesto: huecos cada 30 minutos. */
  pasoMinutos: 30,
  /** Hueco libre = sin solaparse con otra visita contando su duración más 30 min de desplazamiento (§10.7). */
  desplazamientoMinutos: 30,
  /** Supuesto: horas ofrecidas por día además de «Otra». */
  opcionesHora: 4,
} as const;

/** Texto de cada nivel del semáforo (siempre con palabras, §5.6.3). Los mismos que pinta la interfaz. */
export const TEXTO_SEMAFORO: Record<NivelSemaforoAlerta | 'gris', string> = {
  verde: ESTADOS.verde, // «Se puede ir»
  ambar: ESTADOS.ambar, // «Con cuidado»
  rojo: ESTADOS.rojo, // «Mejor mover»
  gris: ESTADOS.gris, // «Sin previsión»
};

export const RANGO_SEMAFORO: Record<NivelSemaforoAlerta, number> = { verde: 0, ambar: 1, rojo: 2 };
export const RANGO_AVISO = { amarillo: 1, naranja: 2, rojo: 3 } as const;

export const ACCIONES: Record<'mover' | 'mantener' | 'ver' | 'ver_opciones' | 'vale', AccionAlerta> = {
  mover: { id: 'mover', texto: 'Mover y avisar por WhatsApp Business' },
  mantener: { id: 'mantener', texto: 'Mantener la visita' },
  ver: { id: 'ver', texto: 'Ver' },
  ver_opciones: { id: 'ver_opciones', texto: 'Ver opciones' },
  vale: { id: 'vale', texto: 'Vale' },
};

export interface EntradaCatalogo {
  tipo: TipoAlertaClima;
  disparador: string;
  antelacion: string;
  nivel: NivelAlerta;
  seccion: SeccionAlerta;
  canal: CanalAlerta;
  accion_principal: AccionAlerta;
  accion_secundaria: AccionAlerta | null;
}

/** Catálogo de §12.2 (sólo clima; furgoneta, material, cobros… son de otras olas). */
export const CATALOGO_CLIMA: Record<TipoAlertaClima, EntradaCatalogo> = {
  CLIMA_INFO: {
    tipo: 'CLIMA_INFO',
    disparador: 'Visita con semáforo ámbar o rojo por primera vez',
    antelacion: '5 días antes',
    nivel: 'info',
    seccion: 'para_tener_en_cuenta',
    canal: 'resumen_diario',
    accion_principal: ACCIONES.ver,
    accion_secundaria: null,
  },
  CLIMA_DECIDIR: {
    tipo: 'CLIMA_DECIDIR',
    disparador: 'Visita sigue en rojo',
    antelacion: '2 días antes (y 4 días si ya es rojo con prob. ≥ 80 %)',
    nivel: 'decision',
    seccion: 'para_decidir',
    canal: 'resumen_diario',
    accion_principal: ACCIONES.mover,
    accion_secundaria: ACCIONES.mantener,
  },
  CLIMA_AEMET: {
    tipo: 'CLIMA_AEMET',
    disparador: 'Aviso oficial que afecta a una visita',
    antelacion: 'Al emitirse, hasta 3 días antes',
    nivel: 'decision',
    seccion: 'para_decidir',
    canal: 'inmediata',
    accion_principal: ACCIONES.ver_opciones,
    accion_secundaria: ACCIONES.mantener,
  },
  CLIMA_MEJORA: {
    tipo: 'CLIMA_MEJORA',
    disparador: 'Visita alertada pasa a verde',
    antelacion: 'Al detectarse',
    nivel: 'info',
    seccion: 'para_tener_en_cuenta',
    canal: 'resumen_diario',
    accion_principal: ACCIONES.vale,
    accion_secundaria: null,
  },
};

/**
 * Umbrales del semáforo por tipo de trabajo (§11.3), en texto, para documentación y ayuda. Los valores que usa el
 * motor son los de `UMBRALES_SEMAFORO` (src/clima/semaforo.ts).
 */
export const REGLAS_POR_TIPO: { tipos: string; rojo: string; ambar: string }[] = [
  { tipos: 'Corte de césped, desbroce', rojo: 'Prob. lluvia ≥ 60 % con ≥ 1 mm/h en la franja, o ≥ 5 mm en las 12 h previas', ambar: 'Prob. lluvia 30 a 59 %, o lluvia en parte de la franja' },
  { tipos: 'Setos y poda', rojo: 'Rachas ≥ 50 km/h o viento medio ≥ 40 km/h', ambar: 'Rachas 30 a 49 km/h, o prob. lluvia ≥ 60 %' },
  { tipos: 'Fitosanitarios', rojo: 'Viento ≥ 20 km/h, o prob. lluvia ≥ 50 % en la franja o las 6 h siguientes', ambar: 'Viento 12 a 19 km/h, o temperatura > 30 °C' },
  { tipos: 'Plantación', rojo: 'Mínima ≤ 0 °C el día o la noche siguiente', ambar: 'Lluvia ≥ 10 mm en el día' },
  { tipos: 'Abonado', rojo: 'Prob. lluvia ≥ 70 % con ≥ 5 mm/h', ambar: 'Prob. lluvia 40 a 69 %' },
  { tipos: 'Riego', rojo: 'Tormenta', ambar: 'Prob. lluvia ≥ 60 %' },
  { tipos: 'Piscina', rojo: 'Tormenta o aviso naranja/rojo', ambar: 'Lluvia ≥ 2,5 mm/h' },
  { tipos: 'Limpieza general, otro', rojo: 'Prob. lluvia ≥ 70 % con ≥ 2 mm/h', ambar: 'Prob. lluvia 40 a 69 %' },
  { tipos: 'Todos', rojo: 'Tormenta; ≥ 40 °C; aviso AEMET naranja o rojo', ambar: '≥ 35 °C; aviso AEMET amarillo' },
];
