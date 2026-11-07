import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { Dialogo } from '../components/Dialogo';
import { useDeshacer } from '../components/Deshacer';
import { useDatos } from '../db/datos';
import { crearMovimiento, devolverFianza, editarMovimiento, eliminarMovimiento, puedeTipo, type Deshacer } from '../db/repo';
import { prestamos as listaPrestamos, fianzas as listaFianzas } from '../domain/cifras';
import { calcularPendientes, cobradoPorClave, diasEntre, nivelAntiguedad, repartirCobro, textoAntiguedad, totalPendiente, type Pendiente } from '../domain/pendientes';
import { MEDIOS_PAGO, etiquetaEditado, etiquetaEliminado, etiquetaGuardado, nombreTipo, type Cliente, type MedioPago, type Movimiento, type TipoMovimiento } from '../domain/tipos';
import { centimosATexto, formatearEuros, formatearMientrasEscribe, parsearImporte } from '../lib/dinero';
import { claveDia, claveMes, etiquetaFechaCorta, fechaMaximaRegistro, instanteDeClaveDia, nombreMes, sumarMeses } from '../lib/fechas';
import { useCerrojo } from '../lib/hooks';
import { sinAcentos } from './Clientes';

// Bloques Cobro, Aporte y Fianza de la hoja Registrar (§10.2.2), con el estilo del mockup "2. Registrar"
// (PDF p. 2, docs/maqueta.md §1.2): importe grande, tarjeta de filas, chips de pago y botón lima de pie.
// Textos aclaratorios de §10.2.2: aportes en azul ("No cuenta como ganancia del negocio."), fianzas en
// ámbar ("No es un gasto. Te la devuelven."). La hoja de Gasto sigue en Registrar.tsx.

export type TipoDinero = 'cobro' | 'aporte' | 'fianza';
type SubCobro = 'trabajo' | 'abono' | 'anticipo' | 'otro';
type SubAporte = 'aporte' | 'prestamo' | 'devolver';

/** Estado que Registrar comparte con este bloque (no se pierde al cambiar de tipo). */
export interface Compartido {
  textoImporte: string;
  setTextoImporte: (v: string) => void;
  fechaClave: string;
  setFechaClave: (v: string) => void;
  medio: MedioPago;
  setMedio: (v: MedioPago) => void;
  nota: string;
  setNota: (v: string) => void;
}

/** Precarga del importe al elegir cliente (§10.2.2): lo pendiente si lo hay; si no, la cuota o el precio habitual. */
function precargaDe(x: Cliente | undefined, p: Pendiente[]): { total: number; precarga: number } {
  const total = totalPendiente(p);
  return { total, precarga: total || (x?.modalidad === 'abono' ? x.cuota_abono : x?.precio_habitual) || 0 };
}

export function tipoHojaDe(t: TipoMovimiento): TipoDinero | 'gasto' {
  if (t === 'cobro' || t === 'anticipo' || t === 'otro_ingreso') return 'cobro';
  if (t === 'aporte' || t === 'prestamo' || t === 'devolucion_prestamo') return 'aporte';
  if (t === 'fianza_entregada' || t === 'fianza_devuelta') return 'fianza';
  return 'gasto';
}

const subCobroDe = (m?: Movimiento): SubCobro | null =>
  !m ? null : m.tipo === 'anticipo' ? 'anticipo' : m.tipo === 'otro_ingreso' ? 'otro' : m.periodo_abono ? 'abono' : 'trabajo';
const subAporteDe = (m?: Movimiento): SubAporte | null =>
  !m ? null : m.tipo === 'prestamo' ? 'prestamo' : m.tipo === 'devolucion_prestamo' ? 'devolver' : 'aporte';

