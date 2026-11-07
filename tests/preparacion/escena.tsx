// Datos y montaje comunes de las pruebas de tests/preparacion/ (ola 8, encargo B). Base local falsa (IndexedDB).
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { DeshacerProvider } from '../../src/components/Deshacer';
import { DatosProvider } from '../../src/db/datos';
import { db } from '../../src/db/db';
import { crearCliente, crearVisita, leerAjuste, type DatosCliente } from '../../src/db/repo';
import type { TipoTrabajo, Visita } from '../../src/domain/tipos';
import { calcularAlertasPreparacion } from '../../src/features/alertas/preparacion/motor';
import { leerEstado } from '../../src/features/alertas/preparacion/estado';
import { leerAvisoFurgo } from '../../src/features/ajustes/proveedores/datos';
import { CLAVE_PREPARACIONES, CLAVE_RESERVAS, type Preparacion, type ReservaVehiculo } from '../../src/features/preparar/modelo';
import { leerPlantillas } from '../../src/features/preparar/plantillas';
import { desdeMadrid } from '../../src/lib/fechas';

/** Sábado 7 de noviembre de 2026, 10:00 en Madrid. */
export const AHORA = desdeMadrid(2026, 11, 7, 10);
export const DOMINGO = '2026-11-08';
export const MARTES = '2026-11-10';
export const MIERCOLES = '2026-11-11';
export const JUEVES = '2026-11-12';

export const BASE: DatosCliente = {
  nombre: 'Sra. Morales', tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Olivo 1', municipio: 'Madrid',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [], precio_habitual: null,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};

export async function visita(op: {
  cliente?: string;
  fecha: string;
  hora?: string;
  tipos?: TipoTrabajo[];
  furgo?: boolean;
  ayudantes?: number;
}): Promise<Visita> {
  const cliente = (await crearCliente({ ...BASE, nombre: op.cliente ?? 'Sra. Morales' })).cliente;
  return (
    await crearVisita({
      cliente_id: cliente.id, fecha: op.fecha, hora_inicio: op.hora ?? '09:00', duracion: 120, tipos_trabajo: op.tipos ?? ['plantacion'], descripcion: '',
      precio: 12000, incluida_en_abono: false, requiere_vehiculo: op.furgo ?? false, ayudantes: op.ayudantes ?? 0,
    })
  ).visita;
}

export function montar(ui: ReactNode) {
  const user = userEvent.setup();
  const r = render(
    <DatosProvider>
      <DeshacerProvider>{ui}</DeshacerProvider>
    </DatosProvider>,
  );
  return { user, ...r };
}

/** Alertas de preparación con los datos guardados, como las calcula la pantalla. */
export async function alertasAhora(ahora: Date = new Date()) {
  const [visitas, clientes, preparaciones, reservas, plantillas, aviso, estado] = await Promise.all([
    db.visitas.filter((v) => !v.eliminado_en).toArray(),
    db.clientes.toArray(),
    leerAjuste<Record<string, Preparacion>>(CLAVE_PREPARACIONES, {}),
    leerAjuste<ReservaVehiculo[]>(CLAVE_RESERVAS, []),
    leerPlantillas(),
    leerAvisoFurgo(),
    leerEstado(),
  ]);
  return calcularAlertasPreparacion({ visitas, clientes, preparaciones, reservas, plantillas, avisoFurgoDias: aviso, pospuestas: estado.pospuestas, ahora });
}

export const activos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();
export const texto = (el: Element | null | undefined) => el?.textContent ?? '';
