import { useMemo } from 'react';
import { useDatos } from '../../db/datos';
import { useLive } from '../../lib/hooks';
import { bloques, listaMaterial, listaRopa, personas, visitasDelDia } from './logica';
import type { Preparacion, ReservaVehiculo } from './modelo';
import { leerPreparaciones, leerReservas, reservaDelDia } from './operaciones';
import { leerPlantillas, type Plantillas } from './plantillas';

// Datos de la preparación de un día, reactivos: cambian solos al guardar (aquí, en otra pantalla o al deshacer).

interface Guardado {
  preparacion: Preparacion | undefined;
  reserva: ReservaVehiculo | undefined;
  plantillas: Plantillas;
}

export function usePreparacion(fecha: string) {
  const datos = useDatos();
  const guardado = useLive<Guardado>(async () => {
    const [preparaciones, reservas, plantillas] = await Promise.all([leerPreparaciones(), leerReservas(), leerPlantillas()]);
    return { preparacion: preparaciones[fecha], reserva: reservaDelDia(reservas, fecha), plantillas };
  }, [fecha]);

  return useMemo(() => {
    if (!datos || !guardado) return null;
    const visitas = visitasDelDia(datos.visitas, fecha);
    const n = personas(visitas);
    const material = listaMaterial(visitas, guardado.plantillas.material, guardado.preparacion?.material);
    const ropa = listaRopa(guardado.plantillas.ropa, n, guardado.preparacion?.ropa_marcada);
    return {
      datos,
      visitas,
      personas: n,
      material,
      ropa,
      reserva: guardado.reserva,
      preparacion: guardado.preparacion,
      plantillas: guardado.plantillas,
      bloques: bloques(visitas, guardado.reserva, material, ropa),
      puede: !datos.esColaborador,
    };
  }, [datos, guardado, fecha]);
}

export type UsoPreparacion = NonNullable<ReturnType<typeof usePreparacion>>;
