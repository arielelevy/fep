// Motor de alertas de preparación (§12.2: FURGO_RESERVAR, FURGO_RECOGER, FURGO_DEVOLVER, MATERIAL_REVISAR,
// COMPRA_RECORDATORIO y ROPA_PREPARAR) y tarjetas «Preparar trabajos» de la pantalla Alertas (§10.7, §10.8.4).
// Ola 8, encargo B. Función pura: recibe visitas, clientes, preparaciones, reservas, plantillas, ajustes y `ahora`, y
// devuelve lo que toca hoy. Sin base de datos: la misma regla sirve a la pantalla, a la campana y al resumen diario.
// Lee los datos que escribe Preparar trabajo (encargo A, src/features/preparar/CONTRATO.md) con su lógica pública.

import type { Cliente, Visita } from '../../../domain/tipos';
import { claveDia, DIAS_LARGOS, diaSemanaDeClave, sumarDias } from '../../../lib/fechas';
import { formatearEuros } from '../../../lib/dinero';
import {
  antelacion,
  bloques,
  diaConNumero,
  enumerar,
  estadoFurgo,
  instanteLocal,
  listaMaterial,
  listaRopa,
  necesitaFurgoneta,
  necesitaPreparacion,
  personas,
  textoProgreso,
  textoTrabajos,
  tituloDia as titulo,
  visitasDelDia,
} from '../../preparar/logica';
import type { ItemMaterial, PlantillasMaterial, Preparacion, PrendaPlantilla, ReservaVehiculo } from '../../preparar/modelo';
import { proveedorHabitual, type ProveedorAlquiler } from '../../preparar/plantillas';
import { diasEntre } from '../../../dominio/alertas/textos';

export type TipoAlertaPreparacion = 'FURGO_RESERVAR' | 'FURGO_RECOGER' | 'FURGO_DEVOLVER' | 'MATERIAL_REVISAR' | 'COMPRA_RECORDATORIO' | 'ROPA_PREPARAR';
export type NivelPreparacion = 'info' | 'decision' | 'urgente';
export type CanalPreparacion = 'resumen_diario' | 'inmediata';

export interface AccionAlerta {
  id: 'ya_reservada' | 'llamar' | 'registrar_los_dos' | 'entera' | 'descuento' | 'aun_no' | 'revisar' | 'ya_comprado' | 'posponer' | 'ver_lista';
  texto: string;
  /** Para «Llamar a …»: teléfono del proveedor habitual (E.164). */
  telefono?: string;
}

/** Alerta de preparación (§8.13). Se recalcula siempre desde los datos: no se guarda, salvo lo ya avisado y lo pospuesto. */
export interface AlertaPreparacion {
  /** Asunto: una sola alerta viva por asunto (`furgo:reservar:<día>`, `furgo:recoger:<reserva>`…). */
  id: string;
  tipo: TipoAlertaPreparacion;
  nivel: NivelPreparacion;
  canales: CanalPreparacion[];
  /** Asunto + escalón o nivel: lo ya avisado con esta clave no se vuelve a avisar (§12.1.4). */
  clave_dedupe: string;
  entidad: { tipo: 'preparacion'; fecha: string } | { tipo: 'reserva'; id: string; fecha: string };
  /** Día de trabajo (AAAA-MM-DD, Madrid) y días que faltan. */
  fecha: string;
  dias: number;
  /** «ALQUILA LA FURGONETA · EN 4 DÍAS». */
  etiqueta: string;
  /** «Jueves 15 · Sra. Morales». */
  titulo: string;
  /** «Plantación. Aún no la tienes reservada.» */
  cuerpo: string;
  /** Texto del aviso y de la línea del resumen (§12.2, columna «Texto de ejemplo»). */
  texto: string;
  /** Aviso inmediato: desde cuándo toca (instante ISO). null si solo va en el resumen diario. */
  aviso_desde: string | null;
  /**
   * Se avisa también en horas de silencio: el recordatorio de compra (lo programa Felipe, §12.1.3 y criterio 29) y la
   * recogida y devolución de la furgoneta (decisión de Ariel del 2026-11-07: salen a su hora).
   */
  ignora_silencio: boolean;
  acciones: AccionAlerta[];
  /** Pantalla donde se resuelve (deep link, §12.1.5). */
  destino: { pantalla: 'preparar'; fecha: string };
}

