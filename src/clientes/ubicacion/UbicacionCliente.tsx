import { useEffect, useId, useRef, useState } from 'react';
import { MapPin, Search, WifiOff } from 'lucide-react';
import { useDeshacer } from '../../components/Deshacer';
import { editarCliente } from '../../db/repo';
import type { Cliente } from '../../domain/tipos';
import { useEnLinea } from '../../lib/hooks';
import {
  claveDireccion,
  geocodificar,
  TEXTOS_GEOCODIFICACION,
  type Coordenadas,
  type EstadoGeocodificacion,
} from '../../geocodificacion';
import { MapaChincheta } from './MapaChincheta';
import './ubicacion.css';

// Ubicación del cliente (ola 6, frente B).
// - Formulario Nuevo / Editar cliente (§10.4.3 «Ubicación»): al escribir la dirección se geocodifica y se muestra
//   un mapa pequeño con chincheta arrastrable. Texto: «Se usa para el tiempo de cada visita.»
// - Ficha de cliente: el mismo mapa; la chincheta se corrige y se guarda al soltarla (con «Deshacer», §5.4.1).
// Sin conexión no se bloquea nada (§14.1): el cliente se guarda sin coordenadas y la ubicación se busca después.

export const TEXTO_USO = 'Se usa para el tiempo de cada visita.';
export const TEXTO_AYUDA_CHINCHETA = 'Si no está en su sitio, arrastra la chincheta.';
const DESCRIPCION_SIMULADA = 'Ubicación aproximada';

type Estado = EstadoGeocodificacion | 'buscando';

