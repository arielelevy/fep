// Plantillas de material y ropa (§8.12) y proveedores de alquiler (§8.14), en modo lectura.
//
// Las plantillas editables en Ajustes y el catálogo de proveedores son del encargo B (src/features/ajustes/). Mientras
// no exista su contrato, aquí se lee lo que haya guardado en `ajustes` con las claves de abajo y, si no hay nada, lo
// que fija la especificación, sin inventar artículos:
//   - Material: la especificación sólo da el ejemplo de `setos_poda` (cuchillas cortasetos, gasolina de mezcla,
//     sacos de restos, lona). Los demás tipos empiezan vacíos: Felipe añade lo que necesite con «+ Añadir otra cosa».
//   - Ropa: la plantilla por defecto de §8.12.
//   - Proveedores: ninguno (se escribe el nombre en la reserva).

import { leerAjuste } from '../../db/repo';
import type { PlantillasMaterial, PrendaPlantilla } from './modelo';

export const CLAVE_PLANTILLAS_MATERIAL = 'plantillas_material';
export const CLAVE_PLANTILLA_ROPA = 'plantilla_ropa';
export const CLAVE_PROVEEDORES = 'proveedores_alquiler';

/** §8.12: «Ejemplo `setos_poda`: cuchillas cortasetos, gasolina de mezcla, sacos de restos, lona». */
export const MATERIAL_POR_DEFECTO: PlantillasMaterial = {
  setos_poda: ['Cuchillas cortasetos', 'Gasolina de mezcla', 'Sacos de restos', 'Lona'],
};

/** §8.12: polo FERGO, pantalón, guantes (par), botas, gafas de protección, protección auditiva, gorra FERGO, agua y
 * protector solar (este último una vez por equipo, no por persona). */
export const ROPA_POR_DEFECTO: PrendaPlantilla[] = [
  { clave: 'polo', singular: 'Polo FERGO', plural: 'Polos FERGO' },
  { clave: 'pantalon', singular: 'Pantalón', plural: 'Pantalones' },
  { clave: 'guantes', singular: 'Guantes', plural: 'Guantes', unidad: { singular: 'par', plural: 'pares' } },
  { clave: 'botas', singular: 'Botas', plural: 'Botas', unidad: { singular: 'par', plural: 'pares' } },
  { clave: 'gafas', singular: 'Gafas de protección', plural: 'Gafas de protección' },
  { clave: 'auditiva', singular: 'Protección auditiva', plural: 'Protecciones auditivas' },
  { clave: 'gorra', singular: 'Gorra FERGO', plural: 'Gorras FERGO' },
  { clave: 'agua_protector', singular: 'Agua y protector', plural: 'Agua y protector', porEquipo: true },
];

export interface ProveedorAlquiler {
  id: string;
  nombre: string;
  telefono: string | null;
  /** Céntimos por día. */
  precio_dia: number | null;
  /** Céntimos. */
  fianza_habitual: number | null;
  habitual?: boolean;
}

export interface Plantillas {
  material: PlantillasMaterial;
  ropa: PrendaPlantilla[];
  proveedores: ProveedorAlquiler[];
}

export async function leerPlantillas(): Promise<Plantillas> {
  const [material, ropa, proveedores] = await Promise.all([
    leerAjuste<PlantillasMaterial | null>(CLAVE_PLANTILLAS_MATERIAL, null),
    leerAjuste<PrendaPlantilla[] | null>(CLAVE_PLANTILLA_ROPA, null),
    leerAjuste<ProveedorAlquiler[] | null>(CLAVE_PROVEEDORES, null),
  ]);
  return {
    material: material ?? MATERIAL_POR_DEFECTO,
    ropa: Array.isArray(ropa) && ropa.length ? ropa : ROPA_POR_DEFECTO,
    proveedores: Array.isArray(proveedores) ? proveedores : [],
  };
}

/** Proveedor habitual: el marcado como tal o el primero. */
export const proveedorHabitual = (p: ProveedorAlquiler[]): ProveedorAlquiler | undefined => p.find((x) => x.habitual) ?? p[0];
