import { ChevronLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useDeshacer } from '../../../components/Deshacer';
import { useDatos } from '../../../db/datos';
import { useCerrojo } from '../../../lib/hooks';
import './ajustes-preparacion.css';

// Piezas comunes de las subpantallas de Ajustes de este encargo (plantillas y proveedores): cabecera con «‹ Ajustes»,
// título y subtítulo, y una forma única de guardar con «Deshacer» de 8 segundos y errores sin regañar.

export function PantallaAjuste({
  id,
  titulo,
  subtitulo,
  etiquetaVolver,
  onVolver,
  children,
}: {
  id: string;
  titulo: string;
  subtitulo: string;
  etiquetaVolver: string;
  onVolver: () => void;
  children: ReactNode;
}) {
  return (
    <main className="pantalla ajustes-prep" aria-labelledby={`titulo-${id}`} data-pantalla={id}>
      <button type="button" className="volver tocable" onClick={onVolver}>
        <ChevronLeft size={20} aria-hidden="true" />
        {etiquetaVolver}
      </button>
      <h1 className="titulo-pantalla" id={`titulo-${id}`}>
        {titulo}
      </h1>
      <p className="subtitulo">{subtitulo}</p>
      {children}
    </main>
  );
}

/** Mensaje que se enseña tal cual (validaciones propias); cualquier otro error, uno genérico. */
export function mensajeError(e: unknown): string {
  if (e instanceof Error && (e.name === 'SinPermiso' || /^(Falta|Escribe|Como mucho|Ya |Teléfono|Importe|Entre|Deja|Tipo)/.test(e.message))) return e.message;
  return 'No se pudo guardar. Vuelve a intentarlo.';
}

/** Ejecuta un cambio, muestra «texto · Deshacer» y guarda el error para enseñarlo junto al formulario. */
export function useGuardar() {
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  const [error, setError] = useState('');
  const guardar = async (f: () => Promise<{ deshacer: () => Promise<void> }>, texto: string): Promise<boolean> => {
    if (!cerrojo.tomar()) return false;
    setError('');
    try {
      const r = await f();
      mostrar(texto, r.deshacer);
      return true;
    } catch (e) {
      console.error(e);
      setError(mensajeError(e));
      return false;
    } finally {
      cerrojo.soltar();
    }
  };
  return { guardar, error, setError, ocupado: cerrojo.ocupado };
}

/** Solo el titular cambia los ajustes de preparación (§3). Pablo los ve. */
export function usePuedeEditar(): boolean {
  const datos = useDatos();
  return Boolean(datos && !datos.esColaborador);
}

export function AvisoError({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p className="aviso-error" role="alert">
      {error}
    </p>
  );
}