function EstadoSinMapa({ estado }: { estado: Exclude<Estado, 'encontrada'> }) {
  const texto = estado === 'buscando' ? 'Buscando la dirección…' : TEXTOS_GEOCODIFICACION[estado];
  const Icono = estado === 'sin_conexion' ? WifiOff : estado === 'buscando' ? Search : MapPin;
  return (
    <div className="estado-ubicacion" aria-live="polite" data-estado={estado}>
      <Icono size={20} aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

/**
 * Sección «Ubicación» del formulario. `inicial` son las coordenadas guardadas (si las hay): mientras la dirección
 * no cambie se conservan y no se vuelve a geocodificar (§13.3). `onCambio(null)` = sin coordenadas.
 */
export function UbicacionFormulario({
  direccion,
  municipio,
  inicial,
  onCambio,
  retardoMs = 600,
}: {
  direccion: string;
  municipio: string;
  inicial: Coordenadas | null;
  onCambio: (c: Coordenadas | null) => void;
  retardoMs?: number;
}) {
  const enLinea = useEnLinea();
  const clave = claveDireccion(direccion, municipio);
  const vacia = !direccion.trim() && !municipio.trim();
  const [estado, setEstado] = useState<Estado>(inicial ? 'encontrada' : vacia ? 'sin_direccion' : 'buscando');
  const [centro, setCentro] = useState<Coordenadas | null>(inicial);
  const [punto, setPunto] = useState<Coordenadas | null>(inicial);
  /** Clave de la dirección a la que corresponden las coordenadas actuales (o la que se intentó). */
  const resuelta = useRef<string | null>(inicial ? clave : null);
  const aviso = useRef(onCambio);
  aviso.current = onCambio;

  useEffect(() => {
    if (resuelta.current === clave && estado !== 'sin_conexion' && estado !== 'error') return;
    if (vacia) {
      resuelta.current = clave;
      setEstado('sin_direccion');
      setCentro(null);
      setPunto(null);
      aviso.current(null);
      return;
    }
    // La dirección cambió: las coordenadas viejas dejan de valer hasta encontrar las nuevas.
    if (resuelta.current !== clave) {
      setPunto(null);
      aviso.current(null);
    }
    setEstado('buscando');
    const control = new AbortController();
    const t = setTimeout(() => {
      geocodificar(direccion, municipio, { senal: control.signal, enLinea: () => enLinea })
        .then((r) => {
          if (control.signal.aborted) return;
          resuelta.current = clave;
          setEstado(r.estado);
          if (r.resultado) {
            const c = { lat: r.resultado.lat, lon: r.resultado.lon };
            setCentro(c);
            setPunto(c);
            aviso.current(c);
          }
        })
        .catch(() => {
          /* cancelada por un cambio posterior */
        });
    }, retardoMs);
    return () => {
      clearTimeout(t);
      control.abort();
    };
    // `estado` sólo decide si reintentar: no debe relanzar la búsqueda en cada cambio de estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, enLinea, retardoMs]);

  const mover = (c: Coordenadas) => {
    setPunto(c);
    aviso.current(c);
  };

  return (
    <div className="ubicacion-cliente" data-testid="ubicacion-formulario">
      <p className="texto-uso">{TEXTO_USO}</p>
      {estado === 'encontrada' && centro && punto ? (
        <>
          <MapaChincheta centro={centro} punto={punto} editable onMover={mover} descripcion={DESCRIPCION_SIMULADA} />
          <p className="ayuda-mapa">{TEXTO_AYUDA_CHINCHETA}</p>
        </>
      ) : (
        <EstadoSinMapa estado={estado === 'encontrada' ? 'no_encontrada' : estado} />
      )}
    </div>
  );
}

/** Sección «Ubicación» de la ficha de cliente: mapa con chincheta corregible, o cómo conseguir la ubicación. */
export function UbicacionFicha({ cliente, soloLectura }: { cliente: Cliente; soloLectura: boolean }) {
  const id = useId();
  const enLinea = useEnLinea();
  const { mostrar } = useDeshacer();
  const tiene = cliente.lat !== null && cliente.lon !== null;
  const punto = tiene ? { lat: cliente.lat!, lon: cliente.lon! } : null;
  // Centro fijo mientras se corrige la chincheta, para que el plano no salte; se recoloca si cambia la dirección.
  const [centro, setCentro] = useState<{ clave: string; c: Coordenadas } | null>(punto ? { clave: claveDireccion(cliente.direccion, cliente.municipio), c: punto } : null);
  const claveActual = claveDireccion(cliente.direccion, cliente.municipio);
  const centroValido = centro && centro.clave === claveActual ? centro.c : punto;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState('');
  const hayDireccion = Boolean(cliente.direccion.trim() || cliente.municipio.trim());

  const guardar = async (c: Coordenadas, texto: string) => {
    try {
      const r = await editarCliente(cliente.id, { lat: c.lat, lon: c.lon });
      setError('');
      mostrar(texto, r.deshacer);
    } catch (e) {
      console.error(e);
      setError('No se pudo guardar la ubicación. Vuelve a intentarlo.');
    }
  };

  const buscar = async () => {
    setEstado('buscando');
    const r = await geocodificar(cliente.direccion, cliente.municipio, { enLinea: () => enLinea });
    setEstado(r.estado);
    if (r.resultado) {
      const c = { lat: r.resultado.lat, lon: r.resultado.lon };
      setCentro({ clave: claveActual, c });
      await guardar(c, 'Ubicación guardada');
    }
  };

  return (
    <section className="tarjeta tarjeta-ficha ubicacion-cliente" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="etiqueta-seccion">
        Ubicación
      </h2>
      <p className="texto-uso">{TEXTO_USO}</p>
      {punto && centroValido ? (
        <>
          <MapaChincheta
            centro={centroValido}
            punto={punto}
            editable={!soloLectura}
            onMover={(c) => {
              if (!centro || centro.clave !== claveActual) setCentro({ clave: claveActual, c: centroValido });
              void guardar(c, 'Ubicación corregida');
            }}
            descripcion={DESCRIPCION_SIMULADA}
          />
          {!soloLectura && <p className="ayuda-mapa">{TEXTO_AYUDA_CHINCHETA}</p>}
        </>
      ) : !hayDireccion ? (
        <>
          {/* El botón «Añadir dirección» ya está en las acciones rápidas de la ficha. */}
          <EstadoSinMapa estado="sin_direccion" />
        </>
      ) : (
        <>
          {estado && estado !== 'encontrada' ? (
            <EstadoSinMapa estado={estado} />
          ) : (
            <div className="estado-ubicacion" data-estado="sin_coordenadas">
              <MapPin size={20} aria-hidden="true" />
              <span>Aún no está en el mapa.</span>
            </div>
          )}
          {!soloLectura && estado !== 'buscando' && (
            <div className="acciones-ubicacion">
              <button type="button" className="boton-secundario tocable" onClick={() => void buscar()} disabled={!enLinea}>
                Buscar en el mapa
              </button>
              {!enLinea && <span className="ayuda-mapa">Necesita conexión.</span>}
            </div>
          )}
        </>
      )}
      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
