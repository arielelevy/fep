import { Bell } from 'lucide-react';
import { useId } from 'react';
import { useAlertasPreparacion } from '../../features/alertas/preparacion/useAlertasPreparacion';
import { useAlertasClima } from './useAlertasClima';
import './alertas.css';

// Campana de Alertas con insignia (§10.1.1, §10.5.1; maqueta p. 1 «Hoy» y p. 5 «Agenda»: botón circular de 44 pt
// a la derecha de la cabecera). La insignia roja cuenta las alertas activas que requieren decisión (no las
// informativas) y desaparece con 0. El nombre accesible sigue siendo «Alertas»; el número se lee como descripción.
export function CampanaAlertas({ onClick }: { onClick: () => void }) {
  const clima = useAlertasClima();
  // Ola 8: también cuentan las de preparación con acción (alquilar, recoger y devolver la furgoneta, comprar).
  const preparacion = useAlertasPreparacion();
  const insignia = clima.insignia + (preparacion?.insignia ?? 0);
  const id = useId();
  const texto = insignia === 1 ? '1 para decidir' : `${insignia} para decidir`;
  return (
    <button
      type="button"
      className="boton-icono tocable"
      aria-label="Alertas"
      aria-describedby={insignia > 0 ? id : undefined}
      onClick={onClick}
      data-insignia={insignia}
    >
      <Bell size={22} aria-hidden="true" />
      {insignia > 0 && (
        <span className="insignia-alertas" id={id}>
          <span aria-hidden="true">{insignia > 9 ? '9+' : insignia}</span>
          <span className="sr-only">{texto}</span>
        </span>
      )}
    </button>
  );
}
