import { Pencil, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useLive } from '../../../lib/hooks';
import type { PrendaPlantilla } from '../../preparar/modelo';
import { AvisoError, PantallaAjuste, useGuardar, usePuedeEditar } from './comun';
import { anadirPrenda, editarPrenda, leerRopa, pluralizar, quitarPrenda, restaurarRopa, textoCuenta, type DatosPrenda } from './datos';

// Ajustes › Plantilla de ropa (§10.10.4, §8.12). No está en la maqueta: estilo de la maqueta (decisión H8).
// Lista de prendas con cómo se cuentan («Por persona», «Por persona, en pares», «Una para todo el equipo»), editar,
// quitar y «Añadir prenda» en una hoja inferior. Preparar trabajo multiplica por las personas del día (§10.8.3).

export function PlantillaRopa({ etiquetaVolver, onVolver }: { etiquetaVolver: string; onVolver: () => void }) {
  const ropa = useLive(leerRopa);
  const puede = usePuedeEditar();
  const [hoja, setHoja] = useState<null | { prenda?: PrendaPlantilla }>(null);
  const { guardar, error, ocupado } = useGuardar();

  return (
    <PantallaAjuste
      id="plantilla-ropa"
      titulo="Plantilla de ropa"
      subtitulo="Lo que lleva cada persona. Las cantidades se ajustan solas a la gente del trabajo."
      etiquetaVolver={etiquetaVolver}
      onVolver={onVolver}
    >
      {ropa && (
        <section className="grupo">
          <ul className="lista-plantilla cuerpo-grupo" style={{ borderTop: 0, paddingTop: 4 }} aria-label="Prendas">
            {ropa.map((p) => (
              <li key={p.clave} data-prenda={p.clave}>
                <span className="texto">
                  <span>{p.singular}</span>
                  <span className="detalle">{textoCuenta(p)}</span>
                </span>
                {puede && (
                  <>
                    <button type="button" className="boton-icono tocable" aria-label={`Cambiar ${p.singular}`} onClick={() => setHoja({ prenda: p })}>
                      <Pencil size={18} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="boton-icono tocable"
                      aria-label={`Quitar ${p.singular}`}
                      disabled={ocupado || ropa.length <= 1}
                      onClick={() => guardar(() => quitarPrenda(p.clave), `${p.singular} quitado`)}
                    >
                      <X size={20} aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {puede && (
        <button type="button" className="boton-principal tocable boton-anadir" onClick={() => setHoja({})}>
          <Plus size={20} aria-hidden="true" />
          Añadir prenda
        </button>
      )}
      <div className="pie-ajustes">
        {puede ? (
          <button type="button" className="boton-texto tocable" disabled={ocupado} onClick={() => guardar(restaurarRopa, 'Ropa como al principio')}>
            Volver a la plantilla de siempre
          </button>
        ) : (
          <p className="secundario">Felipe cambia la plantilla; aquí la ves.</p>
        )}
        <AvisoError error={error} />
      </div>
      {hoja && <HojaPrenda prenda={hoja.prenda} onCerrar={() => setHoja(null)} />}
    </PantallaAjuste>
  );
}

function HojaPrenda({ prenda, onCerrar }: { prenda?: PrendaPlantilla; onCerrar: () => void }) {
  const id = useId();
  const [singular, setSingular] = useState(prenda?.singular ?? '');
  const [plural, setPlural] = useState(prenda?.plural ?? '');
  const [pluralTocado, setPluralTocado] = useState(Boolean(prenda));
  const [pares, setPares] = useState(Boolean(prenda?.unidad));
  const [porEquipo, setPorEquipo] = useState(Boolean(prenda?.porEquipo));
  const { guardar, error, ocupado } = useGuardar();
  const titulo = prenda ? `Cambiar ${prenda.singular}` : 'Añadir prenda';

  const enviar = async () => {
    const d: DatosPrenda = { singular, plural, pares, porEquipo };
    const ok = await guardar(
      () => (prenda ? editarPrenda(prenda.clave, d) : anadirPrenda(d)),
      prenda ? 'Prenda cambiada' : 'Prenda añadida',
    );
    if (ok) onCerrar();
  };

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <header className="hoja-cabecera">
          <h1 id={`${id}-t`}>{titulo}</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={onCerrar}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <form
            className="formulario-ajustes"
            id={`${id}-f`}
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <label className="campo">
              <span>Nombre</span>
              <input
                value={singular}
                maxLength={60}
                placeholder="Ej. Chaleco reflectante"
                onChange={(e) => {
                  setSingular(e.target.value);
                  if (!pluralTocado) setPlural(pluralizar(e.target.value));
                }}
              />
            </label>
            <label className="campo">
              <span>Cuando son varias</span>
              <input
                value={plural}
                maxLength={60}
                onChange={(e) => {
                  setPlural(e.target.value);
                  setPluralTocado(true);
                }}
              />
            </label>
            <label className="casilla-fila">
              <input type="checkbox" checked={porEquipo} onChange={(e) => setPorEquipo(e.target.checked)} />
              Una para todo el equipo
            </label>
            <label className="casilla-fila">
              <input type="checkbox" checked={pares && !porEquipo} disabled={porEquipo} onChange={(e) => setPares(e.target.checked)} />
              Se cuenta por pares
            </label>
            <p className="ayuda">{porEquipo ? 'No se multiplica por las personas.' : pares ? 'Ej. «Guantes (3 pares)».' : 'Una por persona.'}</p>
          </form>
          <AvisoError error={error} />
        </div>
        <footer className="hoja-pie">
          <button type="submit" form={`${id}-f`} className="boton-principal tocable" disabled={ocupado || !singular.trim()}>
            Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}
