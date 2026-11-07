import { useEffect, useMemo, useState } from 'react';
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Info, Snowflake, Sun } from 'lucide-react';
import { claveUbicacion, evaluarVisita, servicioClima, usePrevision14Dias, type DiaPrevision, type Ubicacion } from '../../clima';
import type { Cliente, Visita } from '../../domain/tipos';
import { claveDia, sumarDias } from '../../lib/fechas';
import { visitaClima } from './LineaSemaforo';
import { huecoLibrePara, NOMBRE_ICONO, textoAccesibleDia, TEXTO_ORIENTATIVO, ubicacionDe } from './semaforoVisita';
import './clima.css';

// Franja de 14 días de la Agenda (§10.5.2): icono del tiempo, máxima y probabilidad de lluvia por día, con la
// ubicación de referencia del negocio (§11.1). Días 8 a 14 atenuados y «ORIENTATIVO» (los pinta Agenda.tsx con
// las clases existentes); aquí va el contenido del tiempo, el «i» explicativo y el contorno rojo de los días
// con alguna visita «Mejor mover».

const ICONOS = {
  sol: Sun,
  sol_nubes: CloudSun,
  nubes: Cloud,
  niebla: CloudFog,
  lluvia: CloudRain,
  nieve: Snowflake,
  tormenta: CloudLightning,
} as const;

/** Icono, máxima y lluvia de un día (dentro del botón del día). Decorativo: el botón lleva su etiqueta accesible. */
export function TiempoDia({ dia }: { dia: DiaPrevision | undefined }) {
  if (!dia || dia.icono === null) {
    return (
      <span className="tiempo-dia" aria-hidden="true" data-tiempo="sin-datos">
        <span className="sin-dato">–</span>
      </span>
    );
  }
  const Icono = ICONOS[dia.icono];
  return (
    <span className="tiempo-dia" aria-hidden="true" data-tiempo={dia.icono} title={NOMBRE_ICONO[dia.icono]}>
      <Icono className="icono-tiempo" size={18} strokeWidth={2} />
      {dia.max !== null && <span className="max">{Math.round(dia.max)}°</span>}
      {dia.probLluvia !== null && <span className="lluvia">{Math.round(dia.probLluvia)}%</span>}
    </span>
  );
}

/** Botón «i» del separador ORIENTATIVO (§10.5.2: «Toque largo o icono "i" explica …»). */
export function BotonInfoOrientativo({ abierta, onAlternar }: { abierta: boolean; onAlternar: () => void }) {
  return (
    <button
      type="button"
      className="info-orientativo tocable"
      aria-label="Por qué es orientativo"
      aria-expanded={abierta}
      aria-controls="nota-orientativa"
      onClick={onAlternar}
    >
      <Info size={18} aria-hidden="true" />
    </button>
  );
}

/** Nota «Más allá de una semana …»: visible al pulsar «i» o al elegir un día del 8 al 14. */
export function NotaOrientativa() {
  return (
    <p className="nota-orientativa" id="nota-orientativa" role="note">
      <Info size={18} aria-hidden="true" />
      <span>{TEXTO_ORIENTATIVO}</span>
    </p>
  );
}

/**
 * Días (de hoy a hoy + 6) con alguna visita programada en rojo, para el contorno rojo de la franja (§10.5.2).
 * Usa el motor de A con la previsión de cada cliente (una consulta por punto, agrupada por el servicio).
 */
export function useDiasConRojo(visitas: Visita[] | undefined, clientes: Cliente[] | undefined): Set<string> {
  const hoy = claveDia(new Date());
  const hasta = sumarDias(hoy, 6);
  const candidatas = useMemo(
    () => (visitas ?? []).filter((v) => v.estado === 'programada' && !v.eliminado_en && v.fecha >= hoy && v.fecha <= hasta),
    [visitas, hoy, hasta],
  );
  const firma = useMemo(() => {
    const porId = new Map((clientes ?? []).map((c) => [c.id, c]));
    return candidatas
      .map((v) => {
        const c = porId.get(v.cliente_id);
        return `${v.id}@${v.fecha}T${v.hora_inicio ?? ''}+${v.duracion}:${v.tipos_trabajo.join(',')}:${c?.lat ?? ''},${c?.lon ?? ''}`;
      })
      .join('|');
  }, [candidatas, clientes]);
  const [rojos, setRojos] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let vivo = true;
    const porId = new Map((clientes ?? []).map((c) => [c.id, c]));
    const grupos = new Map<string, { u: Ubicacion; vs: Visita[] }>();
    for (const v of candidatas) {
      const u = ubicacionDe(porId.get(v.cliente_id));
      if (!u) continue;
      const k = claveUbicacion(u);
      const g = grupos.get(k) ?? { u, vs: [] };
      g.vs.push(v);
      grupos.set(k, g);
    }
    if (!grupos.size) {
      setRojos((r) => (r.size ? new Set() : r));
      return;
    }
    const s = servicioClima();
    Promise.all(
      [...grupos.values()].map(async ({ u, vs }) => {
        const [res, avisos] = await Promise.all([s.prevision(u), s.avisos(u, hoy, hasta)]);
        return vs
          .filter((v) => evaluarVisita({ visita: visitaClima(v), ubicacion: u, prevision: res.prevision, avisos, motivoSinPrevision: res.motivo, huecoLibre: huecoLibrePara(v, candidatas) }).nivel === 'rojo')
          .map((v) => v.fecha);
      }),
    )
      .then((listas) => {
        if (vivo) setRojos(new Set(listas.flat()));
      })
      .catch((e) => console.error('No se pudo calcular el tiempo de la franja', e));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, hoy, hasta]);
  return rojos;
}

/** Previsión de la franja indexada por fecha, más la etiqueta accesible de cada día. */
export function useFranjaClima() {
  const p = usePrevision14Dias();
  const porFecha = useMemo(() => new Map(p.dias.map((d) => [d.fecha, d])), [p.dias]);
  return { porFecha, actualizado: p.actualizado, estado: p.estado, motivo: p.motivo, textoDia: (fecha: string) => textoAccesibleDia(porFecha.get(fecha)) };
}