/** Tarjeta «Preparar trabajos» por día (§10.7): «EN 3 DÍAS · 1 DE 3 LISTO», «Miércoles 14 · Urb. El Olivar», chips. */
export interface TarjetaDia {
  fecha: string;
  dias: number;
  etiqueta: string;
  titulo: string;
  chips: { texto: string; tono: 'ambar' | 'lima' | 'neutro' | 'azul' }[];
  listos: number;
  total: number;
}

export interface EntradaMotor {
  visitas: Visita[];
  clientes: Pick<Cliente, 'id' | 'nombre'>[];
  preparaciones: Record<string, Preparacion>;
  reservas: ReservaVehiculo[];
  plantillas: { material: PlantillasMaterial; ropa: PrendaPlantilla[]; proveedores: ProveedorAlquiler[] };
  /** Antelación del aviso de furgoneta (§10.10.5): 3 a 5, por defecto 4. */
  avisoFurgoDias?: number;
  /** Asuntos pospuestos («Aún no», «Posponer»): no se muestran hasta ese instante ISO. */
  pospuestas?: Record<string, string>;
  /** Hora del resumen diario (§10.10.5, por defecto 21:00). */
  horaResumen?: string;
  ahora: Date;
}

export interface SalidaMotor {
  alertas: AlertaPreparacion[];
  tarjetas: TarjetaDia[];
}

/** §10.8.4: la tarjeta de preparación aparece en Alertas desde 4 días antes. */
export const DIAS_TARJETA = 4;
/** §12.2: MATERIAL_REVISAR, 3 días antes. */
export const DIAS_MATERIAL = 3;
/** §12.2: FURGO_RESERVAR a 1 día también inmediata a las 10:00. */
export const HORA_FURGO_URGENTE = '10:00';

const reservaViva = (reservas: ReservaVehiculo[], fecha: string) =>
  reservas.find((r) => r.fecha === fecha && !r.eliminado_en && r.estado !== 'cancelada');
const diaSemana = (fecha: string) => DIAS_LARGOS[diaSemanaDeClave(fecha)].toLowerCase();
const nombreCliente = (clientes: EntradaMotor['clientes'], id: string) => clientes.find((c) => c.id === id)?.nombre ?? 'Cliente';

/** «Sra. Morales» o «Sra. Morales y Urb. El Olivar» (sin repetir), para los textos de la furgoneta. */
function clientesDe(visitas: Visita[], clientes: EntradaMotor['clientes']): string {
  return enumerar([...new Set(visitas.map((v) => nombreCliente(clientes, v.cliente_id)))]);
}

/** Escalón de antelación de FURGO_RESERVAR (§12.2): el configurado, 3 días y 1 día. */
export function escalonFurgo(dias: number, aviso: number): number {
  if (dias <= 1) return 1;
  if (dias <= 3) return 3;
  return aviso;
}

/** Nombre corto en minúsculas para el aviso de ropa: «Gafas de protección» → «gafas». */
const corto = (p: PrendaPlantilla, n: number) => (n === 1 ? p.singular : p.plural).split(' ')[0].toLocaleLowerCase('es');

/** «Mañana sois 3: prepara polos, guantes, botas y gafas.» (§12.2 ROPA_PREPARAR). Como mucho 4 prendas por persona. */
export function textoRopa(n: number, plantilla: PrendaPlantilla[], marcadas: string[] = []): string {
  const faltan = plantilla.filter((p) => !p.porEquipo && !marcadas.includes(p.clave));
  const nombres = [...new Set(faltan.map((p) => corto(p, n)))];
  const lista = nombres.length > 4 ? `${nombres.slice(0, 4).join(', ')} y lo demás` : enumerar(nombres);
  const quien = n === 1 ? 'Mañana vas tú solo' : `Mañana sois ${n}`;
  return lista ? `${quien}: prepara ${lista}.` : `${quien}: prepara el agua y el protector.`;
}

/** Lista para COMPRA_RECORDATORIO: «gasolina de mezcla y sacos de restos». */
export const listaCompra = (items: ItemMaterial[]) => enumerar(items.filter((i) => i.estado === 'comprar').map((i) => i.nombre.toLocaleLowerCase('es')));

