import { useEffect, useRef, useState } from 'react';
import { prefiereMenosMovimiento } from '../lib/hooks';

export const DURACION_CONTEO_MS = 250; // §5.5.1: 200 a 300 ms

/**
 * Cifra que cuenta hasta su nuevo valor al cambiar (§5.5.1). Con "reducir movimiento" cambia al instante.
 * El valor final está siempre en el texto accesible y en data-valor.
 */
export function CifraAnimada({
  valor,
  formato,
  className,
  testId,
}: {
  valor: number;
  formato: (c: number) => string;
  className?: string;
  testId?: string;
}) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);

  useEffect(() => {
    const inicio = desde.current;
    if (inicio === valor) return;
    if (prefiereMenosMovimiento() || typeof requestAnimationFrame !== 'function') {
      desde.current = valor;
      setMostrado(valor);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / DURACION_CONTEO_MS);
      const suave = 1 - (1 - p) ** 3;
      const actual = Math.round(inicio + (valor - inicio) * suave);
      desde.current = actual;
      setMostrado(actual);
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);

  return (
    <span className={className} data-testid={testId} data-valor={valor}>
      <span aria-hidden="true">{formato(mostrado)}</span>
      <span className="sr-only">{formato(valor)}</span>
    </span>
  );
}
