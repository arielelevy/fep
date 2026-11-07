// Modelo de datos local (§8). Todas las entidades llevan los campos comunes de §8.

export interface Comunes {
  id: string; // UUID generado en el cliente
  negocio_id: string;
  creado_en: string; // ISO
  actualizado_en: string;
  creado_por: string; // id de usuario
  modificado_por: string;
  eliminado_en: string | null; // borrado lógico
  version: number;
}

export type Rol = 'titular' | 'colaborador';

export interface Usuario extends Comunes {
  nombre: string;
  email: string;
  rol: Rol;
  etiqueta_aportante: string;
}

/** Tipos de movimiento (§9.1). En esta ola sólo se registran 'gasto' y 'saldo_inicial'. */
export type TipoMovimiento =
  | 'gasto'
  | 'cobro'
  | 'anticipo'
  | 'otro_ingreso'
  | 'aporte'
  | 'prestamo'
  | 'devolucion_prestamo'
  | 'fianza_entregada'
  | 'fianza_devuelta'
  | 'saldo_inicial';

export type MedioPago = 'efectivo' | 'bizum' | 'tarjeta' | 'transferencia';

export const MEDIOS_PAGO: { id: MedioPago; nombre: string }[] = [
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'bizum', nombre: 'Bizum' },
  { id: 'tarjeta', nombre: 'Tarjeta' },
  { id: 'transferencia', nombre: 'Transferencia' },
];

/** Nombre corto del tipo para la barra Deshacer ("Cobro guardado", "Fianza eliminada"). */
export function nombreTipo(tipo: TipoMovimiento): { nombre: string; femenino: boolean } {
  switch (tipo) {
    case 'saldo_inicial': return { nombre: 'Saldo', femenino: false };
    case 'cobro': return { nombre: 'Cobro', femenino: false };
    case 'anticipo': return { nombre: 'Anticipo', femenino: false };
    case 'otro_ingreso': return { nombre: 'Ingreso', femenino: false };
    case 'aporte': return { nombre: 'Aporte', femenino: false };
    case 'prestamo': return { nombre: 'Préstamo', femenino: false };
    case 'devolucion_prestamo': return { nombre: 'Devolución', femenino: true };
    case 'fianza_entregada': return { nombre: 'Fianza', femenino: true };
    case 'fianza_devuelta': return { nombre: 'Devolución de fianza', femenino: true };
    default: return { nombre: 'Gasto', femenino: false };
  }
}
const conGenero = (tipo: TipoMovimiento, accion: 'guardad' | 'eliminad' | 'editad') => {
  const { nombre, femenino } = nombreTipo(tipo);
  return `${nombre} ${accion}${femenino ? 'a' : 'o'}`;
};
export const etiquetaEliminado = (tipo: TipoMovimiento) => conGenero(tipo, 'eliminad');
export const etiquetaGuardado = (tipo: TipoMovimiento) => conGenero(tipo, 'guardad');
export const etiquetaEditado = (tipo: TipoMovimiento) => conGenero(tipo, 'editad');

/** Tipos que el colaborador (Pablo) puede registrar y editar (§3). */
export const TIPOS_COLABORADOR: TipoMovimiento[] = ['aporte', 'prestamo', 'devolucion_prestamo'];

/** Parte de un cobro aplicada a un pendiente: 'abono:AAAA-MM' (cuota del cliente) o 'deuda:<id>' (trabajo). */
export interface Saldo {
  clave: string;
  importe: number;
}

export interface Movimiento extends Comunes {
  tipo: TipoMovimiento;
  importe: number; // céntimos, siempre positivo; el signo lo da el tipo
  fecha: string; // ISO (instante)
  categoria_id: string | null;
  medio_pago: MedioPago;
  cliente_id: string | null;
  nota: string;
  foto_id: string | null; // foto del ticket guardada en local (tabla fotos)
  es_inversion: boolean;
  // Ola 4. Opcionales para no migrar los movimientos ya guardados.
  /** Cobros: pendientes que salda (§9.4). */
  saldos?: Saldo[];
  /** Cobro de abono: mes que paga (§8.6). */
  periodo_abono?: string | null;
  /** Devolución de fianza y gasto por descuento: id del movimiento de entrega (que es la fianza, §8.8). */
  fianza_id?: string | null;
  /** Fianza entregada: a quién y por qué. */
  fianza?: { entregada_a: string; motivo: string } | null;
  /** Devolución de préstamo: id del movimiento de préstamo (que es el préstamo, §8.9). */
  prestamo_id?: string | null;
  // Ocultos en v1 (§19), presentes para no migrar después.
  con_iva: boolean | null;
  base: number | null;
  cuota_iva: number | null;
}

