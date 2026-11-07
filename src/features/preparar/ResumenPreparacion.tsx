import { ChevronRight } from 'lucide-react';
import { necesitaPreparacion, textoProgreso, visitasDelDia } from './logica';
import { usePreparacion } from './usePreparacion';
import './preparar.css';

// Resumen «Furgo · Material · Ropa» con progreso en el Detalle de visita (§10.6.4) → Preparar trabajo.
// Solo aparece si el día de la visita tiene preparación (§10.8.4).
export function ResumenPreparacion({ fecha, onAbrir }: { fecha: string; onAbrir: (fecha: string) => void }) {
  const p = usePreparacion(fecha);
  if (!p) return null;
  const visitas = visitasDelDia(p.datos.visitas, fecha);
  if (!necesitaPreparacion(visitas, p.plantillas.material) || !p.bloques.length) return null;
  return (
    <button type="button" className="tarjeta resumen-preparacion tocable" onClick={() => onAbrir(fecha)}>
      <span className="textos">
        <span className="titulo">Preparación</span>
        <span className="detalle">
          {p.bloques.map((b) => (b.id === 'furgoneta' ? 'Furgo' : b.nombre)).join(' · ')} · {textoProgreso(p.bloques)}
        </span>
      </span>
      <ChevronRight size={20} aria-hidden="true" />
    </button>
  );
}
