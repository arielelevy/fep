// Mensajes prerredactados al cliente y enlace wa.me (§13.1). La app NO envía nada: abre el chat con el texto
// escrito y el usuario pulsa enviar. Los textos son editables después en la interfaz (frente B).

import { formatearEuros } from '../../lib/dinero';
import { diaEnFrase } from './textos';
import type { CausaClima } from './tipos';

/** Nombre y negocio que firman los mensajes (plantillas fijas en la v1, §13.1). */
export const FIRMA = { nombre: 'Felipe', negocio: 'FERGO' } as const;

const saludo = () => `Hola, soy ${FIRMA.nombre} de ${FIRMA.negocio}.`;

/** «Por la lluvia prevista», «Por el viento previsto»… (el motivo cambia según la causa, §13.1). */
export const MOTIVO_CLIMA: Record<CausaClima, string> = {
  lluvia: 'Por la lluvia prevista',
  viento: 'Por el viento previsto',
  tormenta: 'Por la tormenta prevista',
  calor: 'Por el calor previsto',
  helada: 'Por la helada prevista',
  nieve: 'Por la nieve prevista',
};

/**
 * Mover visita (§13.1). Con causa de clima: «Hola, soy Felipe de FERGO. Por la lluvia prevista el jueves 15, ¿te va
 * bien que pase el viernes 16 a las 09:00?». Sin causa: plantilla «por otro motivo».
 */
export function mensajeMoverVisita(p: { fechaOriginal: string; fechaNueva: string; horaNueva: string; causa: CausaClima | null }): string {
  const original = diaEnFrase(p.fechaOriginal);
  const nuevo = diaEnFrase(p.fechaNueva);
  if (p.causa) return `${saludo()} ${MOTIVO_CLIMA[p.causa]} el ${original}, ¿te va bien que pase el ${nuevo} a las ${p.horaNueva}?`;
  return `${saludo()} ¿Te va bien que la visita del ${original} la pase al ${nuevo} a las ${p.horaNueva}?`;
}

/** Cancelar visita (§13.1). */
export function mensajeCancelarVisita(fechaOriginal: string): string {
  return `${saludo()} Tengo que cancelar la visita del ${diaEnFrase(fechaOriginal)}. Te escribo para buscar otro día.`;
}

/** Recordatorio de cobro (§13.1). `importe` en céntimos. */
export function mensajeRecordatorioCobro(concepto: string, importe: number): string {
  return `${saludo()} Te recuerdo el pago de ${concepto} (${formatearEuros(importe)}). Puedes hacerlo por Bizum a este número. ¡Gracias!`;
}

/** Teléfono E.164 válido: «+» y de 8 a 15 dígitos (§4.3). */
export const esE164 = (t: string | null | undefined): t is string => typeof t === 'string' && /^\+[1-9]\d{7,14}$/.test(t);

/**
 * Enlace universal de WhatsApp (§13.1): `https://wa.me/<teléfono sin +>?text=<mensaje codificado>`.
 * null si el teléfono no es E.164 (la interfaz muestra «Añade su teléfono para avisarle» y «Mover visita»).
 */
export function enlaceWhatsApp(telefono: string | null | undefined, texto?: string): string | null {
  if (!esE164(telefono)) return null;
  const base = `https://wa.me/${telefono.slice(1)}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}
