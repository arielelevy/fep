// Motor de alertas de clima (ola 7, frente A). Contrato para la pantalla Alertas (frente B): ver CONTRATO.md.
// Las fixtures simuladas (clima y AEMET) NO se exportan desde aquí: viven en ./fixtures y sólo las usan las pruebas.

export * from './tipos';
export { ACCIONES, CATALOGO_CLIMA, RANGO_AVISO, RANGO_SEMAFORO, REGLAS_POR_TIPO, TEXTO_SEMAFORO, UMBRALES_ALERTAS, UMBRALES_SEMAFORO, type EntradaCatalogo } from './catalogo';
export { claveAsunto, claveDedupe, leerClaveAsunto, type FamiliaAsunto } from './dedupe';
export { alertasActivas, contarParaDecidir, estadoVacio, marcarNotificadas, recalcularAlertas, type EntradaRecalculo } from './motor';
export { esHuecoLibre, horasLibres, NOTA_HORAS, proponerMover, type EntradaPropuesta } from './huecos';
export { enlaceWhatsApp, esE164, FIRMA, mensajeCancelarVisita, mensajeMoverVisita, mensajeRecordatorioCobro, MOTIVO_CLIMA } from './whatsapp';
export { avisosDesdeCap, crearProveedorAemetSimulado, dentroDePoligono, proveedorAemetPorDefecto, type AlertaCap, type InfoCap, type ProveedorAvisos } from './aemet';
export {
  almacenAlertasEnMemoria, almacenAlertasLocal, CLAVE_AJUSTE_ALERTAS, mantenerVisita, moverVisitaPorAlerta, prepararClima, quienSoy, recalcularYGuardar,
  type AlmacenAlertas,
} from './operaciones';
export { diaConNumero, diasEntre } from './textos';
