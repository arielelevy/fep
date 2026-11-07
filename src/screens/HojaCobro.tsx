import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useDeshacer } from '../components/Deshacer';
import { useDatos } from '../db/datos';
import { anotarTrabajo } from '../db/repo';
import { MEDIOS_PAGO, TIPOS_TRABAJO, type MedioPago } from '../domain/tipos';
import { centimosATexto, formatearEuros, formatearMientrasEscribe, parsearImporte } from '../lib/dinero';
import { useCerrojo } from '../lib/hooks';
import { HojaAbono } from './HojaHecho';

// Hoja "Hecho" / "¿Cobraste a [cliente]?" (§10.1.4; decisión H5: construir con el estilo de la maqueta).
// Hoja inferior como los diálogos de la app: botón principal lima "Sí, [importe]", chips de medio de pago
// (último usado), "Cobré otra cantidad" y "No, me paga después". Mientras no hay agenda, se abre desde la
// ficha del cliente ("Trabajo hecho") con concepto y precio editables; la agenda la abrirá desde cada visita.
export function HojaCobro({ clienteId, onCerrar }: { clienteId: string; onCerrar: () => void }) {
  const datos = useDatos();
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  const cliente = datos?.clientes.find((c) => c.id === clienteId);
  const conceptoInicial = cliente?.tipos_trabajo_habituales.map((t) => TIPOS_TRABAJO.find((x) => x.id === t)?.nombre).filter(Boolean).join(' y ') || 'Trabajo';
  const [concepto, setConcepto] = useState(conceptoInicial);
  const [textoPrecio, setTextoPrecio] = useState(cliente?.precio_habitual ? centimosATexto(cliente.precio_habitual) : '');
  const [medio, setMedio] = useState<MedioPago>(datos?.ultimoMedio ?? 'efectivo');
  // Si la hoja se monta antes de que carguen los datos, toma el último medio al llegar (si no se tocó).
  const [medioTocado, setMedioTocado] = useState(false);
  const ultimo = datos?.ultimoMedio;
  useEffect(() => {
    if (!medioTocado && ultimo) setMedio(ultimo);
  }, [ultimo, medioTocado]);
  const [otra, setOtra] = useState(false);
  const [textoOtra, setTextoOtra] = useState('');
  const [error, setError] = useState('');
  const precio = parsearImporte(textoPrecio);
  const otraCantidad = parsearImporte(textoOtra);
  // Cliente de abono (§10.1.4, hallazgo 3 del revisor de la ola 4): primero «¿Te pagó el abono de [mes]?»;
  // «Es un trabajo aparte» vuelve a esta hoja para un trabajo fuera del abono.
  const [aparte, setAparte] = useState(false);

  if (!cliente) return null;
  if (cliente.modalidad === 'abono' && !aparte) return <HojaAbono clienteId={clienteId} onCerrar={onCerrar} onTrabajoAparte={() => setAparte(true)} />;

  const guardar = async (cobrado: number) => {
    if (!precio || !cerrojo.tomar()) return;
    try {
      const r = await anotarTrabajo({ cliente_id: clienteId, concepto, precio, cobrado, medio_pago: medio });
      onCerrar();
      mostrar(cobrado >= precio ? 'Trabajo cobrado' : cobrado > 0 ? 'Cobro parcial anotado' : 'Queda pendiente de cobro', r.deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError('No se pudo guardar. Lo que has escrito sigue aquí; vuelve a intentarlo.');
    }
  };

  const campoImporte = (id: string, etiqueta: string, valor: string, set: (v: string) => void, foco = false) => (
    <label className="fila" htmlFor={id} style={{ background: 'var(--fondo)', borderRadius: 14 }}>
      <span className="nombre">{etiqueta}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={foco}
        placeholder="0 €"
        value={valor}
        onChange={(e) => {
          const n = formatearMientrasEscribe(e.target.value, valor);
          if (n !== null) set(n);
        }}
        style={{ fontWeight: 700 }}
      />
    </label>
  );

  return (
    <div className="dialogo-capa" onClick={onCerrar}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="titulo-cobro" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 id="titulo-cobro" style={{ flex: 1 }}>¿Cobraste a {cliente.nombre}?</h2>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={onCerrar}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="acciones">
          <label className="fila" style={{ background: 'var(--fondo)', borderRadius: 14 }}>
            <span className="nombre">Trabajo</span>
            <input type="text" value={concepto} maxLength={80} onChange={(e) => setConcepto(e.target.value)} />
          </label>
          {campoImporte('precio-trabajo', 'Precio', textoPrecio, setTextoPrecio, !textoPrecio)}
          <div className="chips" role="radiogroup" aria-label="Pago" style={{ marginLeft: 0 }}>
            {MEDIOS_PAGO.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={medio === m.id} className="chip tocable" onClick={() => {
                setMedio(m.id);
                setMedioTocado(true);
              }}>
                {m.nombre}
              </button>
            ))}
          </div>
          {!otra ? (
            <>
              <button type="button" className="boton-principal tocable" disabled={!precio || cerrojo.ocupado} onClick={() => precio && guardar(precio)}>
                {precio ? `Sí, ${formatearEuros(precio)}` : 'Sí'}
              </button>
              <button type="button" className="boton-secundario tocable" disabled={!precio} onClick={() => setOtra(true)}>
                Cobré otra cantidad
              </button>
              <button type="button" className="boton-texto tocable" disabled={!precio || cerrojo.ocupado} onClick={() => guardar(0)}>
                No, me paga después
              </button>
            </>
          ) : (
            <>
              {campoImporte('otra-cantidad', 'Cobré', textoOtra, setTextoOtra, true)}
              {precio && otraCantidad !== null && otraCantidad < precio && (
                <p style={{ margin: 0 }}>Quedan {formatearEuros(precio - otraCantidad)} pendientes.</p>
              )}
              <button
                type="button"
                className="boton-principal tocable"
                disabled={!precio || otraCantidad === null || otraCantidad <= 0 || cerrojo.ocupado}
                onClick={() => otraCantidad && guardar(otraCantidad)}
              >
                Guardar cobro
              </button>
            </>
          )}
        </div>
        {error && <p className="aviso-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
