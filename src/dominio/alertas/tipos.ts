// Contrato tipado del motor de alertas de clima (ola 7, frente A). La pantalla Alertas (frente B) consume esto.
// Spec: §8.13 (Alerta), §10.7 (Alertas y mover), §11 (clima), §12 (catálogo y principios), §13.1 (WhatsApp),
// §4.3 (convenciones: UUID, Europe/Madrid, borrado lógico, creado_por/modificado_por, importes en céntimos).

import type { AvisoOficial, FenomenoAviso, NivelAviso, Prevision, Semaforo, Ubicacion } from '../../clima';
import type { Comunes } from '../../domain/tipos';

/** Tipos de alerta de clima del catálogo §12.2. */
export type TipoAlertaClima = 'CLIMA_INFO' | 'CLIMA_DECIDIR' | 'CLIMA_AEMET' | 'CLIMA_MEJORA';

/** Nivel de la alerta (§8.13). Las de «decision» y «urgente» cuentan para la insignia de la campana (§10.1.1). */
export type NivelAlerta = 'info' | 'decision' | 'urgente';

/** Estado de la alerta (§8.13). */
export type EstadoAlerta = 'activa' | 'resuelta' | 'descartada' | 'caducada';

/** Nivel del semáforo que dispara la alerta. Siempre acompañado de texto («Mejor mover»), nunca sólo color. */
export type NivelSemaforoAlerta = 'verde' | 'ambar' | 'rojo';

/** Sección de la pantalla Alertas (§10.7) donde va la tarjeta. */
export type SeccionAlerta = 'para_decidir' | 'para_tener_en_cuenta';

/** Canal de aviso (§12.2): dentro del resumen diario de las 21:00 o inmediato (fuera de horas de silencio). */
export type CanalAlerta = 'resumen_diario' | 'inmediata';

/** Causa que se nombra en textos y en el mensaje al cliente (§13.1: «el motivo cambia según la causa»). */
export type CausaClima = 'lluvia' | 'viento' | 'tormenta' | 'calor' | 'helada' | 'nieve';

export type IdAccion = 'mover' | 'mantener' | 'ver' | 'ver_opciones' | 'vale';

export interface AccionAlerta {
  id: IdAccion;
  texto: string; // «Mover y avisar por WhatsApp Business», «Mantener la visita», «Ver», «Vale»
}

/** Alerta de clima de una visita (§8.13). Entidad con los campos comunes de §8 (UUID, trazabilidad, borrado lógico). */
export interface AlertaClima extends Comunes {
  tipo: TipoAlertaClima;
  nivel: NivelAlerta;
  seccion: SeccionAlerta;
  canal: CanalAlerta;
  /** Asunto: visita + día afectado (+ familia clima/aemet/mejora). Una sola alerta viva por asunto. */
  clave_asunto: string;
  /** Asunto + tipo + nivel: si cambia, la alerta se actualiza (mismo id) y puede volver a notificarse (§12.1.4). */
  clave_dedupe: string;
  entidad: { tipo: 'visita'; id: string };
  cliente_id: string; // UUID del cliente
  /** Día afectado (AAAA-MM-DD, Madrid) y hora de la visita ("HH:MM", 09:00 si no tiene). */
  fecha: string;
  hora: string;
  /** Días que faltan desde hoy (Madrid) al calcular. */
  dias_antelacion: number;
  semaforo: NivelSemaforoAlerta;
  /** Texto del semáforo: «Se puede ir», «Con cuidado», «Mejor mover». */
  estado_semaforo: string;
  /** Línea superior de la tarjeta: «MEJOR MOVER · EN 4 DÍAS», «AVISO AEMET · EN 2 DÍAS». */
  etiqueta_superior: string;
  /** Dato clave a la derecha: «80% lluvia», «Amarillo por viento». */
  dato_clave: string | null;
  /** «Jueves 15 · Fam. García». */
  titulo: string;
  /** «Corte de césped a las 09:00. Lluvia a partir de las 13:00.» */
  cuerpo: string;
  /** Frase para el resumen diario (§12.3): «Jueves 15: lluvia en Fam. García. ¿La movemos?». */
  texto_resumen: string;
  causa: CausaClima | null;
  aviso: AvisoOficial | null;
  accion_principal: AccionAlerta;
  accion_secundaria: AccionAlerta | null;
  estado: EstadoAlerta;
  /** null = pendiente de notificar con la clave_dedupe actual. */
  notificada_en: string | null;
  resuelta_en: string | null;
}

/** «Mantener la visita»: descarta el asunto hasta que empeore por encima de `rango` (§10.7, §12.1.4). */
export interface Descarte {
  clave_asunto: string;
  /** Gravedad descartada: semáforo (ámbar 1, rojo 2) o aviso (amarillo 1, naranja 2, rojo 3). */
  rango: number;
  descartado_en: string;
  descartado_por: string;
}

/** Estado persistido del motor. */
export interface EstadoAlertas {
  alertas: AlertaClima[];
  descartes: Descarte[];
}

/** Clima ya conseguido para un cliente: previsión (null = «Sin previsión») y avisos oficiales de su zona. */
export interface ClimaCliente {
  ubicacion: Ubicacion | null;
  prevision: Prevision | null;
  avisos: AvisoOficial[];
  motivo?: string;
}

/** Resultado de recalcular: el estado nuevo y qué cambió. */
export interface ResultadoRecalculo {
  estado: EstadoAlertas;
  nuevas: AlertaClima[];
  actualizadas: AlertaClima[];
  resueltas: AlertaClima[];
  caducadas: AlertaClima[];
  /** Alertas activas con notificada_en null: lo que toca avisar (por su canal). */
  pendientes_de_aviso: AlertaClima[];
}

// ---------- Mover la visita (§10.7) ----------

/** Una opción de día para mover (radio «¿A qué día?»). */
export interface OpcionDia {
  fecha: string; // AAAA-MM-DD
  /** «Viernes 16». */
  texto_dia: string;
  /** Primera hora libre propuesta ese día (la original si está libre). */
  hora: string;
  /** Tiempo previsto: «Sol», «40% lluvia», «Sin previsión», «Previsión orientativa». */
  tiempo: string;
  semaforo: Semaforo['nivel'];
  sugerido: boolean;
  /** Fuera de los días preferidos del cliente (sólo si no quedaban días preferidos libres). */
  fuera_de_preferidos: boolean;
}

/** Una opción de hora (radio «¿A qué hora?»). */
export interface OpcionHora {
  hora: string; // "HH:MM"
  original: boolean;
  tiempo: string;
  semaforo: Semaforo['nivel'];
}

export interface PropuestaMover {
  visita_id: string;
  dias: OpcionDia[];
  /** Horas libres del primer día propuesto (las de otro día: `horasLibres`). */
  horas: OpcionHora[];
  /** Texto fijo de la pantalla. */
  nota_horas: string;
}

export type FenomenoAemet = FenomenoAviso;
export type NivelAemet = NivelAviso;