export function RegistrarDinero({
  tipo,
  editar,
  clienteInicial,
  cabecera,
  compartido: c,
  onPulsarCerrar,
  onCerrar,
}: {
  tipo: TipoDinero;
  editar?: Movimiento;
  clienteInicial?: string;
  cabecera: ReactNode; // control segmentado de Registrar
  compartido: Compartido;
  onPulsarCerrar: () => void;
  onCerrar: () => void;
}) {
  const datos = useDatos();
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  const hoy = claveDia(new Date());
  const [error, setError] = useState('');
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [verClientes, setVerClientes] = useState(false);
  const [devolver, setDevolver] = useState(false);
  const [descartar, setDescartar] = useState(false);

  // ---- Cobro ----
  const [clienteId, setClienteId] = useState<string | null>(editar?.cliente_id ?? clienteInicial ?? null);
  const [subCobro, setSubCobro] = useState<SubCobro | null>(subCobroDe(editar));
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  // ---- Aporte ----
  const [subAporte, setSubAporte] = useState<SubAporte>(subAporteDe(editar) ?? 'aporte');
  // ---- Fianza ----
  const [entregadaA, setEntregadaA] = useState(editar?.fianza?.entregada_a ?? '');
  const [motivo, setMotivo] = useState(editar?.fianza?.motivo ?? 'Furgoneta');

  const movs = datos?.movimientos ?? [];
  const cliente = datos?.clientes.find((x) => x.id === clienteId);
  // Al editar un cobro, lo que él mismo salda no cuenta como cobrado (si no, sus pendientes no aparecerían).
  const pendientes = useMemo(
    () => (datos && clienteId ? calcularPendientes(datos.clientes, datos.deudas, movs.filter((m) => m.id !== editar?.id), new Date(), clienteId) : []),
    [datos, clienteId, editar?.id, movs],
  );
  const marcados = pendientes.filter((p) => !desmarcados.has(p.clave));
  // "Ya pagó" llega con el cliente elegido: se precarga lo pendiente en cuanto hay datos (§9.4).
  const precargado = useRef(Boolean(editar));
  useEffect(() => {
    if (precargado.current || !datos || !clienteInicial) return;
    precargado.current = true;
    const { precarga } = precargaDe(datos.clientes.find((y) => y.id === clienteInicial), pendientes);
    if (precarga) c.setTextoImporte(centimosATexto(precarga));
  }, [datos, clienteInicial, pendientes, c]);
  const pendientesAbono = pendientes.filter((p) => p.periodo);
  const sub = subCobro ?? (pendientesAbono.length || (cliente?.modalidad === 'abono' && !pendientes.length) ? 'abono' : 'trabajo');
  // Sin cuota vencida, el abono paga por adelantado el primer mes (desde el actual) que aún no está pagado entero.
  const adelanto = useMemo(() => {
    const cuota = cliente?.cuota_abono ?? 0;
    if (editar?.periodo_abono || !cliente || cuota <= 0) return { mes: editar?.periodo_abono ?? claveMes(new Date()), resta: cuota };
    const cobrado = cobradoPorClave(movs.filter((m) => m.id !== editar?.id));
    let mes = claveMes(new Date());
    for (let i = 0; i < 24 && (cobrado.get(`${cliente.id}|abono:${mes}`) ?? 0) >= cuota; i++) mes = sumarMeses(mes, 1);
    return { mes, resta: cuota - (cobrado.get(`${cliente.id}|abono:${mes}`) ?? 0) };
  }, [cliente, movs, editar?.id, editar?.periodo_abono]);
  const mesAbono = pendientesAbono[0]?.periodo ?? adelanto.mes;
  const prestamosTodos = useMemo(() => listaPrestamos(movs), [movs]);
  const fianzasTodas = useMemo(() => listaFianzas(movs), [movs]);
  const prestamosAbiertos = prestamosTodos.filter((p) => p.pendiente > 0);
  const prestamoPendiente = prestamosAbiertos.reduce((s, p) => s + p.pendiente, 0);
  const sugerenciasFianza = [...new Set(fianzasTodas.map((f) => f.entrega.fianza?.entregada_a).filter(Boolean))] as string[];
  const fianzaEditada = editar?.tipo === 'fianza_entregada' ? fianzasTodas.find((f) => f.entrega.id === editar.id) : undefined;

  const importe = parsearImporte(c.textoImporte);
  const colaborador = datos?.esColaborador ?? false;
  const tipoFinal: TipoMovimiento = editar
    ? editar.tipo
    : tipo === 'cobro'
      ? sub === 'anticipo' ? 'anticipo' : sub === 'otro' ? 'otro_ingreso' : 'cobro'
      : tipo === 'aporte'
        ? subAporte === 'prestamo' ? 'prestamo' : subAporte === 'devolver' ? 'devolucion_prestamo' : 'aporte'
        : 'fianza_entregada';
  const soloLectura = colaborador && !puedeTipo('colaborador', tipoFinal);

  const elegirCliente = (x: Cliente) => {
    setClienteId(x.id);
    setVerClientes(false);
    setDesmarcados(new Set());
    if (!editar && datos) {
      // Precarga (§10.2.2): deuda pendiente si la hay; si no, precio habitual o cuota.
      const { total, precarga } = precargaDe(x, calcularPendientes(datos.clientes, datos.deudas, movs, new Date(), x.id));
      if (precarga && !c.textoImporte) c.setTextoImporte(centimosATexto(precarga));
      else if (total) c.setTextoImporte(centimosATexto(total));
    }
  };

  const alternarMarcado = (p: Pendiente) => {
    const n = new Set(desmarcados);
    if (n.has(p.clave)) n.delete(p.clave);
    else n.add(p.clave);
    setDesmarcados(n);
    const total = totalPendiente(pendientes.filter((x) => !n.has(x.clave)));
    if (total) c.setTextoImporte(centimosATexto(total));
  };

  const faltaCliente = tipo === 'cobro' && sub !== 'otro' && !clienteId;
  // Al editar una devolución, el tope es lo pendiente de su préstamo más lo que ella misma devolvía.
  const topeDevolucion =
    editar?.tipo === 'devolucion_prestamo'
      ? (prestamosTodos.find((p) => p.prestamo.id === editar.prestamo_id)?.pendiente ?? 0) + editar.importe
      : prestamoPendiente;
  const excedeDevolucion = tipoFinal === 'devolucion_prestamo' && importe !== null && importe > topeDevolucion;
  const faltaFianza = tipo === 'fianza' && !editar && !entregadaA.trim();
  const puedeGuardar = !soloLectura && importe !== null && importe > 0 && !faltaCliente && !excedeDevolucion && !faltaFianza;

  const fechaFinal = (): string => {
    if (editar && c.fechaClave === claveDia(editar.fecha)) return editar.fecha;
    if (c.fechaClave === hoy) return new Date().toISOString();
    return instanteDeClaveDia(c.fechaClave, new Date()).toISOString();
  };

  const categoriaIngreso = (clave: string) => datos?.categorias.find((x) => x.clave === clave)?.id ?? null;

  const saldosCobro = (imp: number) => {
    if (tipoFinal !== 'cobro') return { saldos: [], periodo_abono: null };
    // Editar sin cambiar importe ni cliente (una nota, una fecha) no reparte de nuevo: sigue saldando lo mismo.
    if (editar && imp === editar.importe && clienteId === editar.cliente_id)
      return { saldos: editar.saldos ?? [], periodo_abono: editar.periodo_abono ?? null };
    const aplicables = sub === 'abono' ? marcados.filter((p) => p.periodo) : marcados.filter((p) => sub === 'trabajo' ? !p.periodo : true);
    const lista = aplicables.length ? aplicables : marcados;
    // Al editar, lo que el cobro ya saldaba va primero; el resto, del más antiguo al más reciente.
    const propias = new Set((editar?.saldos ?? []).map((x) => x.clave));
    const primero = repartirCobro(imp, lista.filter((p) => propias.has(p.clave)));
    const usado = primero.reduce((t, x) => t + x.importe, 0);
    let saldos = [...primero, ...repartirCobro(imp - usado, lista.filter((p) => !propias.has(p.clave)))];
    if (sub === 'abono' && saldos.length === 0 && adelanto.resta > 0) saldos = [{ clave: `abono:${adelanto.mes}`, importe: Math.min(imp, adelanto.resta) }];
    const periodo = saldos.find((s) => s.clave.startsWith('abono:'))?.clave.slice(6) ?? null;
    return { saldos, periodo_abono: periodo };
  };

  const guardar = async () => {
    if (!puedeGuardar || importe === null || !cerrojo.tomar()) return;
    setError('');
    try {
      const comunes = { importe, fecha: fechaFinal(), medio_pago: c.medio, nota: c.nota };
      const fianza = { entregada_a: entregadaA.trim(), motivo: motivo.trim() || 'Furgoneta' };
      let deshacer: Deshacer;
      if (editar) {
        const extra = editar.tipo === 'fianza_entregada' ? { fianza } : editar.tipo === 'cobro' ? saldosCobro(importe) : {};
        deshacer = (await editarMovimiento(editar.id, { ...comunes, ...extra })).deshacer;
      } else if (tipoFinal === 'devolucion_prestamo') {
        // Devuelve del préstamo más antiguo al más reciente.
        const hechos: Deshacer[] = [];
        let resto = importe;
        for (const p of prestamosAbiertos) {
          if (resto <= 0) break;
          const parte = Math.min(resto, p.pendiente);
          hechos.push((await crearMovimiento({ ...comunes, tipo: 'devolucion_prestamo', importe: parte, categoria_id: null, prestamo_id: p.prestamo.id })).deshacer);
          resto -= parte;
        }
        deshacer = async () => { for (const d of hechos) await d(); };
      } else if (tipo === 'cobro') {
        const clave = sub === 'abono' ? 'cobro_abono' : sub === 'anticipo' ? 'anticipo' : sub === 'otro' ? 'otros_ingresos' : 'cobro_trabajo';
        deshacer = (await crearMovimiento({ ...comunes, tipo: tipoFinal, categoria_id: categoriaIngreso(clave), cliente_id: clienteId, ...saldosCobro(importe) })).deshacer;
      } else if (tipo === 'fianza') {
        deshacer = (await crearMovimiento({ ...comunes, tipo: 'fianza_entregada', categoria_id: null, fianza })).deshacer;
      } else {
        deshacer = (await crearMovimiento({ ...comunes, tipo: tipoFinal, categoria_id: null })).deshacer;
      }
      onCerrar();
      mostrar(editar ? etiquetaEditado(editar.tipo) : etiquetaGuardado(tipoFinal), deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError('No se pudo guardar. Lo que has escrito sigue aquí; vuelve a intentarlo.');
    }
  };

  const eliminar = async () => {
    if (!editar) return;
    try {
      const r = await eliminarMovimiento(editar.id);
      onCerrar();
      mostrar(etiquetaEliminado(editar.tipo), r.deshacer);
    } catch (e) {
      console.error(e);
      setError('No se pudo eliminar. Vuelve a intentarlo.');
    }
  };

  const nombreGuardar: Record<string, string> = {
    cobro: 'Guardar cobro', anticipo: 'Guardar anticipo', otro_ingreso: 'Guardar ingreso', aporte: 'Guardar aporte',
    prestamo: 'Guardar préstamo', devolucion_prestamo: 'Guardar devolución', fianza_entregada: 'Guardar fianza', fianza_devuelta: 'Guardar devolución',
  };
  const titulo = editar ? `Editar ${nombreTipo(editar.tipo).nombre.toLowerCase()}` : 'Nuevo movimiento';
  const aportante = datos?.usuarios.find((u) => u.rol === 'colaborador')?.etiqueta_aportante ?? 'papá';

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby="titulo-registrar">
        <header className="hoja-cabecera">
          <h1 id="titulo-registrar">{titulo}</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={() => (!editar && (c.textoImporte || c.nota) ? setDescartar(true) : onPulsarCerrar())}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          {cabecera}

          {tipo === 'cobro' && !editar && (
            <div className="filas">
              <button type="button" className="fila tocable" onClick={() => setVerClientes(true)} disabled={soloLectura}>
                <span className="nombre">Cliente</span>
                <span className={`valor${cliente ? ' fuerte' : ''}`}>
                  {cliente?.nombre ?? (sub === 'otro' ? 'Opcional' : 'Elegir')}
                  <ChevronRight size={18} aria-hidden="true" />
                </span>
              </button>
            </div>
          )}
          {tipo === 'cobro' && editar && cliente && <p className="subtitulo-campo">Cliente: <strong>{cliente.nombre}</strong></p>}

          <div className="importe">
            <label htmlFor="importe">Importe</label>
            <div className="campo">
              <input
                id="importe"
                name="importe"
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                autoFocus={tipo !== 'cobro' || Boolean(clienteId)}
                placeholder="0"
                disabled={soloLectura}
                value={c.textoImporte}
                style={{ width: `${Math.max(c.textoImporte.length, 1) + 0.3}ch` }}
                onChange={(e) => {
                  const n = formatearMientrasEscribe(e.target.value, c.textoImporte);
                  if (n !== null) c.setTextoImporte(n);
                }}
              />
              <span className="euro" aria-hidden="true">€</span>
            </div>
          </div>

          {tipo === 'cobro' && !editar && (
            <>
              <div className="chips-fila" role="radiogroup" aria-label="Tipo de cobro">
                {(['trabajo', 'abono', 'anticipo', 'otro'] as SubCobro[]).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={sub === s} className="chip tocable" onClick={() => setSubCobro(s)}>
                    {s === 'trabajo' ? 'Trabajo' : s === 'abono' ? `Abono ${nombreMes(mesAbono)}` : s === 'anticipo' ? 'Anticipo' : 'Otro ingreso'}
                  </button>
                ))}
              </div>
              {(sub === 'trabajo' || sub === 'abono') && pendientes.length > 0 && (
                <section aria-labelledby="titulo-salda">
                  <p className="subtitulo-campo" id="titulo-salda">¿Qué te paga?</p>
                  <div className="filas" style={{ marginTop: 0 }}>
                    {pendientes.map((p) => {
                      const dias = diasEntre(p.desde, hoy);
                      return (
                        <label key={p.clave} className="fila tocable">
                          <input type="checkbox" checked={!desmarcados.has(p.clave)} onChange={() => alternarMarcado(p)} className="casilla" />
                          <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontWeight: 600 }}>{p.concepto}</span>
                            <span className={`chip-estado ${nivelAntiguedad(dias)}`}>{textoAntiguedad(dias)}</span>
                          </span>
                          <span className="valor fuerte">{formatearEuros(p.pendiente)}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}

          {tipo === 'aporte' && (
            <>
              {!editar && (
                <div className="chips-fila" role="radiogroup" aria-label="Tipo de aporte">
                  {(['aporte', 'prestamo', 'devolver'] as SubAporte[]).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={subAporte === s} className="chip tocable" onClick={() => setSubAporte(s)}>
                      {s === 'aporte' ? 'Aporte' : s === 'prestamo' ? 'Préstamo' : 'Devolver préstamo'}
                    </button>
                  ))}
                </div>
              )}
              <p className="texto-aclaratorio azul">
                No cuenta como ganancia del negocio.
                {subAporte === 'aporte' && ` Es dinero de ${aportante} que no se devuelve.`}
                {subAporte === 'prestamo' && ` Es dinero de ${aportante} que se devuelve.`}
              </p>
              {subAporte === 'devolver' && (!editar || excedeDevolucion) && (
                <p className="texto-aclaratorio neutro">
                  {editar
                    ? `Como mucho ${formatearEuros(topeDevolucion)}.`
                    : `${prestamoPendiente > 0 ? `Préstamo pendiente: ${formatearEuros(prestamoPendiente)}` : 'No hay ningún préstamo pendiente.'}${excedeDevolucion ? ` · Como mucho ${formatearEuros(topeDevolucion)}.` : ''}`}
                </p>
              )}
            </>
          )}

          {tipo === 'fianza' && (
            <>
              {(editar?.tipo !== 'fianza_devuelta') && (
                <div className="filas">
                  <label className="fila">
                    <span className="nombre">¿A quién se la dejas?</span>
                    <input type="text" list="sugerencias-fianza" placeholder="Empresa" value={entregadaA} disabled={soloLectura} onChange={(e) => setEntregadaA(e.target.value)} />
                  </label>
                  <datalist id="sugerencias-fianza">
                    {sugerenciasFianza.map((s) => <option key={s} value={s} />)}
                  </datalist>
                  <label className="fila">
                    <span className="nombre">Motivo</span>
                    <input type="text" value={motivo} disabled={soloLectura} onChange={(e) => setMotivo(e.target.value)} />
                  </label>
                </div>
              )}
              <p className="texto-aclaratorio ambar">No es un gasto. Te la devuelven.</p>
              {fianzaEditada && (
                <p className="texto-aclaratorio neutro">
                  {fianzaEditada.estado === 'pendiente'
                    ? 'Pendiente de devolver.'
                    : fianzaEditada.estado === 'devuelta'
                      ? `Devuelta entera (${formatearEuros(fianzaEditada.devuelto)}).`
                      : `Te devolvieron ${formatearEuros(fianzaEditada.devuelto)} y te descontaron ${formatearEuros(fianzaEditada.descontado)}.`}
                </p>
              )}
            </>
          )}

          <div className="filas">
            <div className="fila fila-fecha">
              <span className="nombre" id="etq-fecha">Fecha</span>
              <span className="valor fuerte">
                {etiquetaFechaCorta(c.fechaClave)}
                <ChevronRight size={18} aria-hidden="true" />
              </span>
              <input
                type="date"
                aria-labelledby="etq-fecha"
                value={c.fechaClave}
                max={fechaMaximaRegistro(hoy)}
                disabled={soloLectura}
                onChange={(e) => e.target.value && e.target.value <= fechaMaximaRegistro(hoy) && c.setFechaClave(e.target.value)}
              />
            </div>
            <div className="fila">
              <span className="nombre" id="etq-pago">Pago</span>
              <div className="chips" role="radiogroup" aria-labelledby="etq-pago">
                {MEDIOS_PAGO.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={c.medio === m.id} className="chip tocable" disabled={soloLectura} onClick={() => c.setMedio(m.id)}>
                    {m.nombre}
                  </button>
                ))}
              </div>
            </div>
            <label className="fila">
              <span className="nombre">Nota</span>
              <input type="text" placeholder="Opcional" value={c.nota} maxLength={140} disabled={soloLectura} onChange={(e) => c.setNota(e.target.value)} />
            </label>
          </div>

          {fianzaEditada?.estado === 'pendiente' && !soloLectura && (
            <button type="button" className="boton-secundario ancho-total tocable" style={{ marginTop: 14 }} onClick={() => setDevolver(true)}>
              Me la devolvieron
            </button>
          )}
          {editar && !soloLectura && (
            <div style={{ marginTop: 18 }}>
              <button type="button" className="boton-peligro tocable" onClick={() => setConfirmarEliminar(true)}>Eliminar</button>
            </div>
          )}
          {soloLectura && <p className="texto-aclaratorio neutro">Solo Felipe puede cambiar este movimiento.</p>}
          {error && <p className="aviso-error" role="alert">{error}</p>}
        </div>

        {!soloLectura && (
          <footer className="hoja-pie">
            <button type="button" className="boton-principal tocable" disabled={!puedeGuardar || cerrojo.ocupado} onClick={guardar}>
              {editar ? 'Guardar cambios' : nombreGuardar[tipoFinal]}
            </button>
          </footer>
        )}
      </div>

      {verClientes && datos && (
        <ElegirCliente clientes={datos.clientes.filter((x) => x.activo)} movs={movs} onElegir={elegirCliente} onCerrar={() => setVerClientes(false)} />
      )}
      {descartar && (
        <Dialogo
          titulo="¿Descartar este movimiento?"
          principal="Descartar"
          secundario="Seguir editando"
          onPrincipal={onPulsarCerrar}
          onSecundario={() => setDescartar(false)}
        />
      )}
      {confirmarEliminar && (
        <Dialogo
          titulo="¿Eliminar este movimiento?"
          texto="Podrás deshacerlo durante unos segundos."
          principal="Eliminar"
          secundario="Cancelar"
          onPrincipal={() => { setConfirmarEliminar(false); eliminar(); }}
          onSecundario={() => setConfirmarEliminar(false)}
        />
      )}
      {devolver && fianzaEditada && (
        <DevolverFianza fianza={fianzaEditada.entrega} onCerrar={(hecho) => { setDevolver(false); if (hecho) onCerrar(); }} />
      )}
    </div>
  );
}

