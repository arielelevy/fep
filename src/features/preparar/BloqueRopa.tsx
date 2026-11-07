import { useId, useState } from 'react';
import { Check, Shirt } from 'lucide-react';
import { sumarDias } from '../../lib/fechas';
import { diaConNumero } from './logica';
import type { PrendaCalculada } from './modelo';
import { marcarRopa } from './operaciones';

// Bloque Ropa (§10.8.3; maqueta «7. Preparar trabajo», bloque Ropa; azul suave como la ropa en §6.1). «Ropa para N
// personas» con N = 1 + ayudantes; checklist en 2 columnas, casilla de 22 pt y fila entera tocable de 44 pt.
// Cantidades entre paréntesis («Polos FERGO (3)», «Guantes (3 pares)»); «Agua y protector» sin multiplicar.

export function BloqueRopa({ fecha, personas, prendas, puede }: { fecha: string; personas: number; prendas: PrendaCalculada[]; puede: boolean }) {
  const id = useId();
  const [error, setError] = useState('');
  const vispera = diaConNumero(sumarDias(fecha, -1)).toLowerCase();

  const alternar = async (p: PrendaCalculada) => {
    setError('');
    try {
      await marcarRopa(fecha, p.clave, !p.marcada);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.name === 'SinPermiso' ? e.message : 'No se pudo guardar. Vuelve a intentarlo.');
    }
  };

  return (
    <section className="tarjeta bloque-preparar bloque-ropa" aria-labelledby={`${id}-t`} data-bloque="ropa">
      <header className="bloque-cabecera">
        <span className="bloque-icono azul" aria-hidden="true">
          <Shirt size={22} />
        </span>
        <div>
          <h2 id={`${id}-t`}>{personas === 1 ? 'Ropa para 1 persona' : `Ropa para ${personas} personas`}</h2>
          <p className="bloque-sub">Te lo recuerdo el {vispera} a las 21:00</p>
        </div>
      </header>
      <ul className="lista-ropa">
        {prendas.map((p) => (
          <li key={p.clave}>
            <button type="button" role="checkbox" aria-checked={p.marcada} className="prenda tocable" disabled={!puede} onClick={() => alternar(p)}>
              <span className="casilla" aria-hidden="true">
                {p.marcada && <Check size={16} strokeWidth={3} />}
              </span>
              <span>{p.texto}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="bloque-sub">Las cantidades se ajustan solas a la gente asignada al trabajo.</p>
      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
