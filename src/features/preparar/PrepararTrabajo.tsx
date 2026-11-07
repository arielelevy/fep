import { ChevronLeft } from 'lucide-react';
import { BandaSinConexion } from '../../screens/Hoy';
import { claveDia } from '../../lib/fechas';
import { useEnLinea } from '../../lib/hooks';
import { BloqueFurgoneta } from './BloqueFurgoneta';
import { BloqueMaterial } from './BloqueMaterial';
import { BloqueRopa } from './BloqueRopa';
import { antelacion, textoPersonas, textoProgreso, textoTrabajos, tituloDia } from './logica';
import { usePreparacion } from './usePreparacion';
import '../../styles/clientes.css';
import './preparar.css';

// Pantalla Preparar trabajo (§10.8; maqueta «7. Preparar trabajo»). Un día de trabajo, no una visita (§8.11):
//   1. «‹ Alertas» (o la pantalla de origen).
//   2. «PREPARAR · EN 3 DÍAS» (verde), «Miércoles 14 · Urb. El Olivar» (o «· 2 trabajos»), «Desbroce y poda · 08:30 ·
//      Tú y 2 ayudantes»; con varias visitas se listan debajo.
//   3. Progreso «1 de 3 listo» con barra y leyenda; solo cuentan los bloques que aplican.
//   4. Bloques Furgoneta (si alguna visita la necesita), Material y Ropa.
// Funciona sin conexión: todo se guarda en el móvil (banda «Sin conexión» como en el resto de pantallas).

export function PrepararTrabajo({
  fecha,
  etiquetaVolver,
  onVolver,
  onAbrirVisita,
}: {
  fecha: string;
  etiquetaVolver: string;
  onVolver: () => void;
  onAbrirVisita: (visitaId: string) => void;
}) {
  const p = usePreparacion(fecha);
  const enLinea = useEnLinea();
  const hoy = claveDia(new Date());

  if (!p) {
    return (
      <main className="pantalla preparar" aria-busy="true" aria-label="Preparar trabajo">
        <div className="esqueleto-preparar" />
      </main>
    );
  }

  const { visitas, datos } = p;
  const clientes = datos.clientes;
  const listos = p.bloques.filter((b) => b.listo).length;
  const primera = visitas[0];

  return (
    <main className="pantalla preparar" aria-labelledby="titulo-preparar">
      <button type="button" className="volver tocable" onClick={onVolver}>
        <ChevronLeft size={20} aria-hidden="true" />
        {etiquetaVolver}
      </button>
      {!enLinea && <BandaSinConexion />}

      <p className="etiqueta-preparar">PREPARAR · {antelacion(fecha, hoy)}</p>
      <h1 className="titulo-preparar" id="titulo-preparar">
        {tituloDia(fecha, visitas, clientes)}
      </h1>

      {visitas.length === 0 ? (
        <div className="tarjeta tarjeta-vacia" style={{ marginTop: 12 }}>
          <p className="titulo">Este día no tienes visitas.</p>
        </div>
      ) : (
        <>
          <p className="detalle-preparar">
            {[textoTrabajos(visitas), primera?.hora_inicio ?? '09:00', textoPersonas(p.personas)].filter(Boolean).join(' · ')}
          </p>
          {visitas.length > 1 && (
            <ul className="visitas-preparar">
              {visitas.map((v) => (
                <li key={v.id}>
                  <button type="button" className="fila-visita tocable" onClick={() => onAbrirVisita(v.id)}>
                    <span className="hora">{v.hora_inicio ?? '09:00'}</span>
                    <span>{clientes.find((c) => c.id === v.cliente_id)?.nombre ?? 'Cliente'}</span>
                    <span className="trabajos">{textoTrabajos([v])}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {p.bloques.length > 0 && (
            <section className="tarjeta progreso-preparar" aria-label="Progreso">
              <p className="texto-progreso">{textoProgreso(p.bloques)}</p>
              <div
                className="barra-progreso"
                role="progressbar"
                aria-label="Bloques listos"
                aria-valuemin={0}
                aria-valuemax={p.bloques.length}
                aria-valuenow={listos}
                aria-valuetext={textoProgreso(p.bloques)}
              >
                <span style={{ width: `${(listos / p.bloques.length) * 100}%` }} />
              </div>
              <ul className="leyenda-bloques">
                {p.bloques.map((b) => (
                  <li key={b.id} data-listo={b.listo}>
                    <span className="punto" aria-hidden="true" />
                    {b.nombre}: {b.listo ? 'listo' : 'pendiente'}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <BloqueFurgoneta
            fecha={fecha}
            visitas={visitas}
            reserva={p.reserva}
            proveedores={p.plantillas.proveedores}
            ultimoMedio={datos.ultimoMedio}
            puede={p.puede}
          />
          <BloqueMaterial
            fecha={fecha}
            visitas={visitas}
            items={p.material}
            recordatorio={p.preparacion?.recordatorio_compra ?? null}
            categorias={datos.categorias}
            ultimoMedio={datos.ultimoMedio}
            puede={p.puede}
          />
          <BloqueRopa fecha={fecha} personas={p.personas} prendas={p.ropa} puede={p.puede} />
          {!p.puede && <p className="secundario" style={{ margin: '12px 4px 0' }}>Felipe prepara el trabajo; aquí lo ves tal como va.</p>}
        </>
      )}
    </main>
  );
}
