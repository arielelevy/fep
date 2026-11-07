// Lógica pura de Preparar trabajo (§10.8). Sin base de datos ni interfaz: se prueba sola (logica.test.ts).

import { TIPOS_TRABAJO, type Cliente, type TipoTrabajo, type Visita } from '../../domain/tipos';
import { claveDia, DIAS_LARGOS, desdeMadrid, diaSemanaDeClave, partesMadrid, sumarDias } from '../../lib/fechas';
import type { EstadoBloque, ItemMaterial, PlantillasMaterial, Preparacion, PrendaCalculada, PrendaPlantilla, ReservaVehiculo } from './modelo';

// ---------- Visitas del día ----------

/** Visitas programadas de un día, por hora. */
export function visitasDelDia(visitas: Visita[], fecha: string): Visita[] {
  return visitas
    .filter((v) => v.fecha === fecha && v.estado === 'programada' && !v.eliminado_en)
    .sort((a, b) => (a.hora_inicio ?? '09:00').localeCompare(b.hora_inicio ?? '09:00'));
}

/** §10.8.4: hay preparación si alguna visita requiere vehículo, tiene tipos con plantilla de material o lleva ayudantes. */
export function necesitaPreparacion(visitas: Visita[], plantillas: PlantillasMaterial): boolean {
  return visitas.some((v) => v.requiere_vehiculo || v.ayudantes > 0 || v.tipos_trabajo.some((t) => (plantillas[t]?.length ?? 0) > 0));
}

/** §10.8.3: N = 1 (Felipe) + máximo de ayudantes entre las visitas del día. */
export const personas = (visitas: Visita[]): number => 1 + Math.max(0, ...visitas.map((v) => v.ayudantes || 0));

export const necesitaFurgoneta = (visitas: Visita[]): boolean => visitas.some((v) => v.requiere_vehiculo);

const nombreTipo = (t: TipoTrabajo) => TIPOS_TRABAJO.find((x) => x.id === t)?.nombre ?? t;

