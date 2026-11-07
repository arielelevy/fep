import { useId, useState } from 'react';
import { Phone, Truck, X } from 'lucide-react';
import { useDeshacer } from '../../components/Deshacer';
import { MEDIOS_PAGO, type MedioPago, type Visita } from '../../domain/tipos';
import { formatearEuros, parsearImporte, centimosATexto } from '../../lib/dinero';
import { useCerrojo } from '../../lib/hooks';
import { devolucionPorDefecto, diasAlquiler, ETIQUETA_FURGO, estadoFurgo, recogidaPorDefecto, textoMomento } from './logica';
import type { ReservaVehiculo } from './modelo';
import { cancelarReserva, guardarReserva, registrarDevolucion, registrarRecogida } from './operaciones';
import { proveedorHabitual, type ProveedorAlquiler } from './plantillas';

// Bloque Furgoneta (§10.8.1; maqueta «7. Preparar trabajo», bloque Furgoneta). Estados con etiqueta en palabras:
// «Sin reservar» (ámbar), «Reservada» (lima suave), «Recogida», «Devuelta». Solo aparece si alguna visita del día
// requiere vehículo.

const mensajeError = (e: unknown, porDefecto: string) =>
  e instanceof Error && (e.name === 'SinPermiso' || /^(Falta|La |Importe|Fecha|Esta )/.test(e.message)) ? e.message : porDefecto;

