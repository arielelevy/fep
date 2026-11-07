import { useEffect, useMemo, useState } from 'react';
import { claveDia, sumarDias } from '../lib/fechas';
import { crearProveedorSimulado } from './proveedorSimulado';
import { evaluarVisita } from './semaforo';
import { almacenLocal, crearServicioClima, diasPrevision, textoActualizado, type EstadoPrevision, type ServicioClima, type DiaPrevision } from './servicio';
import { UBICACION_REFERENCIA, type AvisoOficial, type Prevision, type Semaforo, type Ubicacion, type VisitaClima } from './tipos';

// Hooks para las pantallas (Agenda, Hoy, Detalle de visita). Pintan al instante con lo guardado y refrescan en
// segundo plano (§10 «Cargando»). Si no hay datos, el semáforo sale gris «Sin previsión» con su motivo.

const CLAVE_SIMULADO = 'fergo.clima.simulado';

/**
 * Datos simulados SOLO en desarrollo, en las pruebas o si se activa a mano (localStorage `fergo.clima.simulado = 1`).
 * En producción, mientras no se enchufe el proveedor real, no hay previsión: las visitas muestran «Sin previsión»
 * en vez de un tiempo inventado (decisión pendiente de Ariel, ver informe de la ola 6).
 */
export function usarDatosSimulados(): boolean {
  try {
    if (window.localStorage.getItem(CLAVE_SIMULADO) === '1') return true;
  } catch {
    /* sin almacenamiento */
  }
  return Boolean(import.meta.env?.DEV || import.meta.env?.MODE === 'test');
}

let servicio: ServicioClima | null = null;

/** Servicio en uso (se crea al primer uso). */
export function servicioClima(): ServicioClima {
  if (!servicio) servicio = crearServicioClima({ proveedor: usarDatosSimulados() ? crearProveedorSimulado() : null, almacen: almacenLocal() });
  return servicio;
}

/** Cambia el servicio: el proveedor real se enchufa aquí sin tocar el motor (§13.2). También para pruebas. */
export function configurarClima(s: ServicioClima | null): void {
  servicio = s;
}

export interface UsoPrevision {
  prevision: Prevision | null;
  avisos: AvisoOficial[];
  estado: EstadoPrevision;
  motivo?: string;
  cargando: boolean;
  /** "Actualizado hace 5 h" si tiene más de 3 horas (§14.6). */
  actualizado: string | null;
}

/** Previsión de una ubicación (null = sin coordenadas). */
export function usePrevision(ubicacion: Ubicacion | null): UsoPrevision {
  const lat = ubicacion?.lat;
  const lon = ubicacion?.lon;
  const [r, setR] = useState<UsoPrevision>(() => {
    const g = ubicacion ? servicioClima().guardada(ubicacion) : null;
    return { prevision: g, avisos: [], estado: g ? 'guardada' : 'sin_datos', cargando: Boolean(ubicacion), actualizado: textoActualizado(g) };
  });
  useEffect(() => {
    if (lat === undefined || lon === undefined) {
      setR({ prevision: null, avisos: [], estado: 'sin_datos', cargando: false, actualizado: null });
      return;
    }
    let vivo = true;
    const u = { lat, lon };
    const s = servicioClima();
    const hoy = claveDia(new Date());
    Promise.all([s.prevision(u), s.avisos(u, hoy, sumarDias(hoy, 13))]).then(([res, avisos]) => {
      if (vivo) setR({ prevision: res.prevision, avisos, estado: res.estado, motivo: res.motivo, cargando: false, actualizado: textoActualizado(res.prevision) });
    });
    return () => {
      vivo = false;
    };
  }, [lat, lon]);
  return r;
}

/**
 * Semáforo de una visita. `ubicacion` son las coordenadas del cliente (null si no tiene). `huecoLibre` es opcional
 * (consejo «Empieza a las …» sólo si la agenda tiene el hueco).
 */
export function useSemaforoVisita(
  visita: VisitaClima | null,
  ubicacion: Ubicacion | null,
  huecoLibre?: (inicio: string, fin: string) => boolean,
): { semaforo: Semaforo | null; cargando: boolean; actualizado: string | null } {
  const p = usePrevision(ubicacion);
  const semaforo = useMemo(
    () =>
      visita
        ? evaluarVisita({ visita, ubicacion, prevision: p.prevision, avisos: p.avisos, motivoSinPrevision: p.motivo, huecoLibre })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visita?.fecha, visita?.hora_inicio, visita?.duracion, visita?.tipos_trabajo.join(','), ubicacion?.lat, ubicacion?.lon, p.prevision, p.avisos, p.motivo],
  );
  // Mientras carga y no hay nada guardado, no se afirma «Sin conexión»: el semáforo aún no se conoce.
  return { semaforo: p.cargando && !p.prevision ? null : semaforo, cargando: p.cargando, actualizado: p.actualizado };
}

/** Franja de 14 días de la Agenda (§10.5.2), con la ubicación de referencia del negocio por defecto (§11.1). */
export function usePrevision14Dias(ubicacion: Ubicacion = UBICACION_REFERENCIA): {
  dias: DiaPrevision[];
  cargando: boolean;
  estado: EstadoPrevision;
  motivo?: string;
  actualizado: string | null;
} {
  const p = usePrevision(ubicacion);
  const dias = useMemo(() => diasPrevision(p.prevision), [p.prevision]);
  return { dias, cargando: p.cargando, estado: p.estado, motivo: p.motivo, actualizado: p.actualizado };
}
