// Modelo de la preparación de un día de trabajo (ola 8, encargo A). Spec §8.10 (ReservaVehiculo), §8.11
// (Preparación por día), §8.12 (plantillas), §10.8 (pantalla Preparar trabajo).
// Se guarda en la tabla `ajustes` existente (claves de abajo), sin cambiar el esquema de la base. Contrato para el
// encargo B (alertas FURGO/MATERIAL/ROPA): ver CONTRATO.md.

import type { Comunes, TipoTrabajo } from '../../domain/tipos';

/** Claves en la tabla `ajustes`. */
export const CLAVE_PREPARACIONES = 'preparaciones'; // Record<fecha AAAA-MM-DD, Preparacion>
export const CLAVE_RESERVAS = 'reservas_vehiculo'; // ReservaVehiculo[]

/** Estado de un artículo de material (§8.11). */
export type EstadoMaterial = 'sin_revisar' | 'lo_tengo' | 'comprar' | 'comprado';

export interface ItemMaterial {
  /** Nombre visible: «Gasolina de mezcla». También es su clave (sin distinguir mayúsculas). */
  nombre: string;
  estado: EstadoMaterial;
  /** Añadido a mano sólo para esta preparación («+ Añadir otra cosa»). */
  extra?: boolean;
  /** Tipo de trabajo del que sale (para deducir la categoría del gasto). */
  tipo?: TipoTrabajo | null;
  /** Gasto registrado al comprarlo, si se registró. */
  gasto_id?: string | null;
}

/** Preparación de un día (§8.11): una por fecha, no por visita, para no duplicar avisos. */
export interface Preparacion extends Comunes {
  fecha: string; // AAAA-MM-DD (Madrid)
  /** Estado guardado de cada artículo (los no guardados están «sin revisar»). */
  material: ItemMaterial[];
  /** Prendas marcadas (por clave de prenda). Las marcas se reinician en cada preparación (§10.8.3). */
  ropa_marcada: string[];
  /** «Recordarme» la compra: fecha y hora local de Madrid «AAAA-MM-DDTHH:MM», o null. */
  recordatorio_compra: string | null;
}

export type EstadoReserva = 'reservada' | 'recogida' | 'devuelta' | 'cancelada';

/** Reserva de furgoneta (§8.10). */
export interface ReservaVehiculo extends Comunes {
  /** Día de trabajo que cubre (la preparación). */
  fecha: string;
  /** Proveedor del catálogo de Ajustes (encargo B), si se eligió de ahí. */
  proveedor_id: string | null;
  proveedor_nombre: string;
  proveedor_telefono: string | null;
  /** Fecha y hora local de Madrid «AAAA-MM-DDTHH:MM». */
  recogida: string;
  devolucion: string;
  precio: number; // céntimos
  fianza_prevista: number; // céntimos
  visitas: string[];
  estado: EstadoReserva;
  /** Movimientos creados al recogerla («Registrar los dos», §10.8.1): gastos de alquiler (uno por cliente) y fianza. */
  gasto_ids: string[];
  fianza_id: string | null;
}

/** Bloques de la pantalla (§10.8). */
export type IdBloque = 'furgoneta' | 'material' | 'ropa';

export interface EstadoBloque {
  id: IdBloque;
  nombre: string;
  listo: boolean;
}

/** Prenda de la plantilla de ropa (§8.12). */
export interface PrendaPlantilla {
  clave: string;
  /** «Polo FERGO» / «Polos FERGO». */
  singular: string;
  plural: string;
  /** Unidad para la cantidad: «par» → «Guantes (3 pares)». */
  unidad?: { singular: string; plural: string };
  /** Una vez por equipo, no por persona («Agua y protector»). */
  porEquipo?: boolean;
}

export interface PrendaCalculada {
  clave: string;
  /** «Polos FERGO (3)», «Guantes (3 pares)», «Agua y protector». */
  texto: string;
  cantidad: number;
  marcada: boolean;
}

export type PlantillasMaterial = Partial<Record<TipoTrabajo, string[]>>;
