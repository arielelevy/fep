import { formatearEuros } from '../lib/dinero';
import { claveDia, DIAS_LARGOS, diaSemanaDeClave, sumarDias } from '../lib/fechas';
import { estadoCobroVisita, visitasDelDia } from './agenda';
import { fianzas } from './cifras';
import { calcularPendientes, diasEntre, type Pendiente } from './pendientes';
import { TIPOS_TRABAJO, type Cliente, type Deuda, type Movimiento, type Visita } from './tipos';

// Visitas de hoy y aviso contextual de la pantalla Hoy (§10.1.1, mockup p. 1, docs/maqueta.md §1.1 C5–C8).
// Funciones puras: la pantalla solo pinta lo que sale de aquí.

/** Visitas del día que se enseñan en Hoy: sin canceladas, por hora. */
export function visitasDeHoy(visitas: Visita[], dia: string): Visita[] {
  return visitasDelDia(visitas, dia).filter((v) => v.estado !== 'cancelada');
}

/** «1 de 3 hechas». */
export function contadorHechas(lista: Visita[]): { hechas: number; total: number; texto: string } {
  const hechas = lista.filter((v) => v.estado === 'hecha').length;
  return { hechas, total: lista.length, texto: `${hechas} de ${lista.length} hechas` };
}

/** La próxima pendiente (primera programada por hora): lleva el botón Hecho relleno en lima (§10.1.1.4). */
export const proximaPendiente = (lista: Visita[]): Visita | undefined => lista.find((v) => v.estado === 'programada');

