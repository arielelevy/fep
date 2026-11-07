import { useEffect, useMemo, useState } from 'react';
import { useDatos } from '../../../db/datos';
import { useLive } from '../../../lib/hooks';
import type { Preparacion, ReservaVehiculo } from '../../preparar/modelo';
import { leerPreparaciones, leerReservas } from '../../preparar/operaciones';
import { leerPlantillas, type Plantillas } from '../../preparar/plantillas';
import { leerAvisoFurgo } from '../../ajustes/proveedores/datos';
import { leerEstado, type EstadoAlertasPreparacion } from './estado';
import { calcularAlertasPreparacion, contarParaDecidirPreparacion, type SalidaMotor } from './motor';

// Alertas de preparación reactivas: se recalculan al cambiar visitas, preparaciones, reservas, plantillas o ajustes,
// y cada minuto (para que la recogida o el recordatorio aparezcan a su hora con la pantalla abierta).

interface Guardado {
  preparaciones: Record<string, Preparacion>;
  reservas: ReservaVehiculo[];
  plantillas: Plantillas;
  aviso: number;
  estado: EstadoAlertasPreparacion;
}

export interface UsoAlertasPreparacion extends SalidaMotor {
  reservas: ReservaVehiculo[];
  preparaciones: Record<string, Preparacion>;
  plantillas: Plantillas;
  insignia: number;
  ahora: Date;
}

export function useAlertasPreparacion(): UsoAlertasPreparacion | null {
  const datos = useDatos();
  const [tic, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const guardado = useLive<Guardado>(async () => {
    const [preparaciones, reservas, plantillas, aviso, estado] = await Promise.all([leerPreparaciones(), leerReservas(), leerPlantillas(), leerAvisoFurgo(), leerEstado()]);
    return { preparaciones, reservas, plantillas, aviso, estado };
  });

  return useMemo(() => {
    if (!datos || !guardado) return null;
    const ahora = new Date();
    const salida = calcularAlertasPreparacion({
      visitas: datos.visitas,
      clientes: datos.clientes,
      preparaciones: guardado.preparaciones,
      reservas: guardado.reservas,
      plantillas: guardado.plantillas,
      avisoFurgoDias: guardado.aviso,
      pospuestas: guardado.estado.pospuestas,
      ahora,
    });
    return {
      ...salida,
      reservas: guardado.reservas,
      preparaciones: guardado.preparaciones,
      plantillas: guardado.plantillas,
      insignia: contarParaDecidirPreparacion(salida.alertas),
      ahora,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, guardado, tic]);
}
