import { ChevronLeft } from 'lucide-react';
import { useDatos } from '../db/datos';
import { calcularPendientes, diasEntre, nivelAntiguedad, textoAntiguedad, totalPendiente } from '../domain/pendientes';
import { formatearEuros } from '../lib/dinero';
import { claveDia } from '../lib/fechas';
import { useEnLinea } from '../lib/hooks';
import { BandaSinConexion } from './Hoy';

// Lista de pendientes "Te deben" (§9.3, §9.4, §10.1.1.2: la celda Te deben de Hoy lleva aquí).
// Sin maqueta propia: filas como las de Movimientos (PDF p. 3) y botón "Ya pagó" como la tarjeta de deuda
// de la ficha de cliente (PDF p. 4). Antigüedad: neutro hasta 6 días, ámbar de 7 a 14, rojo desde 15,
// siempre con el texto "hace N días" (nunca solo color).
export function TeDeben({ onVolver, etiquetaVolver, onYaPago }: { onVolver: () => void; etiquetaVolver: string; onYaPago: (clienteId: string) => void }) {
  const datos = useDatos();
  const enLinea = useEnLinea();
  const hoy = claveDia(new Date());
  const pendientes = datos ? calcularPendientes(datos.clientes, datos.deudas, datos.movimientos) : [];
  const nombre = (id: string) => datos?.clientes.find((c) => c.id === id)?.nombre ?? 'Cliente';

  return (
    <main className="pantalla" aria-labelledby="titulo-te-deben">
      <button type="button" className="volver tocable" onClick={onVolver}>
        <ChevronLeft size={20} aria-hidden="true" />
        {etiquetaVolver}
      </button>
      <h1 className="titulo-pantalla" id="titulo-te-deben">Te deben</h1>
      {datos && pendientes.length > 0 && <p className="secundario" style={{ margin: '2px 0 0' }}>{formatearEuros(totalPendiente(pendientes))} en total</p>}
      {!enLinea && <div style={{ marginTop: 12 }}><BandaSinConexion /></div>}
      {!datos ? (
        <div className="esqueleto" style={{ height: 140, marginTop: 16 }} aria-busy="true" aria-label="Cargando" />
      ) : pendientes.length === 0 ? (
        <div className="tarjeta tarjeta-vacia" style={{ marginTop: 16 }}>
          <p className="titulo">Todo cobrado</p>
          <p className="secundario" style={{ margin: 0 }}>Aquí verás lo que te deben tus clientes.</p>
        </div>
      ) : (
        <ul className="grupo-dia" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
          {pendientes.map((p) => {
            const dias = diasEntre(p.desde, hoy);
            const nivel = nivelAntiguedad(dias);
            return (
              <li key={`${p.cliente_id}-${p.clave}`} className="fila-pendiente">
                <span className="textos">
                  <span className="mov-titulo">{nombre(p.cliente_id)}</span>
                  <span className="mov-sub">{p.concepto}</span>
                  <span className={`chip-estado ${nivel === 'neutro' ? 'neutro' : nivel}`}>{textoAntiguedad(dias)}</span>
                </span>
                <span className="mov-importe">{formatearEuros(p.pendiente)}</span>
                {!datos.esColaborador && (
                  <button
                    type="button"
                    className={`boton-ya-pago tocable${nivel === 'rojo' ? ' rojo' : ''}`}
                    aria-label={`Ya pagó: ${nombre(p.cliente_id)}, ${formatearEuros(p.pendiente)}`}
                    onClick={() => onYaPago(p.cliente_id)}
                  >
                    Ya pagó
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
