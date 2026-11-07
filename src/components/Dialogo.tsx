import { useEffect, useId, useRef } from 'react';

// Diálogo de confirmación en hoja inferior ("¿Descartar este gasto?", "¿Seguro que son …?").
// Construido con el estilo de la maqueta (hoja, botón lima principal, botón contorneado secundario).
export function Dialogo({
  titulo,
  texto,
  principal,
  secundario,
  onPrincipal,
  onSecundario,
}: {
  titulo: string;
  texto?: string;
  principal: string;
  secundario: string;
  onPrincipal: () => void;
  onSecundario: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="dialogo-capa" onClick={onSecundario}>
      <div
        className="dialogo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onSecundario()}
      >
        <h2 id={`${id}-t`}>{titulo}</h2>
        {texto && <p>{texto}</p>}
        <div className="acciones">
          <button ref={ref} type="button" className="boton-principal tocable" onClick={onPrincipal}>
            {principal}
          </button>
          <button type="button" className="boton-secundario tocable" onClick={onSecundario}>
            {secundario}
          </button>
        </div>
      </div>
    </div>
  );
}
