import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDeshacer } from '../components/Deshacer';
import { useDatos } from '../db/datos';
import { anotarTrabajo, completarVisita, crearMovimiento, type Deshacer } from '../db/repo';
import { cuotaAPreguntar, type CobroEsperado } from '../domain/abonosEsperados';
import { MEDIOS_PAGO, type MedioPago, type Visita } from '../domain/tipos';
import { textoServicio, tipoCobroVisita } from '../domain/visitasHoy';
import { formatearEuros, formatearMientrasEscribe, parsearImporte } from '../lib/dinero';
import { nombreMes } from '../lib/fechas';
import { useCerrojo } from '../lib/hooks';
import '../styles/hoy.css';

// Hoja «Hecho» de una visita (§10.1.4; decisión H5: construir con el estilo de la maqueta). Misma hoja inferior
// que HojaCobro (la de «Trabajo hecho» sin visita, que se mantiene): botón principal lima «Sí, [importe]», chips
// de medio de pago (último usado), «Cobré otra cantidad» y «No, me paga después». Tres modos:
// - 'cobro': visita puntual con precio aún programada → «¿Cobraste a [cliente]?» y la marca hecha al confirmar.
// - 'abono': visita de abono ya hecha con cuota vencida sin cobrar → «¿Te pagó el abono de [mes]?» (HojaAbono,
//   que también usa HojaCobro con clientes de abono: hallazgo 3 del revisor de la ola 4).
// - 'anadir': visita sin precio ya hecha (p. ej. presupuesto) → «Añadir cobro».
export type ModoHecho = 'cobro' | 'abono' | 'anadir';

export function modoHecho(v: Visita): ModoHecho {
  if (v.estado === 'programada' && tipoCobroVisita(v) === 'puntual') return 'cobro';
  return tipoCobroVisita(v) === 'abono' ? 'abono' : 'anadir';
}

export function HojaHecho({ visitaId, onCerrar, modo }: { visitaId: string; onCerrar: () => void; modo?: ModoHecho }) {
  const datos = useDatos();
  const visita = datos?.visitas.find((v) => v.id === visitaId);
  const cliente = datos?.clientes.find((c) => c.id === visita?.cliente_id);
  if (!datos || !visita || !cliente) return null;
  const m = modo ?? modoHecho(visita);
  if (m === 'abono') return <HojaAbono clienteId={cliente.id} onCerrar={onCerrar} />;

  const servicio = textoServicio(visita);
  if (m === 'cobro') {
    const precio = visita.precio!;
    return (
      <HojaImporte
        titulo={`¿Cobraste a ${cliente.nombre}?`}
        detalle={servicio}
        importe={precio}
        textoNo="No, me paga después"
        onCerrar={onCerrar}
        onGuardar={async (cobrado, medio) => {
          const r = await completarVisita(visita.id, cobrado > 0 ? { cobrado, medio_pago: medio } : null);
          return {
            mensaje: cobrado >= precio ? 'Visita completada' : cobrado > 0 ? 'Visita completada · Cobro parcial' : 'Visita completada · Pendiente de cobro',
            deshacer: r.deshacer,
          };
        }}
      />
    );
  }
  return (
    <HojaImporte
      titulo={`¿Añadir cobro a ${cliente.nombre}?`}
      detalle={servicio}
      importe={null}
      textoNo="Ahora no"
      onCerrar={onCerrar}
      onGuardar={async (cobrado, medio) => {
        const r = await anotarTrabajo({ cliente_id: cliente.id, concepto: servicio, precio: cobrado, cobrado, medio_pago: medio, visita_id: visita.id });
        return { mensaje: 'Cobro guardado', deshacer: r.deshacer };
      }}
    />
  );
}

/**
 * «¿Te pagó el abono de [mes]?» (§9.4, §10.1.4): la cuota vencida más antigua sin cobrar. «Sí, 90 €» crea el
 * cobro con periodo_abono y lo salda; «Todavía no» cierra. Si el abono está al día y hay `onTrabajoAparte`
 * (ficha del cliente), ofrece anotar un trabajo fuera del abono.
 */
export function HojaAbono({ clienteId, onCerrar, onTrabajoAparte }: { clienteId: string; onCerrar: () => void; onTrabajoAparte?: () => void }) {
  const datos = useDatos();
  const cliente = datos?.clientes.find((c) => c.id === clienteId);
  // La cuota se fija en cuanto hay datos (la hoja puede montarse antes de que carguen) y no cambia después:
  // al cobrarla, la lista viva cambia mientras la hoja se cierra. undefined = aún sin datos.
  const [cuota, setCuota] = useState<CobroEsperado | null | undefined>(() => (cliente && datos ? cuotaAPreguntar(cliente, datos.movimientos) : undefined));
  useEffect(() => {
    if (cuota === undefined && cliente && datos) setCuota(cuotaAPreguntar(cliente, datos.movimientos));
  }, [cuota, cliente, datos]);
  if (!datos || !cliente || cuota === undefined) return null;
  const aparte = onTrabajoAparte && (
    <button type="button" className="boton-texto tocable" onClick={onTrabajoAparte}>
      Es un trabajo aparte
    </button>
  );
  if (!cuota) {
    if (!onTrabajoAparte) return null;
    return (
      <Capa titulo={`El abono de ${cliente.nombre} está al día`} onCerrar={onCerrar}>
        <p className="secundario hoja-hecho-detalle">No tiene cuotas pendientes.</p>
        <div className="acciones">
          <button type="button" className="boton-secundario tocable" onClick={onTrabajoAparte}>
            Anotar un trabajo aparte
          </button>
          <button type="button" className="boton-texto tocable" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </Capa>
    );
  }
  const mes = nombreMes(cuota.periodo);
  return (
    <HojaImporte
      titulo={`¿Te pagó el abono de ${mes}?`}
      detalle={`${cliente.nombre} · Abono de ${mes}`}
      importe={cuota.pendiente}
      textoNo="Todavía no"
      onCerrar={onCerrar}
      extra={aparte}
      onGuardar={async (cobrado, medio) => {
        const cat = datos.categorias.find((c) => c.clave === 'cobro_abono');
        const r = await crearMovimiento({
          tipo: 'cobro', importe: cobrado, fecha: new Date().toISOString(), categoria_id: cat?.id ?? null, medio_pago: medio,
          cliente_id: cliente.id, nota: `Abono de ${mes}`, periodo_abono: cuota.periodo,
          saldos: [{ clave: `abono:${cuota.periodo}`, importe: Math.min(cobrado, cuota.pendiente) }],
        });
        return { mensaje: 'Cobro guardado', deshacer: r.deshacer };
      }}
      // «Todavía no» en abono no guarda nada: la cuota sigue en «Te deben».
      soloCerrarEnNo
    />
  );
}

