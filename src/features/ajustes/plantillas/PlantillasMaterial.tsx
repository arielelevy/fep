import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { TIPOS_TRABAJO, type TipoTrabajo } from '../../../domain/tipos';
import { useLive } from '../../../lib/hooks';
import { AvisoError, PantallaAjuste, useGuardar, usePuedeEditar } from './comun';
import { anadirArticuloPlantilla, leerMaterial, quitarArticuloPlantilla, restaurarMaterial } from './datos';

// Ajustes › Plantillas de material por tipo de trabajo (§10.10.3, §8.12). No está en la maqueta: estilo de la maqueta
// (decisión H8). Cada tipo de trabajo se abre en su sitio (sin otro nivel de navegación, §7) y muestra sus artículos con
// «Quitar» y un campo para añadir. Lo que se guarda aquí es lo que Preparar trabajo une en el bloque Material (§10.8.2).

const articulos = (n: number) => (n === 0 ? 'Sin plantilla' : n === 1 ? '1 artículo' : `${n} artículos`);

export function PlantillasMaterial({ etiquetaVolver, onVolver }: { etiquetaVolver: string; onVolver: () => void }) {
  const material = useLive(leerMaterial);
  const puede = usePuedeEditar();
  const [abierto, setAbierto] = useState<TipoTrabajo | null>('setos_poda');
  const { guardar, error, ocupado } = useGuardar();

  return (
    <PantallaAjuste
      id="plantillas-material"
      titulo="Plantillas de material"
      subtitulo="Lo que te pido revisar antes de cada trabajo, según el tipo."
      etiquetaVolver={etiquetaVolver}
      onVolver={onVolver}
    >
      {material &&
        TIPOS_TRABAJO.map((t) => (
          <GrupoTipo
            key={t.id}
            tipo={t.id}
            nombre={t.nombre}
            lista={material[t.id] ?? []}
            abierto={abierto === t.id}
            onAlternar={() => setAbierto((a) => (a === t.id ? null : t.id))}
            puede={puede}
          />
        ))}
      <div className="pie-ajustes">
        {puede ? (
          <button
            type="button"
            className="boton-texto tocable"
            disabled={ocupado}
            onClick={() => guardar(restaurarMaterial, 'Plantillas como al principio')}
          >
            Volver a las plantillas de siempre
          </button>
        ) : (
          <p className="secundario">Felipe cambia las plantillas; aquí las ves.</p>
        )}
        <AvisoError error={error} />
      </div>
    </PantallaAjuste>
  );
}

function GrupoTipo({
  tipo,
  nombre,
  lista,
  abierto,
  onAlternar,
  puede,
}: {
  tipo: TipoTrabajo;
  nombre: string;
  lista: string[];
  abierto: boolean;
  onAlternar: () => void;
  puede: boolean;
}) {
  const id = useId();
  const [nuevo, setNuevo] = useState('');
  const { guardar, error, ocupado } = useGuardar();

  const anadir = async () => {
    const ok = await guardar(async () => {
      const r = await anadirArticuloPlantilla(tipo, nuevo);
      return r;
    }, `Añadido a ${nombre}`);
    if (ok) setNuevo('');
  };

  return (
    <section className="grupo" data-tipo={tipo}>
      <h2 style={{ margin: 0 }}>
        <button type="button" className="cabecera-grupo tocable" aria-expanded={abierto} aria-controls={`${id}-cuerpo`} onClick={onAlternar}>
          <span className="textos">
            <span className="nombre">{nombre}</span>
            <span className="detalle">{articulos(lista.length)}</span>
          </span>
          {abierto ? <ChevronDown size={20} aria-hidden="true" /> : <ChevronRight size={20} aria-hidden="true" />}
        </button>
      </h2>
      {abierto && (
        <div className="cuerpo-grupo" id={`${id}-cuerpo`}>
          {lista.length === 0 ? (
            <p className="vacio-plantilla">Sin artículos. En este trabajo no te pediré revisar material.</p>
          ) : (
            <ul className="lista-plantilla" aria-label={`Material de ${nombre}`}>
              {lista.map((a) => (
                <li key={a}>
                  <span className="texto">{a}</span>
                  {puede && (
                    <button
                      type="button"
                      className="boton-icono tocable"
                      aria-label={`Quitar ${a} de ${nombre}`}
                      disabled={ocupado}
                      onClick={() => guardar(() => quitarArticuloPlantilla(tipo, a), `${a} quitado`)}
                    >
                      <X size={20} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {puede && (
            <form
              className="anadir-plantilla"
              onSubmit={(e) => {
                e.preventDefault();
                anadir();
              }}
            >
              <input
                aria-label={`Nuevo artículo para ${nombre}`}
                placeholder="Ej. Sacos de restos"
                value={nuevo}
                maxLength={60}
                onChange={(e) => setNuevo(e.target.value)}
              />
              <button type="submit" className="boton-secundario tocable" disabled={ocupado || !nuevo.trim()}>
                <Plus size={18} aria-hidden="true" />
                Añadir
              </button>
            </form>
          )}
          <AvisoError error={error} />
        </div>
      )}
    </section>
  );
}
