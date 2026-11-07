import { useId, useMemo } from 'react';
import { useSemaforoVisita, type Semaforo } from '../../clima';
import type { Cliente, Visita } from '../../domain/tipos';
import { PuntoSemaforo, visitaClima } from './LineaSemaforo';
import { datosFranja, huecoLibrePara, textoHoraActualizacion, textoLinea, TEXTO_ORIENTATIVO, ubicacionDe, type DatosFranjaVisita } from './semaforoVisita';
import './clima.css';

// «Tiempo de la visita» en el Detalle de visita (§10.6.3): semáforo grande con motivo, temperatura, lluvia y
// viento en la franja horaria de la visita, consejo si existe y hora de la última actualización.
// «Sin previsión» se muestra de forma neutra, con su motivo y sin culpas (§5.4.4, §17).

export interface VistaSemaforoDetalle {
  semaforo: Semaforo | null;
  datos: DatosFranjaVisita | null;
  /** «Actualizado hace 5 h» (servicio, sólo si tiene más de 3 h). */
  antiguedad: string | null;
  ahora?: Date;
}

/** Vista pura (pruebas y pantalla). */
export function SemaforoDetalleVista({ semaforo, datos, antiguedad, ahora }: VistaSemaforoDetalle) {
  const id = useId();
  if (!semaforo) {
    return (
      <section className="tarjeta detalle-tarjeta semaforo-detalle" aria-labelledby={`${id}-t`} aria-busy="true" data-nivel="cargando">
        <h2 className="etiqueta-seccion" id={`${id}-t`}>
          Tiempo de la visita
        </h2>
        <div className="esqueleto" />
        <span className="sr-only">Cargando el tiempo</span>
      </section>
    );
  }
  const nivel = semaforo.orientativo ? 'orientativo' : semaforo.nivel;
  const t = textoLinea(semaforo);
  const actualizada = antiguedad ?? textoHoraActualizacion(semaforo.actualizado_en, ahora);
  const motivo = semaforo.orientativo ? TEXTO_ORIENTATIVO : t.detalle;
  const conDatos = datos && !semaforo.orientativo && semaforo.nivel !== 'gris';
  return (
    <section className="tarjeta detalle-tarjeta semaforo-detalle" aria-labelledby={`${id}-t`} data-nivel={nivel}>
      <h2 className="etiqueta-seccion" id={`${id}-t`}>
        Tiempo de la visita
      </h2>
      <div className="cabeza">
        <PuntoSemaforo nivel={nivel} />
        <div>
          <span className="estado-grande">{t.estado}</span>
          {motivo && <span className="motivo">{motivo}</span>}
        </div>
      </div>
      {conDatos && (
        <ul className="datos-franja" aria-label="Tiempo durante la visita">
          <li className="dato">
            <span className="nombre">Temperatura</span>
            <span className="valor">{datos.tempMin === datos.tempMax ? `${datos.tempMax}°` : `${datos.tempMin}° a ${datos.tempMax}°`}</span>
          </li>
          <li className="dato">
            <span className="nombre">Lluvia</span>
            <span className="valor">
              {datos.probLluvia} %{datos.lluvia > 0 ? ` · ${String(datos.lluvia).replace('.', ',')} mm` : ''}
            </span>
          </li>
          <li className="dato">
            <span className="nombre">Viento</span>
            <span className="valor">
              {datos.viento} km/h{datos.rachas > datos.viento ? ` · rachas ${datos.rachas}` : ''}
            </span>
          </li>
        </ul>
      )}
      {semaforo.consejo && !semaforo.orientativo && <p className="consejo">Consejo: {semaforo.consejo}</p>}
      {(actualizada || semaforo.simulado) && (
        <p className="pie-semaforo">
          {[actualizada, semaforo.simulado ? 'Datos de prueba' : null].filter(Boolean).join(' · ')}
        </p>
      )}
    </section>
  );
}

/** Semáforo grande de una visita con los datos del cliente. */
export function SemaforoDetalle({ visita, cliente, visitas }: { visita: Visita; cliente: Cliente | undefined; visitas: Visita[] }) {
  const vc = useMemo(() => visitaClima(visita), [visita]);
  const ubicacion = ubicacionDe(cliente);
  const hueco = useMemo(() => huecoLibrePara(visita, visitas), [visita, visitas]);
  const { semaforo, prevision, actualizado } = useSemaforoVisita(vc, ubicacion, hueco);
  const datos = useMemo(() => datosFranja(prevision, visita), [prevision, visita]);
  return <SemaforoDetalleVista semaforo={semaforo} datos={datos} antiguedad={actualizado} />;
}