function Capa({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  return (
    <div className="dialogo-capa" onClick={onCerrar}>
      <div className="dialogo hoja-hecho" role="dialog" aria-modal="true" aria-labelledby="titulo-hecho" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-hecho-cabecera">
          <h2 id="titulo-hecho">{titulo}</h2>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={onCerrar}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Cuerpo común: «Sí, [importe]», chips de pago, «Cobré otra cantidad» y la salida «No…». Importe null = sin precio. */
function HojaImporte(p: {
  titulo: string;
  detalle: string;
  importe: number | null;
  textoNo: string;
  soloCerrarEnNo?: boolean;
  extra?: ReactNode;
  onCerrar: () => void;
  onGuardar: (cobrado: number, medio: MedioPago) => Promise<{ mensaje: string; deshacer: Deshacer }>;
}) {
  const datos = useDatos();
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  // Último medio usado (criterio 9). Si la hoja se monta antes de que carguen los datos, se sincroniza al
  // llegar, mientras el usuario no haya elegido otro (hallazgo de B).
  const [medio, setMedio] = useState<MedioPago>(datos?.ultimoMedio ?? 'efectivo');
  const [medioTocado, setMedioTocado] = useState(false);
  const ultimo = datos?.ultimoMedio;
  useEffect(() => {
    if (!medioTocado && ultimo) setMedio(ultimo);
  }, [ultimo, medioTocado]);
  const [otra, setOtra] = useState(p.importe === null);
  const [textoOtra, setTextoOtra] = useState('');
  const [error, setError] = useState('');
  const otraCantidad = parsearImporte(textoOtra);
  const { importe } = p;

  const guardar = async (cobrado: number) => {
    if (!cerrojo.tomar()) return;
    try {
      const r = await p.onGuardar(cobrado, medio);
      p.onCerrar();
      mostrar(r.mensaje, r.deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError('No se pudo guardar. Vuelve a intentarlo.');
    }
  };

  return (
    <Capa titulo={p.titulo} onCerrar={p.onCerrar}>
      <p className="secundario hoja-hecho-detalle">{p.detalle}</p>
      <div className="acciones">
        <div className="chips" role="radiogroup" aria-label="Pago" style={{ marginLeft: 0 }}>
          {MEDIOS_PAGO.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={medio === x.id} className="chip tocable" onClick={() => {
                setMedio(x.id);
                setMedioTocado(true);
              }}>
              {x.nombre}
            </button>
          ))}
        </div>
        {importe !== null && !otra ? (
          <>
            <button type="button" className="boton-principal tocable" disabled={cerrojo.ocupado} onClick={() => guardar(importe)}>
              Sí, {formatearEuros(importe)}
            </button>
            <button type="button" className="boton-secundario tocable" onClick={() => setOtra(true)}>
              Cobré otra cantidad
            </button>
            <button type="button" className="boton-texto tocable" disabled={cerrojo.ocupado} onClick={() => (p.soloCerrarEnNo ? p.onCerrar() : guardar(0))}>
              {p.textoNo}
            </button>
            {p.extra}
          </>
        ) : (
          <>
            <label className="fila" htmlFor="importe-hecho" style={{ background: 'var(--fondo)', borderRadius: 14 }}>
              <span className="nombre">Cobré</span>
              <input
                id="importe-hecho"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0 €"
                value={textoOtra}
                onChange={(e) => {
                  const n = formatearMientrasEscribe(e.target.value, textoOtra);
                  if (n !== null) setTextoOtra(n);
                }}
                style={{ fontWeight: 700 }}
              />
            </label>
            {importe !== null && otraCantidad !== null && otraCantidad > 0 && otraCantidad < importe && (
              <p style={{ margin: 0 }}>Quedan {formatearEuros(importe - otraCantidad)} pendientes.</p>
            )}
            <button
              type="button"
              className="boton-principal tocable"
              disabled={otraCantidad === null || otraCantidad <= 0 || cerrojo.ocupado}
              onClick={() => otraCantidad && guardar(otraCantidad)}
            >
              Guardar cobro
            </button>
            <button type="button" className="boton-texto tocable" onClick={() => (importe !== null ? setOtra(false) : p.onCerrar())}>
              {importe !== null ? 'Volver' : p.textoNo}
            </button>
          </>
        )}
      </div>
      {error && <p className="aviso-error" role="alert">{error}</p>}
    </Capa>
  );
}