/** Buscador de clientes con los 5 más recientes arriba (§10.2.1). */
export function ElegirCliente({ clientes, movs, onElegir, onCerrar }: { clientes: Cliente[]; movs: Movimiento[]; onElegir: (c: Cliente) => void; onCerrar: () => void }) {
  const [busca, setBusca] = useState('');
  const ultimo = new Map<string, string>();
  for (const m of movs) if (m.cliente_id && (ultimo.get(m.cliente_id) ?? '') < m.fecha) ultimo.set(m.cliente_id, m.fecha);
  const q = sinAcentos(busca);
  const recientes = busca ? [] : [...clientes].filter((x) => ultimo.has(x.id)).sort((a, b) => ultimo.get(b.id)!.localeCompare(ultimo.get(a.id)!)).slice(0, 5);
  const filtrados = clientes.filter((x) => sinAcentos(`${x.nombre} ${x.direccion} ${x.telefono ?? ''}`).includes(q) && !recientes.includes(x));
  const fila = (x: Cliente) => (
    <button key={x.id} type="button" className="fila tocable" onClick={() => onElegir(x)}>
      <span className="nombre" style={{ flex: 1 }}>{x.nombre}</span>
      <span className="valor">{x.modalidad === 'abono' ? 'Abono' : 'Puntual'}</span>
    </button>
  );
  return (
    <div className="capa" style={{ zIndex: 56 }}>
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby="titulo-elegir-cliente">
        <header className="hoja-cabecera">
          <h2 id="titulo-elegir-cliente">Elegir cliente</h2>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={onCerrar}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <label style={{ position: 'relative', display: 'block' }}>
            <span className="sr-only">Buscar cliente</span>
            <input className="buscador" type="search" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <Search size={18} aria-hidden="true" style={{ position: 'absolute', right: 14, top: 15, color: 'var(--texto-3)' }} />
          </label>
          {recientes.length > 0 && (
            <>
              <h3 className="etiqueta-seccion">Recientes</h3>
              <div className="filas" style={{ marginTop: 0 }}>{recientes.map(fila)}</div>
            </>
          )}
          {filtrados.length > 0 && (
            <>
              <h3 className="etiqueta-seccion">{busca ? 'Resultados' : 'Todos'}</h3>
              <div className="filas" style={{ marginTop: 0 }}>{filtrados.map(fila)}</div>
            </>
          )}
          {clientes.length === 0 && <p className="secundario" style={{ marginTop: 16 }}>Aún no tienes clientes. Añádelos desde la pestaña Clientes.</p>}
          {clientes.length > 0 && !recientes.length && !filtrados.length && <p className="secundario" style={{ marginTop: 16 }}>Ningún cliente con ese nombre.</p>}
        </div>
      </div>
    </div>
  );
}

