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