/** «Desbroce y poda»: tipos de trabajo del día sin repetir. */
export function textoTrabajos(visitas: Visita[]): string {
  const nombres = [...new Set(visitas.flatMap((v) => v.tipos_trabajo).map(nombreTipo))];
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)!.toLowerCase()}`;
}

/** «Tú solo», «Tú y 1 ayudante», «Tú y 2 ayudantes». */
export function textoPersonas(n: number): string {
  if (n <= 1) return 'Tú solo';
  return n === 2 ? 'Tú y 1 ayudante' : `Tú y ${n - 1} ayudantes`;
}

/** «Miércoles 14». */
export function diaConNumero(fecha: string): string {
  return `${DIAS_LARGOS[diaSemanaDeClave(fecha)]} ${Number(fecha.slice(8, 10))}`;
}

/** «HOY», «MAÑANA», «EN 3 DÍAS» (etiqueta «PREPARAR · EN 3 DÍAS»). */
export function antelacion(fecha: string, hoy: string): string {
  const dias = Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
  if (dias <= 0) return 'HOY';
  if (dias === 1) return 'MAÑANA';
  return `EN ${dias} DÍAS`;
}

/** Título: «Miércoles 14 · Urb. El Olivar» o «Miércoles 14 · 2 trabajos». */
export function tituloDia(fecha: string, visitas: Visita[], clientes: Pick<Cliente, 'id' | 'nombre'>[]): string {
  if (visitas.length === 1) return `${diaConNumero(fecha)} · ${clientes.find((c) => c.id === visitas[0].cliente_id)?.nombre ?? 'Cliente'}`;
  return `${diaConNumero(fecha)} · ${visitas.length} trabajos`;
}

// ---------- Ropa ----------

/** §10.8.3: «Polos FERGO (3)», «Guantes (3 pares)», «Agua y protector» sin multiplicar. */
export function listaRopa(plantilla: PrendaPlantilla[], n: number, marcadas: string[] = []): PrendaCalculada[] {
  return plantilla.map((p) => {
    const marcada = marcadas.includes(p.clave);
    if (p.porEquipo) return { clave: p.clave, texto: p.singular, cantidad: 1, marcada };
    const nombre = n === 1 ? p.singular : p.plural;
    const cantidad = p.unidad ? `${n} ${n === 1 ? p.unidad.singular : p.unidad.plural}` : String(n);
    return { clave: p.clave, texto: `${nombre} (${cantidad})`, cantidad: n, marcada };
  });
}

// ---------- Material ----------

const normal = (t: string) => t.trim().toLocaleLowerCase('es');

/**
 * §10.8.2: lista uniendo las plantillas de los tipos de trabajo de las visitas del día, sin duplicados, con el estado
 * guardado de cada artículo y los añadidos a mano al final. Estado inicial: ninguno seleccionado («sin revisar»).
 */
export function listaMaterial(visitas: Visita[], plantillas: PlantillasMaterial, guardado: ItemMaterial[] = []): ItemMaterial[] {
  const r: ItemMaterial[] = [];
  const vistos = new Set<string>();
  for (const t of [...new Set(visitas.flatMap((v) => v.tipos_trabajo))]) {
    for (const nombre of plantillas[t] ?? []) {
      const k = normal(nombre);
      if (vistos.has(k)) continue;
      vistos.add(k);
      const g = guardado.find((x) => normal(x.nombre) === k);
      r.push({ nombre, tipo: t, estado: g?.estado ?? 'sin_revisar', gasto_id: g?.gasto_id ?? null });
    }
  }
  for (const g of guardado) {
    if (!g.extra || vistos.has(normal(g.nombre))) continue;
    vistos.add(normal(g.nombre));
    r.push(g);
  }
  return r;
}

/** «Lista de compra: gasolina de mezcla y sacos de restos». */
export function textoListaCompra(items: ItemMaterial[]): string | null {
  const c = items.filter((i) => i.estado === 'comprar').map((i) => i.nombre.toLocaleLowerCase('es'));
  if (!c.length) return null;
  const lista = c.length === 1 ? c[0] : `${c.slice(0, -1).join(', ')} y ${c.at(-1)}`;
  return `Lista de compra: ${lista}`;
}

/** Bloque listo cuando todos los artículos están en «Lo tengo» o «Comprado» (§10.8.2). */
export const materialListo = (items: ItemMaterial[]) => items.length > 0 && items.every((i) => i.estado === 'lo_tengo' || i.estado === 'comprado');

/**
 * Categoría de gasto que se propone al registrar un artículo comprado («con la categoría deducida del artículo»,
 * §10.8.2). Reglas por palabras; si no encaja, «Otros gastos» (se puede cambiar antes de guardar).
 */
export function categoriaDeArticulo(nombre: string, tipo?: TipoTrabajo | null): string {
  const n = normal(nombre);
  if (/mezcla/.test(n)) return 'gasolina_mezcla';
  if (/gasolina|gasoil|diésel|diesel/.test(n)) return 'gasolina';
  if (/cuchilla|tanza|hilo|cadena|bujía|bujia|filtro de aire|afilad|repuesto/.test(n)) return 'repuestos';
  if (/abono|sustrato|tierra|turba|compost/.test(n)) return 'sustrato_abono';
  if (/planta|semilla|césped|cesped|tepe|esqueje/.test(n)) return 'plantas';
  if (/goteo|aspersor|riego|manguera|programador|tubo/.test(n)) return 'material_riego';
  if (/fitosanit|insecticida|fungicida|herbicida|tratamiento/.test(n)) return 'fitosanitarios';
  if (/cloro|ph|flocul|algicida/.test(n)) return 'productos_piscina';
  if (/cepillo|recogehojas|filtro/.test(n) && tipo === 'piscina') return 'material_piscina';
  if (/saco|bolsa|vertedero|contenedor/.test(n)) return 'vertedero';
  if (/guante|gafa|bota|ropa|polo|gorra|protector/.test(n)) return 'ropa';
  if (tipo === 'piscina') return 'material_piscina';
  return 'otros_gastos';
}

// ---------- Recordatorio de compra (§10.8.2) ----------

/** «AAAA-MM-DDTHH:MM» local de Madrid → instante. */
export function instanteLocal(local: string): Date {
  const [f, h] = local.split('T');
  const [a, m, d] = f.split('-').map(Number);
  const [hh, mm] = (h ?? '00:00').split(':').map(Number);
  return desdeMadrid(a, m, d, hh, mm);
}

/** Instante → «AAAA-MM-DDTHH:MM» local de Madrid. */
export function aLocal(instante: Date): string {
  const p = partesMadrid(instante);
  const dos = (x: number) => String(x).padStart(2, '0');
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}T${dos(p.hora)}:${dos(p.minuto)}`;
}

/** Inicio del día de trabajo: la primera visita (09:00 si no tiene hora, §8.4). */
export const inicioTrabajo = (fecha: string, visitas: Visita[]): string => `${fecha}T${visitas[0]?.hora_inicio ?? '09:00'}`;

/**
 * Por defecto, el día siguiente a las 18:00, siempre antes del trabajo. Si no cabe: el mismo día dentro de 2 horas,
 * o la víspera a las 18:00. null si nada queda antes del trabajo.
 */
export function recordatorioPorDefecto(ahora: Date, fecha: string, visitas: Visita[]): string | null {
  const limite = instanteLocal(inicioTrabajo(fecha, visitas)).getTime();
  const hoy = claveDia(ahora);
  const candidatos = [`${sumarDias(hoy, 1)}T18:00`, aLocal(new Date(redondear30(ahora.getTime() + 2 * 3_600_000))), `${sumarDias(fecha, -1)}T18:00`];
  return candidatos.find((c) => {
    const t = instanteLocal(c).getTime();
    return t > ahora.getTime() && t < limite;
  }) ?? null;
}