export type GrupoCategoria =
  | 'Movilidad' | 'Maquinaria' | 'Equipos' | 'Jardín' | 'Piscina' | 'Restos' | 'Personal' | 'Negocio' | 'Otros' | 'Ingresos';

export interface Categoria extends Comunes {
  clave: string; // identificador estable de la categoría inicial
  nombre: string;
  nombre_corto: string; // texto de la cuadrícula (mockup p. 2)
  grupo: GrupoCategoria;
  icono: string; // nombre del icono Lucide
  tipo: 'gasto' | 'ingreso';
  es_inversion: boolean;
  visible: boolean;
  orden_manual: number;
  contador_uso_60d: number;
}

export interface Foto {
  id: string;
  blob: Blob;
  creado_en: string;
  subida: boolean;
}

export interface Ajuste {
  clave: string;
  valor: unknown;
}

// ---------- Ola 4: clientes y deudas ----------

export type Servicio = 'jardin' | 'piscina';
export type Modalidad = 'abono' | 'puntual';
export type Frecuencia = 'semanal' | 'quincenal' | 'mensual' | 'personalizada';
export type TipoTrabajo =
  | 'corte_cesped' | 'setos_poda' | 'desbroce' | 'plantacion' | 'abonado'
  | 'fitosanitarios' | 'riego' | 'piscina' | 'limpieza_general' | 'otro';

export const TIPOS_TRABAJO: { id: TipoTrabajo; nombre: string }[] = [
  { id: 'corte_cesped', nombre: 'Césped' },
  { id: 'setos_poda', nombre: 'Setos y poda' },
  { id: 'desbroce', nombre: 'Desbroce' },
  { id: 'plantacion', nombre: 'Plantación' },
  { id: 'abonado', nombre: 'Abonado' },
  { id: 'fitosanitarios', nombre: 'Fitosanitarios' },
  { id: 'riego', nombre: 'Riego' },
  { id: 'piscina', nombre: 'Piscina' },
  { id: 'limpieza_general', nombre: 'Limpieza' },
  { id: 'otro', nombre: 'Otro' },
];

/** Cliente (§8.2). */
export interface Cliente extends Comunes {
  nombre: string;
  tipo: 'particular' | 'comunidad' | 'empresa';
  telefono: string | null; // E.164
  telefono_2: string | null;
  contacto: string;
  direccion: string;
  municipio: string;
  lat: number | null;
  lon: number | null;
  servicios: Servicio[];
  modalidad: Modalidad;
  cuota_abono: number | null; // céntimos
  dia_cobro_abono: number | null; // 1 a 28
  frecuencia_visitas: Frecuencia | null;
  dias_preferidos: number[]; // 0 = domingo
  hora_preferida: string | null; // "09:00"
  duracion_habitual: number; // minutos
  tipos_trabajo_habituales: TipoTrabajo[];
  precio_habitual: number | null; // céntimos
  requiere_vehiculo_por_defecto: boolean;
  ayudantes_por_defecto: number;
  notas: string;
  activo: boolean;
}

/**
 * Trabajo hecho sin cobrar del todo (§9.4). En la v1 lo crea la visita al pulsar «Hecho»; mientras no hay
 * agenda, lo crea la hoja «¿Cobraste a …?» desde la ficha del cliente. Lo cobrado sale de los `saldos`
 * de los cobros activos, así que borrar o deshacer un cobro deja la deuda bien sin tocarla.
 */
export interface Deuda extends Comunes {
  cliente_id: string;
  concepto: string;
  importe: number; // céntimos
  fecha: string; // ISO: cuándo se hizo el trabajo
  visita_id: string | null;
}