/** «Césped y setos» (o la descripción si la hay). */
export function textoServicio(v: Pick<Visita, 'descripcion' | 'tipos_trabajo'>): string {
  if (v.descripcion.trim()) return v.descripcion.trim();
  const nombres = v.tipos_trabajo.map((t) => TIPOS_TRABAJO.find((x) => x.id === t)?.nombre).filter(Boolean) as string[];
  if (nombres.length === 0) return 'Visita';
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1].toLowerCase()}`;
}

export type TipoCobroVisita = 'puntual' | 'abono' | 'sin_precio';

export function tipoCobroVisita(v: Pick<Visita, 'incluida_en_abono' | 'precio'>): TipoCobroVisita {
  if (v.incluida_en_abono) return 'abono';
  return v.precio && v.precio > 0 ? 'puntual' : 'sin_precio';
}

/**
 * Segunda línea de la tarjeta (mockup p. 1): «Piscina · Abono 90 €/mes», «Poda de setos · 150 €»;
 * hechas: «Césped y setos · Cobrado 60 €» o «· Pendiente de cobro».
 */
export function lineaVisita(v: Visita, cliente: Cliente | undefined, deudas: Deuda[], movs: Movimiento[]): string {
  const servicio = textoServicio(v);
  const tipo = tipoCobroVisita(v);
  if (v.estado === 'hecha' && tipo === 'puntual') {
    const c = estadoCobroVisita(v, deudas, movs);
    if (c.estado === 'cobrada') return `${servicio} · Cobrado ${formatearEuros(c.cobrado)}`;
    if (c.estado === 'parcial') return `${servicio} · Cobrado ${formatearEuros(c.cobrado)}, faltan ${formatearEuros(c.pendiente)}`;
    if (c.estado === 'pendiente') return `${servicio} · Pendiente de cobro`;
  }
  if (tipo === 'abono') return cliente?.cuota_abono ? `${servicio} · Abono ${formatearEuros(cliente.cuota_abono)}/mes` : `${servicio} · Abono`;
  if (tipo === 'puntual') return `${servicio} · ${formatearEuros(v.precio!)}`;
  return `${servicio} · Sin precio`;
}

/** «Mañana: 2 visitas» para el vacío de Hoy (§10.1.1.5); null si mañana no hay. */
export function textoManana(visitas: Visita[], hoy: string): string | null {
  const n = visitasDeHoy(visitas, sumarDias(hoy, 1)).length;
  if (n === 0) return null;
  return `Mañana: ${n} ${n === 1 ? 'visita' : 'visitas'}`;
}

// ---------- Aviso contextual (§10.1.1.3): máximo uno, el más prioritario ----------
// Prioridad: cobro sin registrar de visita hecha > fianza vencida > abono vencido en rojo.

/** Días tras la entrega a partir de los cuales una fianza sin volver se avisa (FIANZA_PENDIENTE, §12.2). */
export const DIAS_FIANZA_VENCIDA = 3;
/** Hasta cuántos días atrás se pregunta «¿cobraste?» por una visita hecha (luego queda en «Te deben»). */
export const DIAS_AVISO_COBRO = 6;

export type AvisoContextual =
  | { tipo: 'cobro_visita'; texto: string; boton: string; visita: Visita; deuda_id: string; cliente_id: string; importe: number }
  | { tipo: 'fianza'; texto: string; boton: string; fianza_id: string; importe: number }
  | { tipo: 'abono'; texto: string; boton: string; cliente_id: string; periodo: string; importe: number };

/** «Ayer», «El martes», «Hace 8 días» */
function cuando(dia: string, hoy: string): string {
  const d = diasEntre(dia, hoy);
  if (d === 1) return 'Ayer';
  if (d < 7) return `El ${DIAS_LARGOS[diaSemanaDeClave(dia)].toLowerCase()}`;
  return `Hace ${d} días`;
}

const nombreDe = (clientes: Cliente[], id: string) => clientes.find((c) => c.id === id)?.nombre ?? 'un cliente';

export function avisoContextual(
  datos: { visitas: Visita[]; clientes: Cliente[]; deudas: Deuda[]; movimientos: Movimiento[] },
  ahora: Date = new Date(),
): AvisoContextual | null {
  const hoy = claveDia(ahora);
  const { visitas, clientes, deudas, movimientos } = datos;

  // 1. Cobro sin registrar de una visita hecha antes de hoy (las de hoy ya se ven en su tarjeta).
  const sinCobrar = visitas
    .filter((v) => !v.eliminado_en && v.estado === 'hecha' && v.fecha < hoy && diasEntre(v.fecha, hoy) <= DIAS_AVISO_COBRO)
    .map((v) => ({ v, c: estadoCobroVisita(v, deudas, movimientos) }))
    .filter(({ c }) => c.estado === 'pendiente' || c.estado === 'parcial')
    .sort((a, b) => b.v.fecha.localeCompare(a.v.fecha));
  if (sinCobrar.length) {
    const { v, c } = sinCobrar[0];
    const deuda = deudas.find((d) => d.visita_id === v.id && !d.eliminado_en)!;
    return {
      tipo: 'cobro_visita',
      texto: `${cuando(v.fecha, hoy)} en ${nombreDe(clientes, v.cliente_id)}: ¿cobraste?`,
      boton: `Sí, ${formatearEuros(c.pendiente)}`,
      visita: v,
      deuda_id: deuda.id,
      cliente_id: v.cliente_id,
      importe: c.pendiente,
    };
  }

  // 2. Fianza sin volver pasados unos días (aproximación hasta que haya reservas de furgoneta, §8.7).
  const vencida = fianzas(movimientos)
    // Solo fianzas sin ninguna devolución: «Me la devolvieron» la devuelve entera (devolverFianza calcula el
    // descuento contra el total entregado; con devoluciones parciales se resuelve desde Movimientos).
    .filter((f) => f.estado === 'pendiente' && f.devuelto === 0 && f.descontado === 0 && diasEntre(claveDia(f.entrega.fecha), hoy) >= DIAS_FIANZA_VENCIDA)
    .sort((a, b) => a.entrega.fecha.localeCompare(b.entrega.fecha))[0];
  if (vencida) {
    const importe = vencida.entrega.importe - vencida.devuelto - vencida.descontado;
    return {
      tipo: 'fianza',
      texto: `La fianza de ${formatearEuros(importe)} sigue sin volver.`,
      boton: 'Me la devolvieron',
      fianza_id: vencida.entrega.id,
      importe,
    };
  }

  // 3. Abono vencido en rojo (15 días o más, §9.4).
  const rojo: Pendiente | undefined = calcularPendientes(clientes, deudas, movimientos, ahora).find(
    (p) => p.periodo !== null && diasEntre(p.desde, hoy) >= 15,
  );
  if (rojo) {
    return {
      tipo: 'abono',
      texto: `${nombreDe(clientes, rojo.cliente_id)} te debe ${formatearEuros(rojo.pendiente)} desde hace ${diasEntre(rojo.desde, hoy)} días.`,
      boton: `Ya pagó, ${formatearEuros(rojo.pendiente)}`,
      cliente_id: rojo.cliente_id,
      periodo: rojo.periodo!,
      importe: rojo.pendiente,
    };
  }
  return null;
}
