import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { useDeshacer } from '../components/Deshacer';
import { moverVisita } from '../db/repo';
import type { MotivoReprogramacion, Visita } from '../domain/tipos';
import { DIAS_LARGOS, diaSemanaDeClave } from '../lib/fechas';
import { useCerrojo } from '../lib/hooks';
import '../styles/clientes.css';
import '../styles/agenda.css';

// PENDIENTE DE MAQUETA (H4)
// Mover visita (§7.2, §8.4). Decisión de Ariel: esta pantalla queda pendiente de maqueta (docs/maqueta.md §4.1, H4).
// Hoja mínima y funcional, sin diseño propio: mismas piezas que SaldoInicial / ClienteForm (hoja, campos, chips,
// botón lima) y un aviso visible de que es provisional.

const MOTIVOS: { id: MotivoReprogramacion; nombre: string }[] = [
  { id: 'clima', nombre: 'Clima' },
  { id: 'cliente', nombre: 'Cliente' },
  { id: 'propio', nombre: 'Propio' },
  { id: 'otro', nombre: 'Otro' },
];

/** «jueves 15» para la barra «Visita movida al jueves 15». */
export function diaCorto(clave: string): string {
  return `${DIAS_LARGOS[diaSemanaDeClave(clave)].toLowerCase()} ${Number(clave.slice(8, 10))}`;
}

export function MoverVisita({ visita, onCerrar }: { visita: Visita; onCerrar: (movida: boolean) => void }) {
  const id = useId();
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  const [fecha, setFecha] = useState(visita.fecha);
  const [hora, setHora] = useState(visita.hora_inicio ?? '');
  const [motivo, setMotivo] = useState<MotivoReprogramacion>('propio');
  const [error, setError] = useState('');

  const valido = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && (fecha !== visita.fecha || (hora || null) !== visita.hora_inicio);

  const guardar = async () => {
    if (!valido || !cerrojo.tomar()) return;
    try {
      const r = await moverVisita(visita.id, fecha, hora || null, motivo);
      onCerrar(true);
      mostrar(`Visita movida al ${diaCorto(fecha)}`, r.deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError(e instanceof Error && e.name === 'SinPermiso' ? e.message : 'No se pudo mover la visita. Vuelve a intentarlo.');
    }
  };

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
        <header className="hoja-cabecera">
          <h1 id={`${id}-titulo`}>Mover visita</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={() => onCerrar(false)}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <p className="texto-aclaratorio neutro pantalla-provisional">Pantalla provisional: el diseño de mover visita está pendiente de maqueta.</p>
          <div className="cf-seccion">
            <div className="cf-cuerpo" style={{ paddingTop: 16 }}>
              <label className="cf-campo">
                <span className="cf-etiqueta">Fecha</span>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </label>
              <label className="cf-campo">
                <span className="cf-etiqueta">Hora</span>
                <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </label>
              <div className="cf-campo">
                <span className="cf-etiqueta" id={`${id}-motivo`}>
                  Motivo
                </span>
                <div className="cf-chips" role="radiogroup" aria-labelledby={`${id}-motivo`}>
                  {MOTIVOS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={motivo === m.id}
                      className="chip tocable"
                      onClick={() => setMotivo(m.id)}
                    >
                      {m.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {error && (
            <p className="aviso-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="hoja-pie">
          <button type="button" className="boton-principal tocable" disabled={!valido || cerrojo.ocupado} onClick={guardar}>
            Mover visita
          </button>
        </footer>
      </div>
    </div>
  );
}
