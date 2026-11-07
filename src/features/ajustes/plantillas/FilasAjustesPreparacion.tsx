import { ChevronRight } from 'lucide-react';

// Filas de la pantalla Ajustes (§10.10) que abren las subpantallas de este encargo: 3. Plantillas de material,
// 4. Plantilla de ropa y 6. Proveedores de alquiler (con la antelación del aviso de furgoneta). Ajustes es segundo
// nivel y estas subpantallas el tercero (máximo 3 niveles, §7).

export type AjustePreparacion = 'material' | 'ropa' | 'proveedores';

const FILAS: { id: AjustePreparacion; nombre: string; detalle: string }[] = [
  { id: 'material', nombre: 'Plantillas de material', detalle: 'Por tipo de trabajo' },
  { id: 'ropa', nombre: 'Plantilla de ropa', detalle: 'Lo que lleva cada persona' },
  { id: 'proveedores', nombre: 'Proveedores de alquiler', detalle: 'Furgoneta: precio, fianza y aviso' },
];

export function FilasAjustesPreparacion({ onAbrir }: { onAbrir: (a: AjustePreparacion) => void }) {
  return (
    <>
      <h2 className="etiqueta-seccion">Preparar trabajo</h2>
      <div className="filas" style={{ marginTop: 0 }}>
        {FILAS.map((f) => (
          <button key={f.id} type="button" className="fila tocable" onClick={() => onAbrir(f.id)} aria-label={f.nombre}>
            <span className="nombre" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              {f.nombre}
              <span className="secundario" style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                {f.detalle}
              </span>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        ))}
      </div>
    </>
  );
}