const redondear30 = (ms: number) => Math.ceil(ms / 1_800_000) * 1_800_000;

/** Opciones rápidas: «Esta tarde», «Mañana 18:00», «Mañana 09:00» (sólo las que caen antes del trabajo y no han pasado). */
export function opcionesRecordatorio(ahora: Date, fecha: string, visitas: Visita[]): { texto: string; valor: string }[] {
  const limite = instanteLocal(inicioTrabajo(fecha, visitas)).getTime();
  const hoy = claveDia(ahora);
  const manana = sumarDias(hoy, 1);
  return [
    { texto: 'Esta tarde', valor: `${hoy}T18:00` },
    { texto: 'Mañana 18:00', valor: `${manana}T18:00` },
    { texto: 'Mañana 09:00', valor: `${manana}T09:00` },
  ].filter((o) => {
    const t = instanteLocal(o.valor).getTime();
    return t > ahora.getTime() && t < limite;
  });
}

/** «mañana a las 18:00», «el martes 13 a las 18:00», «hoy a las 18:00». */
export function textoMomento(local: string, ahora: Date): string {
  const [f, h] = local.split('T');
  const hoy = claveDia(ahora);
  if (f === hoy) return `hoy a las ${h}`;
  if (f === sumarDias(hoy, 1)) return `mañana a las ${h}`;
  return `el ${diaConNumero(f).toLowerCase()} a las ${h}`;
}

// ---------- Furgoneta (§10.8.1) ----------

/** Recogida por defecto: la tarde anterior a las 19:00. Devolución: el día del trabajo a las 20:00. */
export const recogidaPorDefecto = (fecha: string) => `${sumarDias(fecha, -1)}T19:00`;
export const devolucionPorDefecto = (fecha: string) => `${fecha}T20:00`;

/** Días de alquiler entre recogida y devolución (mínimo 1), para el precio por día del proveedor. */
export function diasAlquiler(recogida: string, devolucion: string): number {
  const ms = instanteLocal(devolucion).getTime() - instanteLocal(recogida).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

/** Reparto a partes iguales en céntimos (§9.5): la suma cuadra; los céntimos que sobran van a los primeros. */
export function repartir(importe: number, partes: number): number[] {
  if (partes <= 0) return [];
  const base = Math.floor(importe / partes);
  const resto = importe - base * partes;
  return Array.from({ length: partes }, (_, i) => base + (i < resto ? 1 : 0));
}

/** Clientes de las visitas que cubre la reserva, sin repetir y en orden. */
export function clientesDeVisitas(visitas: Visita[]): string[] {
  return [...new Set(visitas.map((v) => v.cliente_id))];
}

export type EstadoFurgo = 'no_aplica' | 'sin_reservar' | 'reservada' | 'recogida' | 'devuelta';

export function estadoFurgo(visitas: Visita[], reserva: ReservaVehiculo | undefined): EstadoFurgo {
  if (!necesitaFurgoneta(visitas)) return 'no_aplica';
  if (!reserva || reserva.estado === 'cancelada' || reserva.eliminado_en) return 'sin_reservar';
  return reserva.estado;
}

/** Etiqueta del estado (§10.8.1): «Sin reservar», «Reservada», «Recogida», «Devuelta». */
export const ETIQUETA_FURGO: Record<Exclude<EstadoFurgo, 'no_aplica'>, string> = {
  sin_reservar: 'Sin reservar',
  reservada: 'Reservada',
  recogida: 'Recogida',
  devuelta: 'Devuelta',
};

// ---------- Progreso ----------

/** §10.8 «Progreso»: solo cuentan los bloques que aplican. */
export function bloques(
  visitas: Visita[],
  reserva: ReservaVehiculo | undefined,
  material: ItemMaterial[],
  ropa: PrendaCalculada[],
): EstadoBloque[] {
  const r: EstadoBloque[] = [];
  const furgo = estadoFurgo(visitas, reserva);
  if (furgo !== 'no_aplica') r.push({ id: 'furgoneta', nombre: 'Furgoneta', listo: furgo !== 'sin_reservar' });
  if (material.length) r.push({ id: 'material', nombre: 'Material', listo: materialListo(material) });
  if (visitas.length && ropa.length) r.push({ id: 'ropa', nombre: 'Ropa', listo: ropa.every((p) => p.marcada) });
  return r;
}

/** «1 de 3 listo». */
export function textoProgreso(b: EstadoBloque[]): string {
  const listos = b.filter((x) => x.listo).length;
  return `${listos} de ${b.length} ${listos === 1 ? 'listo' : 'listos'}`;
}

/** Preparación vacía de un día (los campos comunes los pone la escritura). */
export const preparacionVacia = (fecha: string): Pick<Preparacion, 'fecha' | 'material' | 'ropa_marcada' | 'recordatorio_compra'> => ({
  fecha,
  material: [],
  ropa_marcada: [],
  recordatorio_compra: null,
});