export function BloqueFurgoneta({
  fecha,
  visitas,
  reserva,
  proveedores,
  ultimoMedio,
  puede,
}: {
  fecha: string;
  visitas: Visita[];
  reserva: ReservaVehiculo | undefined;
  proveedores: ProveedorAlquiler[];
  ultimoMedio: MedioPago;
  puede: boolean;
}) {
  const id = useId();
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  const [hoja, setHoja] = useState(false);
  const [medio, setMedio] = useState<MedioPago>(ultimoMedio);
  const [devolver, setDevolver] = useState<null | 'preguntar' | 'descuento'>(null);
  const [devuelto, setDevuelto] = useState('');
  const [error, setError] = useState('');
  const estado = estadoFurgo(visitas, reserva);
  if (estado === 'no_aplica') return null;
  const habitual = proveedorHabitual(proveedores);
  const ahora = new Date();

  const accion = async (f: () => Promise<{ deshacer: () => Promise<void> }>, texto: string, porDefecto: string) => {
    if (!cerrojo.tomar()) return;
    setError('');
    try {
      const r = await f();
      mostrar(texto, r.deshacer);
      setDevolver(null);
      setDevuelto('');
    } catch (e) {
      console.error(e);
      setError(mensajeError(e, porDefecto));
    } finally {
      cerrojo.soltar();
    }
  };

  const recoger = () =>
    reserva &&
    accion(
      () => registrarRecogida(reserva.id, { precio: reserva.precio, fianza: reserva.fianza_prevista, medio_pago: medio, visitas }),
      reserva.fianza_prevista > 0 ? 'Alquiler y fianza registrados' : 'Alquiler registrado',
      'No se pudo registrar. Vuelve a intentarlo.',
    );
  const fianza = reserva?.fianza_prevista ?? 0;
  const devolverEntera = () => reserva && accion(() => registrarDevolucion(reserva.id, fianza, medio), 'Fianza devuelta', 'No se pudo guardar. Vuelve a intentarlo.');
  const importeDevuelto = parsearImporte(devuelto);
  const devolverConDescuento = () =>
    reserva &&
    importeDevuelto !== null &&
    accion(() => registrarDevolucion(reserva.id, importeDevuelto, medio), 'Devolución registrada', 'No se pudo guardar. Vuelve a intentarlo.');

  const chip = estado === 'sin_reservar' ? 'ambar' : estado === 'reservada' ? 'lima' : 'neutro';

  return (
    <section className="tarjeta bloque-preparar" aria-labelledby={`${id}-t`} data-bloque="furgoneta">
      <header className="bloque-cabecera">
        <span className="bloque-icono" aria-hidden="true">
          <Truck size={22} />
        </span>
        <h2 id={`${id}-t`}>Furgoneta</h2>
        <span className={`chip-preparar ${chip}`}>{ETIQUETA_FURGO[estado]}</span>
      </header>

      {estado === 'sin_reservar' && (
        <>
          <p className="bloque-texto">Hace falta para este trabajo.</p>
          {puede && (
            <div className="bloque-acciones">
              <button type="button" className="boton-principal tocable" onClick={() => setHoja(true)}>
                Ya la reservé
              </button>
              {habitual?.telefono && (
                <a className="boton-secundario tocable" href={`tel:${habitual.telefono}`}>
                  <Phone size={18} aria-hidden="true" />
                  Llamar a {habitual.nombre}
                </a>
              )}
            </div>
          )}
        </>
      )}

      {reserva && estado !== 'sin_reservar' && (
        <dl className="caja-resumen">
          <div>
            <dt>{estado === 'reservada' ? 'Recogida' : 'Proveedor'}</dt>
            <dd>{estado === 'reservada' ? `${capital(textoMomento(reserva.recogida, ahora))} · ${reserva.proveedor_nombre}` : reserva.proveedor_nombre}</dd>
          </div>
          <div>
            <dt>Alquiler</dt>
            <dd>{formatearEuros(reserva.precio, 'detalle')}</dd>
          </div>
          <div>
            <dt>Fianza</dt>
            <dd>{fianza > 0 ? `${formatearEuros(fianza, 'detalle')} (se devuelve)` : 'Sin fianza'}</dd>
          </div>
          <div>
            <dt>Devolución</dt>
            <dd>{capital(textoMomento(reserva.devolucion, ahora))}</dd>
          </div>
        </dl>
      )}

      {estado === 'reservada' && reserva && (
        <>
          <p className="bloque-texto">Al recogerla te pido registrar el pago y la fianza.</p>
          {puede && (
            <>
              <p className="bloque-pregunta">¿Ya recogiste la furgoneta?</p>
              <Medios id={id} medio={medio} onMedio={setMedio} />
              <div className="bloque-acciones">
                <button type="button" className="boton-principal tocable" disabled={cerrojo.ocupado || reserva.precio + fianza === 0} onClick={recoger}>
                  {fianza > 0 ? 'Registrar los dos' : 'Registrar el alquiler'}
                </button>
                <p className="secundario">
                  {fianza > 0
                    ? `Alquiler ${formatearEuros(reserva.precio, 'detalle')} y fianza ${formatearEuros(fianza, 'detalle')}, pagados con ${nombreMedio(medio)}.`
                    : `Alquiler ${formatearEuros(reserva.precio, 'detalle')}, pagado con ${nombreMedio(medio)}.`}
                </p>
                <div className="enlaces">
                  <button type="button" className="boton-texto tocable" onClick={() => setHoja(true)}>
                    Cambiar la reserva
                  </button>
                  <button
                    type="button"
                    className="boton-texto tocable"
                    disabled={cerrojo.ocupado}
                    onClick={() => accion(() => cancelarReserva(reserva.id), 'Reserva anulada', 'No se pudo anular. Vuelve a intentarlo.')}
                  >
                    Anular la reserva
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {estado === 'recogida' && reserva && (
        <>
          <p className="bloque-texto">Alquiler registrado{fianza > 0 ? ` y ${formatearEuros(fianza)} en fianzas` : ''}.</p>
          {puede && (
            <>
              <p className="bloque-pregunta">{fianza > 0 ? '¿Devolviste la furgoneta? ¿Te devolvieron la fianza?' : '¿Devolviste la furgoneta?'}</p>
              {devolver === 'descuento' ? (
                <div className="bloque-acciones">
                  <label className="campo-importe">
                    <span>¿Cuánto te devolvieron?</span>
                    <input
                      inputMode="decimal"
                      value={devuelto}
                      placeholder={centimosATexto(fianza)}
                      onChange={(e) => setDevuelto(e.target.value)}
                    />
                  </label>
                  {importeDevuelto !== null && importeDevuelto < fianza && (
                    <p className="secundario">Se anota un gasto de {formatearEuros(fianza - importeDevuelto, 'detalle')} con la nota «Descuento de fianza».</p>
                  )}
                  <button
                    type="button"
                    className="boton-principal tocable"
                    disabled={cerrojo.ocupado || importeDevuelto === null || importeDevuelto > fianza}
                    onClick={devolverConDescuento}
                  >
                    Guardar devolución
                  </button>
                  <button type="button" className="boton-texto tocable" onClick={() => setDevolver(null)}>
                    Volver
                  </button>
                </div>
              ) : (
                <>
                  <Medios id={id} medio={medio} onMedio={setMedio} />
                  <div className="opciones-devolucion">
                    <button type="button" className="boton-principal tocable" disabled={cerrojo.ocupado} onClick={devolverEntera}>
                      {fianza > 0 ? 'Entera' : 'Ya la devolví'}
                    </button>
                    {fianza > 0 && (
                      <button type="button" className="boton-secundario tocable" onClick={() => setDevolver('descuento')}>
                        Me descontaron algo
                      </button>
                    )}
                    <button type="button" className="boton-texto tocable" onClick={() => setDevolver(null)}>
                      Aún no
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {estado === 'devuelta' && <p className="bloque-texto">Furgoneta devuelta. Todo resuelto.</p>}

      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}

      {hoja && (
        <HojaReserva
          fecha={fecha}
          visitas={visitas}
          reserva={reserva}
          proveedores={proveedores}
          onCerrar={(texto, deshacer) => {
            setHoja(false);
            if (texto && deshacer) mostrar(texto, deshacer);
          }}
        />
      )}
    </section>
  );
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const nombreMedio = (m: MedioPago) => (MEDIOS_PAGO.find((x) => x.id === m)?.nombre ?? m).toLowerCase();

function Medios({ id, medio, onMedio }: { id: string; medio: MedioPago; onMedio: (m: MedioPago) => void }) {
  return (
    <div className="bloque-medios">
      <span className="etiqueta-campo" id={`${id}-pago`}>
        Pago
      </span>
      <div className="chips" role="radiogroup" aria-labelledby={`${id}-pago`}>
        {MEDIOS_PAGO.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={medio === m.id} className="chip tocable" onClick={() => onMedio(m.id)}>
            {m.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Formulario «Ya la reservé» (hoja inferior, §10.8.1): proveedor (el habitual preseleccionado), recogida (la tarde
 * anterior a las 19:00), devolución (el día del trabajo a las 20:00), precio y fianza prevista (precargados del
 * proveedor si están en Ajustes).
 */
function HojaReserva({
  fecha,
  visitas,
  reserva,
  proveedores,
  onCerrar,
}: {
  fecha: string;
  visitas: Visita[];
  reserva: ReservaVehiculo | undefined;
  proveedores: ProveedorAlquiler[];
  onCerrar: (texto?: string, deshacer?: () => Promise<void>) => void;
}) {
  const id = useId();
  const cerrojo = useCerrojo();
  const habitual = proveedorHabitual(proveedores);
  const [nombre, setNombre] = useState(reserva?.proveedor_nombre ?? habitual?.nombre ?? '');
  const [recogida, setRecogida] = useState(reserva?.recogida ?? recogidaPorDefecto(fecha));
  const [devolucion, setDevolucion] = useState(reserva?.devolucion ?? devolucionPorDefecto(fecha));
  const precioInicial = reserva?.precio ?? (habitual?.precio_dia ? habitual.precio_dia * diasAlquiler(recogidaPorDefecto(fecha), devolucionPorDefecto(fecha)) : null);
  const fianzaInicial = reserva?.fianza_prevista ?? habitual?.fianza_habitual ?? null;
  const [precio, setPrecio] = useState(precioInicial !== null ? centimosATexto(precioInicial) : '');
  const [fianza, setFianza] = useState(fianzaInicial !== null ? centimosATexto(fianzaInicial) : '');
  const [error, setError] = useState('');

  const proveedor = proveedores.find((p) => p.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
  const p = precio.trim() ? parsearImporte(precio) : 0;
  const f = fianza.trim() ? parsearImporte(fianza) : 0;
  const valido = Boolean(nombre.trim()) && p !== null && f !== null && devolucion > recogida;

  const guardar = async () => {
    if (!valido || !cerrojo.tomar()) return;
    setError('');
    try {
      const r = await guardarReserva({
        fecha, proveedor_id: proveedor?.id ?? null, proveedor_nombre: nombre, proveedor_telefono: proveedor?.telefono ?? null,
        recogida, devolucion, precio: p ?? 0, fianza_prevista: f ?? 0, visitas: visitas.filter((v) => v.requiere_vehiculo),
      });
      onCerrar(reserva ? 'Reserva cambiada' : 'Furgoneta reservada', r.deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError(mensajeError(e, 'No se pudo guardar. Vuelve a intentarlo.'));
    }
  };

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
        <header className="hoja-cabecera">
          <h1 id={`${id}-titulo`}>Ya la reservé</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={() => onCerrar()}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <div className="formulario-preparar">
            <label className="campo-preparar">
              <span>¿A quién se la alquilas?</span>
              <input value={nombre} list={`${id}-proveedores`} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
              <datalist id={`${id}-proveedores`}>
                {proveedores.map((x) => (
                  <option key={x.id} value={x.nombre} />
                ))}
              </datalist>
            </label>
            <label className="campo-preparar">
              <span>Recogida</span>
              <input type="datetime-local" value={recogida} onChange={(e) => setRecogida(e.target.value)} />
            </label>
            <label className="campo-preparar">
              <span>Devolución</span>
              <input type="datetime-local" value={devolucion} onChange={(e) => setDevolucion(e.target.value)} />
            </label>
            {devolucion <= recogida && <p className="aviso-error">La devolución tiene que ser después de la recogida.</p>}
            <label className="campo-preparar">
              <span>Precio del alquiler (€)</span>
              <input inputMode="decimal" value={precio} placeholder="0,00" onChange={(e) => setPrecio(e.target.value)} />
            </label>
            <label className="campo-preparar">
              <span>Fianza prevista (€)</span>
              <input inputMode="decimal" value={fianza} placeholder="0,00" onChange={(e) => setFianza(e.target.value)} />
            </label>
            <p className="texto-aclaratorio ambar">La fianza no es un gasto. Te la devuelven.</p>
          </div>
          {error && (
            <p className="aviso-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="hoja-pie">
          <button type="button" className="boton-principal tocable" disabled={!valido || cerrojo.ocupado} onClick={guardar}>
            Guardar reserva
          </button>
        </footer>
      </div>
    </div>
  );
}
