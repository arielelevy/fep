import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { MapPin } from 'lucide-react';
import type { Coordenadas } from '../../geocodificacion';
import './ubicacion.css';

// Mapa pequeño con chincheta arrastrable (§10.4.3 «Ubicación»; §13.3 «mostrar la chincheta y permitir
// corregirla»). Sin proveedor de mapas real (fuera de alcance): es un plano esquemático centrado en el punto
// geocodificado, sin teselas ni red. La chincheta se arrastra con el dedo o se mueve con las flechas del teclado.
// El plano cubre ≈ 0,008° de longitud × 0,005° de latitud (≈ 650 × 550 m en Madrid).

export const ANCHO_GRADOS = 0.008;
export const ALTO_GRADOS = 0.005;
/** Paso de las flechas del teclado (≈ 20 m). */
export const PASO_TECLADO = 0.0002;

const redondear5 = (n: number) => Math.round(n * 1e5) / 1e5;
const limitar = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** «40,41680, −3,70380» (coma decimal, es-ES). */
export function textoCoordenadas(c: Coordenadas): string {
  const f = (n: number) => n.toFixed(5).replace('.', ',').replace('-', '−');
  return `${f(c.lat)}, ${f(c.lon)}`;
}

/** Posición en % del plano (0–100) de un punto respecto al centro. */
export function posicionEnPlano(centro: Coordenadas, punto: Coordenadas): { x: number; y: number } {
  return {
    x: 50 + ((punto.lon - centro.lon) / ANCHO_GRADOS) * 100,
    y: 50 - ((punto.lat - centro.lat) / ALTO_GRADOS) * 100,
  };
}

/** Punto correspondiente a una posición en % del plano (limitada a los bordes). */
export function puntoDePosicion(centro: Coordenadas, x: number, y: number): Coordenadas {
  const px = limitar(x, 3, 97);
  const py = limitar(y, 3, 97);
  return { lat: redondear5(centro.lat - ((py - 50) / 100) * ALTO_GRADOS), lon: redondear5(centro.lon + ((px - 50) / 100) * ANCHO_GRADOS) };
}

export function MapaChincheta({
  centro,
  punto,
  editable,
  onMover,
  descripcion,
}: {
  /** Centro del plano: el punto geocodificado (no cambia al arrastrar, para que el plano no salte). */
  centro: Coordenadas;
  punto: Coordenadas;
  editable: boolean;
  /** Se llama al soltar la chincheta o con cada flecha. */
  onMover?: (c: Coordenadas) => void;
  descripcion?: string;
}) {
  const plano = useRef<HTMLDivElement>(null);
  const [arrastre, setArrastre] = useState<{ x: number; y: number } | null>(null);
  const pos = arrastre ?? posicionEnPlano(centro, punto);
  const x = limitar(pos.x, 3, 97);
  const y = limitar(pos.y, 3, 97);

  const posicionPuntero = (e: PointerEvent) => {
    const r = plano.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return null;
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  const alBajar = (e: PointerEvent<HTMLButtonElement>) => {
    if (!editable) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* sin captura (navegador viejo o puntero ya liberado): el arrastre sigue funcionando sobre la chincheta */
    }
    setArrastre(posicionEnPlano(centro, punto));
  };
  const alMover = (e: PointerEvent<HTMLButtonElement>) => {
    if (!arrastre) return;
    const p = posicionPuntero(e);
    if (p) setArrastre(p);
  };
  const alSoltar = () => {
    if (!arrastre) return;
    const final = puntoDePosicion(centro, arrastre.x, arrastre.y);
    setArrastre(null);
    if (final.lat !== punto.lat || final.lon !== punto.lon) onMover?.(final);
  };

  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!editable) return;
    const d = { ArrowUp: [PASO_TECLADO, 0], ArrowDown: [-PASO_TECLADO, 0], ArrowLeft: [0, -PASO_TECLADO], ArrowRight: [0, PASO_TECLADO] }[e.key];
    if (!d) return;
    e.preventDefault();
    const nuevo = { lat: redondear5(punto.lat + d[0]), lon: redondear5(punto.lon + d[1]) };
    const p = posicionEnPlano(centro, nuevo);
    if (p.x < 3 || p.x > 97 || p.y < 3 || p.y > 97) return; // no salirse del plano
    onMover?.(nuevo);
  };

  return (
    <div className="mapa-chincheta">
      <div className="plano" ref={plano} data-testid="plano">
        <span className="calle horizontal" style={{ top: '38%' }} aria-hidden="true" />
        <span className="calle horizontal fina" style={{ top: '72%' }} aria-hidden="true" />
        <span className="calle vertical" style={{ left: '30%' }} aria-hidden="true" />
        <span className="calle vertical fina" style={{ left: '68%' }} aria-hidden="true" />
        {editable ? (
          <button
            type="button"
            className={`chincheta tocable${arrastre ? ' arrastrando' : ''}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            aria-label={`Chincheta del cliente en ${textoCoordenadas(punto)}. Arrástrala o usa las flechas para corregirla.`}
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={() => setArrastre(null)}
            onKeyDown={alTeclear}
          >
            <MapPin size={34} strokeWidth={2.25} aria-hidden="true" />
          </button>
        ) : (
          <span className="chincheta" style={{ left: `${x}%`, top: `${y}%` }} role="img" aria-label={`Chincheta del cliente en ${textoCoordenadas(punto)}`}>
            <MapPin size={34} strokeWidth={2.25} aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="pie-mapa">
        {descripcion && <span>{descripcion} · </span>}
        <span className="coordenadas">{textoCoordenadas(punto)}</span>
      </p>
    </div>
  );
}
