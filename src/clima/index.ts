// API del clima y semáforo de visitas (ola 6, frente A). El frente de pantallas consume sólo esto.
//
//   import { useSemaforoVisita, usePrevision14Dias, evaluarVisita, configurarClima } from '../clima';
//
// - evaluarVisita(entrada) → Semaforo: motor puro por reglas (§11.3, §11.4).
// - useSemaforoVisita(visita, ubicacion) → { semaforo, cargando, actualizado }: hook para tarjetas y detalle.
// - usePrevision14Dias(ubicacion = UBICACION_REFERENCIA) → { dias, cargando, estado, actualizado }: franja de la Agenda.
// - configurarClima({ proveedor, almacen }): enchufa el proveedor real (Open-Meteo/AEMET) sin tocar el motor.

export * from './tipos';
export { CODIGOS_TORMENTA, esTormenta, iconoWmo, textoWmo, type IconoTiempo } from './wmo';
export { ESTADOS, MOTIVOS, UMBRALES, evaluarVisita, type EntradaSemaforo } from './semaforo';
export { crearProveedorSimulado, horaSimulada, redondear, resumirDias, type OpcionesSimulado } from './proveedorSimulado';
export {
  DIAS_PREVISION, HORAS_FRESCA, almacenEnMemoria, almacenLocal, claveUbicacion, crearServicioClima, diasPrevision, edadHoras,
  textoActualizado, type AlmacenClima, type DiaPrevision, type EstadoPrevision, type ResultadoPrevision, type ServicioClima,
} from './servicio';
export { configurarClima, servicioClima, usePrevision, usePrevision14Dias, useSemaforoVisita, usarDatosSimulados } from './hooks';