export function calcularAlertasPreparacion(e: EntradaMotor): SalidaMotor {
  const ahora = e.ahora;
  const hoy = claveDia(ahora);
  const aviso = e.avisoFurgoDias ?? 4;
  const pospuesta = (id: string) => {
    const hasta = e.pospuestas?.[id];
    return Boolean(hasta && Date.parse(hasta) > ahora.getTime());
  };
  const alertas: AlertaPreparacion[] = [];
  const tarjetas: TarjetaDia[] = [];
  const habitual = proveedorHabitual(e.plantillas.proveedores);
  const horizonte = Math.max(aviso, DIAS_TARJETA, 1);

  for (let d = 0; d <= horizonte; d++) {
    const fecha = sumarDias(hoy, d);
    const visitas = visitasDelDia(e.visitas, fecha);
    if (!visitas.length) continue;
    const prep = e.preparaciones[fecha];
    const reserva = reservaViva(e.reservas, fecha);
    const n = personas(visitas);
    const material = listaMaterial(visitas, e.plantillas.material, prep?.material);
    const ropa = listaRopa(e.plantillas.ropa, n, prep?.ropa_marcada);
    const destino = { pantalla: 'preparar' as const, fecha };

    // FURGO_RESERVAR: día con visita que requiere vehículo y sin reserva, desde la antelación configurada; se repite
    // a 3 días y a 1 día. Decisión; urgente a 1 día, y entonces también aviso inmediato la víspera a las 10:00.
    if (d <= aviso && necesitaFurgoneta(visitas) && !reserva) {
      const conFurgo = visitas.filter((v) => v.requiere_vehiculo);
      const urgente = d <= 1;
      const id = `furgo:reservar:${fecha}`;
      if (!pospuesta(id))
        alertas.push({
          id,
          tipo: 'FURGO_RESERVAR',
          nivel: urgente ? 'urgente' : 'decision',
          canales: urgente ? ['resumen_diario', 'inmediata'] : ['resumen_diario'],
          clave_dedupe: `${id}:${escalonFurgo(d, aviso)}`,
          entidad: { tipo: 'preparacion', fecha },
          fecha,
          dias: d,
          etiqueta: `ALQUILA LA FURGONETA · ${antelacion(fecha, hoy)}`,
          titulo: titulo(fecha, conFurgo, e.clientes),
          cuerpo: `${textoTrabajos(conFurgo)}. Aún no la tienes reservada.`,
          texto: `Alquila la furgoneta para el ${diaConNumero(fecha).toLowerCase()} (${clientesDe(conFurgo, e.clientes)}).`,
          aviso_desde: urgente ? instanteLocal(`${d === 0 ? fecha : sumarDias(fecha, -1)}T${HORA_FURGO_URGENTE}`).toISOString() : null,
          ignora_silencio: false,
          acciones: [
            { id: 'ya_reservada', texto: 'Ya la reservé' },
            ...(habitual?.telefono ? [{ id: 'llamar' as const, texto: `Llamar a ${habitual.nombre}`, telefono: habitual.telefono }] : []),
          ],
          destino,
        });
    }

    // MATERIAL_REVISAR: preparación con material sin revisar, desde 3 días antes. Decisión, resumen diario.
    if (d <= DIAS_MATERIAL && material.some((i) => i.estado === 'sin_revisar')) {
      const id = `material:revisar:${fecha}`;
      alertas.push({
        id,
        tipo: 'MATERIAL_REVISAR',
        nivel: 'decision',
        canales: ['resumen_diario'],
        clave_dedupe: id,
        entidad: { tipo: 'preparacion', fecha },
        fecha,
        dias: d,
        etiqueta: `REVISA EL MATERIAL · ${antelacion(fecha, hoy)}`,
        titulo: titulo(fecha, visitas, e.clientes),
        cuerpo: `${material.filter((i) => i.estado === 'sin_revisar').length} sin revisar.`,
        texto: `¿Tienes todo para el ${diaSemana(fecha)}? Revisa el material.`,
        aviso_desde: null,
        ignora_silencio: false,
        acciones: [{ id: 'revisar', texto: 'Revisar' }],
        destino,
      });
    }

    // COMPRA_RECORDATORIO: a la hora que eligió Felipe («Recordarme»), si aún hay algo en «Comprar». Inmediata y
    // programada por él: se avisa aunque caiga en horas de silencio.
    if (prep?.recordatorio_compra && material.some((i) => i.estado === 'comprar')) {
      const desde = instanteLocal(prep.recordatorio_compra);
      const id = `compra:${fecha}`;
      if (desde.getTime() <= ahora.getTime() && !pospuesta(id))
        alertas.push({
          id,
          tipo: 'COMPRA_RECORDATORIO',
          nivel: 'decision',
          canales: ['inmediata'],
          clave_dedupe: `${id}:${prep.recordatorio_compra}`,
          entidad: { tipo: 'preparacion', fecha },
          fecha,
          dias: d,
          etiqueta: `COMPRA · ${antelacion(fecha, hoy)}`,
          titulo: titulo(fecha, visitas, e.clientes),
          cuerpo: `${capital(listaCompra(material))}.`,
          texto: `Compra para el ${diaSemana(fecha)}: ${listaCompra(material)}.`,
          aviso_desde: desde.toISOString(),
          ignora_silencio: true,
          acciones: [
            { id: 'ya_comprado', texto: 'Ya lo compré' },
            { id: 'posponer', texto: 'Posponer 2 h' },
          ],
          destino,
        });
    }

    // ROPA_PREPARAR: visitas mañana; en el resumen de la víspera. Informativa. Se quita cuando todo está marcado.
    if (d === 1 && ropa.some((p) => !p.marcada)) {
      const id = `ropa:${fecha}`;
      alertas.push({
        id,
        tipo: 'ROPA_PREPARAR',
        nivel: 'info',
        canales: ['resumen_diario'],
        clave_dedupe: `${id}:${n}`,
        entidad: { tipo: 'preparacion', fecha },
        fecha,
        dias: d,
        etiqueta: 'ROPA · MAÑANA',
        titulo: titulo(fecha, visitas, e.clientes),
        cuerpo: `Ropa para ${n} ${n === 1 ? 'persona' : 'personas'}.`,
        texto: textoRopa(n, e.plantillas.ropa, prep?.ropa_marcada),
        aviso_desde: null,
        ignora_silencio: false,
        acciones: [{ id: 'ver_lista', texto: 'Ver lista' }],
        destino,
      });
    }

    // Tarjeta «Preparar trabajos» (§10.7, §10.8.4): días con preparación, desde 4 días antes. Si el día ya está todo
    // preparado, la tarjeta se quita (decisión de Ariel del 2026-11-07).
    const b = bloques(visitas, reserva, material, ropa);
    const todoListo = b.length > 0 && b.every((x) => x.listo);
    if (d <= DIAS_TARJETA && necesitaPreparacion(visitas, e.plantillas.material) && !todoListo) {
      const chips: TarjetaDia['chips'] = [];
      const furgo = estadoFurgo(visitas, reserva);
      if (furgo === 'sin_reservar') chips.push({ texto: 'Reservar furgo', tono: 'ambar' });
      else if (furgo !== 'no_aplica') chips.push({ texto: `Furgo ${furgo === 'reservada' ? 'reservada' : furgo === 'recogida' ? 'recogida' : 'devuelta'}`, tono: 'lima' });
      const comprar = material.filter((i) => i.estado === 'comprar').length;
      const sinRevisar = material.filter((i) => i.estado === 'sin_revisar').length;
      if (comprar) chips.push({ texto: `Comprar ${comprar} ${comprar === 1 ? 'cosa' : 'cosas'}`, tono: 'ambar' });
      else if (sinRevisar) chips.push({ texto: 'Revisar material', tono: 'neutro' });
      else if (material.length) chips.push({ texto: 'Material listo', tono: 'lima' });
      chips.push({ texto: `Ropa para ${n}`, tono: 'azul' });
      const listos = b.filter((x) => x.listo).length;
      tarjetas.push({
        fecha,
        dias: d,
        etiqueta: `${antelacion(fecha, hoy)} · ${textoProgreso(b).toUpperCase()}`,
        titulo: titulo(fecha, visitas, e.clientes),
        chips,
        listos,
        total: b.length,
      });
    }
  }

  // FURGO_RECOGER / FURGO_DEVOLVER: a la hora de recogida y de devolución de cada reserva (inmediatas, operativas).
  for (const r of e.reservas) {
    if (r.eliminado_en || r.estado === 'cancelada') continue;
    const cubiertas = e.visitas.filter((v) => r.visitas.includes(v.id));
    const tit = `${diaConNumero(r.fecha)} · ${cubiertas.length ? clientesDe(cubiertas, e.clientes) : r.proveedor_nombre}`;
    const destino = { pantalla: 'preparar' as const, fecha: r.fecha };
    const dias = diasEntre(hoy, r.fecha);
    if (r.estado === 'reservada') {
      const desde = instanteLocal(r.recogida);
      const id = `furgo:recoger:${r.id}`;
      if (desde.getTime() <= ahora.getTime() && !pospuesta(id))
        alertas.push({
          id,
          tipo: 'FURGO_RECOGER',
          nivel: 'decision',
          canales: ['inmediata'],
          clave_dedupe: `${id}:${r.recogida}`,
          entidad: { tipo: 'reserva', id: r.id, fecha: r.fecha },
          fecha: r.fecha,
          dias,
          etiqueta: `RECOGE LA FURGONETA · ${r.proveedor_nombre.toUpperCase()}`,
          titulo: tit,
          cuerpo:
            r.fianza_prevista > 0
              ? `Alquiler ${formatearEuros(r.precio, 'detalle')} y fianza ${formatearEuros(r.fianza_prevista, 'detalle')}.`
              : `Alquiler ${formatearEuros(r.precio, 'detalle')}.`,
          texto: r.fianza_prevista > 0 ? '¿Ya recogiste la furgoneta? Registra pago y fianza.' : '¿Ya recogiste la furgoneta? Registra el pago.',
          aviso_desde: desde.toISOString(),
          ignora_silencio: true,
          acciones: [{ id: 'registrar_los_dos', texto: r.fianza_prevista > 0 ? 'Registrar los dos' : 'Registrar el alquiler' }],
          destino,
        });
    } else if (r.estado === 'recogida') {
      const desde = instanteLocal(r.devolucion);
      const id = `furgo:devolver:${r.id}`;
      if (desde.getTime() <= ahora.getTime() && !pospuesta(id))
        alertas.push({
          id,
          tipo: 'FURGO_DEVOLVER',
          nivel: 'decision',
          canales: ['inmediata'],
          clave_dedupe: `${id}:${r.devolucion}`,
          entidad: { tipo: 'reserva', id: r.id, fecha: r.fecha },
          fecha: r.fecha,
          dias,
          etiqueta: `DEVUELVE LA FURGONETA · ${r.proveedor_nombre.toUpperCase()}`,
          titulo: tit,
          cuerpo: r.fianza_prevista > 0 ? `Fianza de ${formatearEuros(r.fianza_prevista, 'detalle')} por volver.` : 'Sin fianza.',
          texto: r.fianza_prevista > 0 ? `¿Te devolvieron la fianza de ${formatearEuros(r.fianza_prevista)}?` : '¿Devolviste la furgoneta?',
          aviso_desde: desde.toISOString(),
          ignora_silencio: true,
          acciones:
            r.fianza_prevista > 0
              ? [
                  { id: 'entera', texto: 'Entera' },
                  { id: 'descuento', texto: 'Me descontaron' },
                  { id: 'aun_no', texto: 'Aún no' },
                ]
              : [
                  { id: 'entera', texto: 'Ya la devolví' },
                  { id: 'aun_no', texto: 'Aún no' },
                ],
          destino,
        });
    }
  }

  const orden: Record<TipoAlertaPreparacion, number> = {
    FURGO_RECOGER: 0, FURGO_DEVOLVER: 1, COMPRA_RECORDATORIO: 2, FURGO_RESERVAR: 3, MATERIAL_REVISAR: 4, ROPA_PREPARAR: 5,
  };
  alertas.sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.fecha.localeCompare(b.fecha));
  return { alertas, tarjetas };
}

const capital = (t: string) => t.charAt(0).toLocaleUpperCase('es') + t.slice(1);

/** Alertas con tarjeta propia en Alertas (acción a decidir): cuentan en la insignia de la campana. */
export const TIPOS_CON_TARJETA: TipoAlertaPreparacion[] = ['FURGO_RECOGER', 'FURGO_DEVOLVER', 'COMPRA_RECORDATORIO', 'FURGO_RESERVAR'];
export const contarParaDecidirPreparacion = (alertas: AlertaPreparacion[]) => alertas.filter((a) => TIPOS_CON_TARJETA.includes(a.tipo)).length;
