import { useMemo } from 'react';
import { useSemaforoVisita, type Semaforo, type VisitaClima } from '../../clima';
import type { Cliente, Visita } from '../../domain/tipos';
import { textoLinea, textoLineaPlano, ubicacionDe } from './semaforoVisita';
import './clima.css';

// Línea de semáforo de las tarjetas de visita: Agenda (§10.5.4) y Hoy (§10.1.1.4).
// Punto de color + estado en palabras + detalle corto (§11.4, §5.6.3: nunca sólo color).
// Días 8 a 14: sin semáforo, sólo «Previsión orientativa» (§10.5.4, §11.3) — lo decide el motor (src/clima).

/** Punto del semáforo (decorativo: el texto al lado dice lo mismo). */
export function PuntoSemaforo({ nivel }: { nivel: Semaforo['nivel'] | 'orientativo' }) {
  return <span className="punto-semaforo" data-nivel={nivel} aria-hidden="true" />;
}

/** Vista pura de la línea (para pruebas y para quien ya tenga el semáforo calculado). */
export function LineaSemaforoVista({ semaforo, conConsejo = false }: { semaforo: Semaforo | null; conConsejo?: boolean }) {
  if (!semaforo) {
    return (
      <span className="linea-semaforo cargando" data-nivel="cargando">
        <span className="esqueleto" aria-hidden="true" />
        <span className="sr-only">Cargando el tiempo</span>
      </span>
    );
  }
  const nivel = semaforo.orientativo ? 'orientativo' : semaforo.nivel;
  const t = textoLinea(semaforo);
  return (
    <>
      <span className="linea-semaforo" data-nivel={nivel} title={textoLineaPlano(semaforo)}>
        <PuntoSemaforo nivel={nivel} />
        <span className="textos-semaforo">
          <span className="estado">{t.estado}</span>
          {t.detalle && <span className="detalle"> · {t.detalle}</span>}
        </span>
      </span>
      {conConsejo && semaforo.consejo && <span className="consejo-semaforo">Consejo: {semaforo.consejo}</span>}
    </>
  );
}

/** Lo que el motor necesita de una visita. */
export function visitaClima(v: Pick<Visita, 'fecha' | 'hora_inicio' | 'duracion' | 'tipos_trabajo'>): VisitaClima {
  return { fecha: v.fecha, hora_inicio: v.hora_inicio, duracion: v.duracion, tipos_trabajo: v.tipos_trabajo };
}

/** Línea de semáforo de una visita: calcula con la ubicación del cliente y pinta. */
export function LineaSemaforo({
  visita,
  cliente,
  huecoLibre,
  conConsejo = false,
}: {
  visita: Visita;
  cliente: Pick<Cliente, 'lat' | 'lon'> | undefined;
  huecoLibre?: (inicio: string, fin: string) => boolean;
  conConsejo?: boolean;
}) {
  // Objeto estable para el hook (sus dependencias son los campos, no la identidad).
  const vc = useMemo(() => visitaClima(visita), [visita]);
  const ubicacion = ubicacionDe(cliente);
  const { semaforo } = useSemaforoVisita(vc, ubicacion, huecoLibre);
  return <LineaSemaforoVista semaforo={semaforo} conConsejo={conConsejo} />;
}
