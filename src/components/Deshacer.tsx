import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// Barra "Gasto guardado · Deshacer" (§5.4.1, mockup p. 3, componente C23). Dura 8 segundos.
export const DURACION_DESHACER_MS = 8000;

interface Aviso {
  id: number;
  mensaje: string;
  deshacer?: () => Promise<void>;
}

interface Ctx {
  mostrar: (mensaje: string, deshacer?: () => Promise<void>) => void;
}

const DeshacerCtx = createContext<Ctx>({ mostrar: () => {} });

export const useDeshacer = () => useContext(DeshacerCtx);

export function DeshacerProvider({ children, sinBarraInferior }: { children: ReactNode; sinBarraInferior?: boolean }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const contador = useRef(0);

  const mostrar = useCallback((mensaje: string, deshacer?: () => Promise<void>) => {
    contador.current += 1;
    setAviso({ id: contador.current, mensaje, deshacer });
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso((a) => (a?.id === aviso.id ? null : a)), DURACION_DESHACER_MS);
    return () => clearTimeout(t);
  }, [aviso]);

  const pulsarDeshacer = async () => {
    const a = aviso;
    setAviso(null);
    if (a?.deshacer) {
      try {
        await a.deshacer();
      } catch (e) {
        console.error(e);
        mostrar('No se pudo deshacer. Inténtalo de nuevo.');
      }
    }
  };

  return (
    <DeshacerCtx.Provider value={{ mostrar }}>
      {children}
      {aviso && (
        <div className={`barra-deshacer${sinBarraInferior ? ' sin-barra-inferior' : ''}`} role="status" aria-live="polite">
          <span className="mensaje">{aviso.mensaje}</span>
          {aviso.deshacer && (
            <button type="button" className="tocable" onClick={pulsarDeshacer}>
              Deshacer
            </button>
          )}
        </div>
      )}
    </DeshacerCtx.Provider>
  );
}
