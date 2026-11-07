import type { GrupoCategoria } from './tipos';

// Categorías iniciales (§9.2). 'orden' reproduce el orden inicial de la cuadrícula:
// Gasolina, Alquiler furgo, Repuestos, Plantas y abono, Piscina, Vertedero, Herramientas, Ayudante, Más.
export interface CategoriaInicial {
  clave: string;
  nombre: string;
  nombre_corto: string;
  grupo: GrupoCategoria;
  icono: string;
  tipo: 'gasto' | 'ingreso';
  es_inversion: boolean;
  visible: boolean;
  orden: number;
}

export const CATEGORIAS_INICIALES: CategoriaInicial[] = [
  // Las 8 de la cuadrícula inicial (mockup p. 2)
  { clave: 'gasolina', nombre: 'Gasolina (vehículo)', nombre_corto: 'Gasolina', grupo: 'Movilidad', icono: 'Fuel', tipo: 'gasto', es_inversion: false, visible: true, orden: 1 },
  { clave: 'alquiler_furgoneta', nombre: 'Alquiler de furgoneta', nombre_corto: 'Alquiler furgo', grupo: 'Movilidad', icono: 'Truck', tipo: 'gasto', es_inversion: false, visible: true, orden: 2 },
  { clave: 'repuestos', nombre: 'Repuestos y mantenimiento', nombre_corto: 'Repuestos', grupo: 'Maquinaria', icono: 'Wrench', tipo: 'gasto', es_inversion: false, visible: true, orden: 3 },
  { clave: 'plantas', nombre: 'Plantas, semillas y césped', nombre_corto: 'Plantas y abono', grupo: 'Jardín', icono: 'Sprout', tipo: 'gasto', es_inversion: false, visible: true, orden: 4 },
  { clave: 'productos_piscina', nombre: 'Productos de piscina', nombre_corto: 'Piscina', grupo: 'Piscina', icono: 'Droplet', tipo: 'gasto', es_inversion: false, visible: true, orden: 5 },
  { clave: 'vertedero', nombre: 'Vertedero y retirada de restos', nombre_corto: 'Vertedero', grupo: 'Restos', icono: 'Trash2', tipo: 'gasto', es_inversion: false, visible: true, orden: 6 },
  { clave: 'herramientas', nombre: 'Herramientas y equipos nuevos', nombre_corto: 'Herramientas', grupo: 'Equipos', icono: 'Scissors', tipo: 'gasto', es_inversion: true, visible: true, orden: 7 },
  { clave: 'ayudantes', nombre: 'Ayudantes y subcontratas', nombre_corto: 'Ayudante', grupo: 'Personal', icono: 'User', tipo: 'gasto', es_inversion: false, visible: true, orden: 8 },
  // Resto, en "Más"
  { clave: 'peajes', nombre: 'Peajes y aparcamiento', nombre_corto: 'Peajes', grupo: 'Movilidad', icono: 'CircleParking', tipo: 'gasto', es_inversion: false, visible: true, orden: 9 },
  { clave: 'seguro_vehiculo', nombre: 'Seguro y mantenimiento del vehículo', nombre_corto: 'Seguro vehículo', grupo: 'Movilidad', icono: 'ShieldCheck', tipo: 'gasto', es_inversion: false, visible: false, orden: 10 },
  { clave: 'gasolina_mezcla', nombre: 'Gasolina de mezcla (máquinas)', nombre_corto: 'Mezcla', grupo: 'Maquinaria', icono: 'Container', tipo: 'gasto', es_inversion: false, visible: true, orden: 11 },
  { clave: 'sustrato_abono', nombre: 'Sustrato y abono', nombre_corto: 'Sustrato y abono', grupo: 'Jardín', icono: 'Package', tipo: 'gasto', es_inversion: false, visible: true, orden: 12 },
  { clave: 'material_riego', nombre: 'Material de riego', nombre_corto: 'Riego', grupo: 'Jardín', icono: 'Droplets', tipo: 'gasto', es_inversion: false, visible: true, orden: 13 },
  { clave: 'fitosanitarios', nombre: 'Fitosanitarios', nombre_corto: 'Fitosanitarios', grupo: 'Jardín', icono: 'SprayCan', tipo: 'gasto', es_inversion: false, visible: true, orden: 14 },
  { clave: 'material_piscina', nombre: 'Material y repuestos de piscina', nombre_corto: 'Material piscina', grupo: 'Piscina', icono: 'Filter', tipo: 'gasto', es_inversion: false, visible: true, orden: 15 },
  { clave: 'ropa', nombre: 'Ropa y protección', nombre_corto: 'Ropa', grupo: 'Personal', icono: 'Shirt', tipo: 'gasto', es_inversion: false, visible: true, orden: 16 },
  { clave: 'telefono', nombre: 'Teléfono', nombre_corto: 'Teléfono', grupo: 'Negocio', icono: 'Smartphone', tipo: 'gasto', es_inversion: false, visible: true, orden: 17 },
  { clave: 'publicidad', nombre: 'Publicidad', nombre_corto: 'Publicidad', grupo: 'Negocio', icono: 'Megaphone', tipo: 'gasto', es_inversion: false, visible: true, orden: 18 },
  { clave: 'impuestos', nombre: 'Impuestos, seguros y trámites', nombre_corto: 'Impuestos', grupo: 'Negocio', icono: 'FileText', tipo: 'gasto', es_inversion: false, visible: true, orden: 19 },
  { clave: 'cuota_autonomos', nombre: 'Cuota de autónomos', nombre_corto: 'Autónomos', grupo: 'Negocio', icono: 'FileText', tipo: 'gasto', es_inversion: false, visible: false, orden: 20 },
  { clave: 'otros_gastos', nombre: 'Otros gastos', nombre_corto: 'Otros', grupo: 'Otros', icono: 'Ellipsis', tipo: 'gasto', es_inversion: false, visible: true, orden: 21 },
  // Ingresos (§9.2). Se crean ya para no migrar; los cobros llegan en otra ola.
  { clave: 'cobro_abono', nombre: 'Cobro de abono', nombre_corto: 'Abono', grupo: 'Ingresos', icono: 'ArrowUp', tipo: 'ingreso', es_inversion: false, visible: true, orden: 101 },
  { clave: 'cobro_trabajo', nombre: 'Cobro de trabajo', nombre_corto: 'Trabajo', grupo: 'Ingresos', icono: 'ArrowUp', tipo: 'ingreso', es_inversion: false, visible: true, orden: 102 },
  { clave: 'anticipo', nombre: 'Anticipo o señal', nombre_corto: 'Anticipo', grupo: 'Ingresos', icono: 'ArrowUp', tipo: 'ingreso', es_inversion: false, visible: true, orden: 103 },
  { clave: 'venta_restos', nombre: 'Venta de restos o leña', nombre_corto: 'Venta', grupo: 'Ingresos', icono: 'ArrowUp', tipo: 'ingreso', es_inversion: false, visible: true, orden: 104 },
  { clave: 'reembolso', nombre: 'Reembolso', nombre_corto: 'Reembolso', grupo: 'Ingresos', icono: 'ArrowUp', tipo: 'ingreso', es_inversion: false, visible: true, orden: 105 },
  { clave: 'otros_ingresos', nombre: 'Otros ingresos', nombre_corto: 'Otros', grupo: 'Ingresos', icono: 'ArrowUp', tipo: 'ingreso', es_inversion: false, visible: true, orden: 106 },
];
