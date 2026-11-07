import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDatos } from '../../db/datos';
import { usarComo } from '../../db/repo';
import { FilasAjustesPreparacion, type AjustePreparacion } from './plantillas/FilasAjustesPreparacion';

// Ajustes (§10.10; H8 «construir con el estilo de la maqueta», docs/maqueta.md): filas blancas como la ficha de
// cliente (p. 4), etiqueta de sección en mayúsculas, segundo nivel con la barra inferior visible. Las subpantallas son
// el tercer nivel (máximo 3, §7). Categorías y el modo fiscal no están en esta versión.

export type SubAjuste = AjustePreparacion | 'avisos' | 'instalacion' | 'exportar';

/** Subpantallas válidas: App las usa para validar el enlace profundo `?ir=ajustes&a=…`. */
export const SUB_AJUSTES: readonly SubAjuste[] = ['material', 'ropa', 'proveedores', 'avisos', 'instalacion', 'exportar'];

const FILAS_AVISOS: { id: SubAjuste; nombre: string; detalle: string }[] = [
  { id: 'avisos', nombre: 'Avisos y horarios', detalle: 'Resumen diario, silencio y recordatorios' },
  { id: 'instalacion', nombre: 'Instalación y avisos', detalle: 'Permiso, prueba y guía de instalación' },
];

function Filas({ filas, onAbrir }: { filas: { id: SubAjuste; nombre: string; detalle: string }[]; onAbrir: (a: SubAjuste) => void }) {
  return (
    <div className="filas" style={{ marginTop: 0 }}>
      {filas.map((f) => (
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
  );
}

export function Ajustes({ etiquetaVolver, onVolver, onAbrir }: { etiquetaVolver: string; onVolver: () => void; onAbrir: (a: SubAjuste) => void }) {
  const datos = useDatos();
  return (
    <main className="pantalla" aria-labelledby="titulo-ajustes">
      <button type="button" className="volver tocable" onClick={onVolver}>
        <ChevronLeft size={20} aria-hidden="true" />
        {etiquetaVolver}
      </button>
      <h1 className="titulo-pantalla" id="titulo-ajustes">
        Ajustes
      </h1>

      <h2 className="etiqueta-seccion">Avisos</h2>
      <Filas filas={FILAS_AVISOS} onAbrir={onAbrir} />

      <FilasAjustesPreparacion onAbrir={onAbrir} />

      <h2 className="etiqueta-seccion">Tus datos</h2>
      <Filas filas={[{ id: 'exportar', nombre: 'Exportar datos', detalle: 'Excel o CSV de movimientos, clientes y más' }]} onAbrir={onAbrir} />

      <h2 className="etiqueta-seccion">Quién usa este móvil</h2>
      <div className="filas" style={{ marginTop: 0 }}>
        <div className="fila">
          <span className="nombre" id="etq-usuario">
            Usuario
          </span>
          <div className="chips" role="radiogroup" aria-labelledby="etq-usuario">
            {(datos?.usuarios ?? []).map((u) => (
              <button key={u.id} type="button" role="radio" aria-checked={datos?.usuario?.id === u.id} className="chip tocable" onClick={() => usarComo(u.rol)}>
                {u.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="secundario" style={{ margin: '8px 4px 0' }}>
        Pablo ve todo y solo puede registrar aportes y préstamos.
      </p>

      <h2 className="etiqueta-seccion">Privacidad</h2>
      <p className="secundario" style={{ margin: '0 4px' }}>
        Los nombres, teléfonos y direcciones de tus clientes son datos personales: úsalos solo para tu trabajo. Por ahora todo se
        guarda en este móvil.
      </p>
    </main>
  );
}
