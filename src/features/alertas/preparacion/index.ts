// Alertas de preparación (ola 8, encargo B; spec §12.2, §10.7, §10.8.4). Punto de entrada público.
export { calcularAlertasPreparacion, contarParaDecidirPreparacion, escalonFurgo, listaCompra, textoRopa } from './motor';
export type { AlertaPreparacion, EntradaMotor, SalidaMotor, TarjetaDia, TipoAlertaPreparacion } from './motor';
export { avisosInmediatos, CONFIG_AVISOS, enSilencio, lineasResumen, type Aviso, type ConfigAvisos } from './planificador';
export { CLAVE_ESTADO, leerEstado, marcarAvisados, posponer } from './estado';
export { useAlertasPreparacion } from './useAlertasPreparacion';
export { SeccionPreparar, useHayPreparacion } from './SeccionPreparar';
