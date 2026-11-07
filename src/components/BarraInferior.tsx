import { ArrowUpDown, Calendar, Plus, Sun, Users } from 'lucide-react';

// Barra inferior de 5 elementos (§7.1, mockup p. 1/3/4/5, componente C1).
export type Pestana = 'hoy' | 'movimientos' | 'clientes' | 'agenda';

const PESTANAS: { id: Pestana; nombre: string; Icono: typeof Sun }[] = [
  { id: 'hoy', nombre: 'Hoy', Icono: Sun },
  { id: 'movimientos', nombre: 'Movimientos', Icono: ArrowUpDown },
  { id: 'clientes', nombre: 'Clientes', Icono: Users },
  { id: 'agenda', nombre: 'Agenda', Icono: Calendar },
];

export function BarraInferior({
  activa,
  onPestana,
  onRegistrar,
}: {
  activa: Pestana;
  onPestana: (p: Pestana) => void;
  onRegistrar: () => void;
}) {
  const boton = (p: (typeof PESTANAS)[number]) => (
    <button
      key={p.id}
      type="button"
      className="pestana tocable"
      aria-current={activa === p.id ? 'page' : undefined}
      onClick={() => onPestana(p.id)}
    >
      <p.Icono size={24} strokeWidth={2} aria-hidden="true" />
      {p.nombre}
    </button>
  );
  return (
    <nav className="barra-inferior" aria-label="Navegación principal">
      {boton(PESTANAS[0])}
      {boton(PESTANAS[1])}
      <div className="pestana-centro">
        <button type="button" className="boton-registrar tocable" aria-label="Registrar" onClick={onRegistrar}>
          <Plus size={32} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>
      {boton(PESTANAS[2])}
      {boton(PESTANAS[3])}
    </nav>
  );
}