/** "Me la devolvieron" (§9.6.3): Entera o Me descontaron algo. */
export function DevolverFianza({ fianza, onCerrar }: { fianza: Movimiento; onCerrar: (hecho: boolean) => void }) {
  const datos = useDatos();
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  const [descuento, setDescuento] = useState(false);
  const [texto, setTexto] = useState('');
  const [medio, setMedio] = useState<MedioPago>(datos?.ultimoMedio ?? 'efectivo');
  const [error, setError] = useState('');
  const devuelto = parsearImporte(texto);
  const valido = devuelto !== null && devuelto >= 0 && devuelto < fianza.importe;

  const guardar = async (importe: number) => {
    if (!cerrojo.tomar()) return;
    try {
      const r = await devolverFianza(fianza.id, importe, medio);
      onCerrar(true);
      mostrar('Fianza devuelta', r.deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError('No se pudo guardar. Vuelve a intentarlo.');
    }
  };

  return (
    <div className="dialogo-capa" onClick={() => onCerrar(false)}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="titulo-devolver" onClick={(e) => e.stopPropagation()}>
        <h2 id="titulo-devolver">¿Te devolvieron la fianza de {formatearEuros(fianza.importe)}?</h2>
        <div className="chips" role="radiogroup" aria-label="Pago" style={{ margin: '0 0 14px', marginLeft: 0 }}>
          {MEDIOS_PAGO.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={medio === m.id} className="chip tocable" onClick={() => setMedio(m.id)}>{m.nombre}</button>
          ))}
        </div>
        {!descuento ? (
          <div className="acciones">
            <button type="button" className="boton-principal tocable" disabled={cerrojo.ocupado} onClick={() => guardar(fianza.importe)}>
              Entera, {formatearEuros(fianza.importe)}
            </button>
            <button type="button" className="boton-secundario tocable" onClick={() => setDescuento(true)}>Me descontaron algo</button>
          </div>
        ) : (
          <div className="acciones">
            <label className="fila" style={{ background: 'var(--fondo)', borderRadius: 14 }}>
              <span className="nombre">¿Cuánto te devolvieron?</span>
              <input type="text" inputMode="decimal" autoFocus placeholder="0 €" value={texto} onChange={(e) => { const n = formatearMientrasEscribe(e.target.value, texto); if (n !== null) setTexto(n); }} />
            </label>
            {valido && <p style={{ margin: 0 }}>Te descontaron {formatearEuros(fianza.importe - devuelto!)}. Lo anoto como gasto de Movilidad.</p>}
            <button type="button" className="boton-principal tocable" disabled={!valido || cerrojo.ocupado} onClick={() => devuelto !== null && guardar(devuelto)}>
              Guardar devolución
            </button>
          </div>
        )}
        {error && <p className="aviso-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

/** Vista de un gasto (o saldo) para Pablo: puede verlo, no cambiarlo (§3). */
export function SoloLectura({ m, onCerrar }: { m: Movimiento; onCerrar: () => void }) {
  const datos = useDatos();
  const cat = datos?.categorias.find((x) => x.id === m.categoria_id);
  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby="titulo-solo-lectura">
        <header className="hoja-cabecera">
          <h1 id="titulo-solo-lectura">{cat?.nombre ?? 'Movimiento'}</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={onCerrar}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <p className="cifra-principal" style={{ textAlign: 'center', margin: '12px 0' }}>{formatearEuros(m.importe, 'detalle')}</p>
          <div className="filas">
            <div className="fila"><span className="nombre">Fecha</span><span className="valor fuerte">{etiquetaFechaCorta(claveDia(m.fecha))}</span></div>
            <div className="fila"><span className="nombre">Pago</span><span className="valor fuerte">{MEDIOS_PAGO.find((x) => x.id === m.medio_pago)?.nombre}</span></div>
            {m.nota && <div className="fila"><span className="nombre">Nota</span><span className="valor fuerte">{m.nota}</span></div>}
          </div>
          <p className="texto-aclaratorio neutro">Solo Felipe puede cambiar este movimiento.</p>
        </div>
      </div>
    </div>
  );
}
