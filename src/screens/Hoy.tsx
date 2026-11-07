import { useMemo, useState } from 'react';
import { Bell, Check, Clock, WifiOff } from 'lucide-react';
import { CifraAnimada } from '../components/CifraAnimada';
import { useDeshacer } from '../components/Deshacer';
import { Logo } from '../components/Logo';
import { useDatos } from '../db/datos';
import { alternarPaso, completarVisita, crearMovimiento, devolverFianza } from '../db/repo';
import { debePreguntarAbono } from '../domain/abonosEsperados';
import { horaDe } from '../domain/agenda';
import { calcularAportes, calcularEnCaja, calcularEnFianzas, calcularGanado, calcularPrestamoPendiente, desgloseEnCaja } from '../domain/cifras';
import { calcularPendientes, totalPendiente } from '../domain/pendientes';
import { mostrarResumenSemanal, resumenSemanal, textoMejora, textoResumenSemanal } from '../domain/resumenSemanal';
import type { Visita } from '../domain/tipos';
import {
  avisoContextual,
  contadorHechas,
  lineaVisita,
  proximaPendiente,
  textoManana,
  textoServicio,
  tipoCobroVisita,
  visitasDeHoy,
  type AvisoContextual,
} from '../domain/visitasHoy';
import { formatearConSigno, formatearEuros } from '../lib/dinero';
import { claveDia, claveMes, fechaLarga, nombreMes } from '../lib/fechas';
import { useCerrojo, useEnLinea } from '../lib/hooks';
import { HojaHecho, type ModoHecho } from './HojaHecho';
import paquete from '../../package.json?raw';
import '../styles/hoy.css';

// Pantalla Hoy (§10.1), construida contra el mockup "1. Hoy" (PDF p. 1, docs/maqueta.md §1.1).
// Añadido por la especificación: campana de Alertas en la cabecera. Ola 5: aviso contextual (C5), visitas de
// hoy con «N de M hechas» (C6–C8) y flujo Hecho (§10.1.4, hoja HojaHecho), resumen semanal positivo (§10.1.2)
// y la versión al pie. La línea de semáforo de cada tarjeta llega con el clima (fuera de esta ola).

/** Versión leída de package.json en el build (pedido de Ariel: «FERGO v<versión>» al pie de Hoy). */
export const VERSION_APP: string = (JSON.parse(paquete) as { version: string }).version;

export type DestinoHoy = 'alertas' | 'ajustes' | 'mov-fianzas' | 'mov-aportes' | 'saldo-inicial' | 'te-deben' | 'agenda' | { visita: string };

export function Hoy({ onIr }: { onIr: (d: DestinoHoy) => void }) {
  const datos = useDatos();
  const enLinea = useEnLinea();
  const [verDesglose, setVerDesglose] = useState(false);
  const [hoja, setHoja] = useState<{ id: string; modo?: ModoHecho } | null>(null);
  const ahora = new Date();
  const mes = claveMes(ahora);
  // Las cifras se recalculan sólo cuando cambian los movimientos o el mes (no al tocar el desglose ni abrir hojas).
  const movimientos = datos?.movimientos;
  const cifras = useMemo(
    () =>
      movimientos && {
        enCaja: calcularEnCaja(movimientos),
        desglose: desgloseEnCaja(movimientos),
        ganado: calcularGanado(movimientos, mes),
        fianzas: calcularEnFianzas(movimientos),
        aportes: calcularAportes(movimientos),
        prestamo: calcularPrestamoPendiente(movimientos),
        teDeben: totalPendiente(calcularPendientes(datos!.clientes, datos!.deudas, movimientos)),
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movimientos, datos?.clientes, datos?.deudas, mes],
  );

  return (
    <main className="pantalla" aria-labelledby="saludo">
      <header className="cabecera-hoy">
        <button type="button" className="logo-boton tocable" aria-label="Ajustes" onClick={() => onIr('ajustes')}>
          <Logo tam={38} />
        </button>
        <div className="textos">
          <h1 className="titulo-saludo" id="saludo">
            Hola, {datos?.usuario?.nombre ?? 'Felipe'}
          </h1>
          <div className="fecha">{fechaLarga(ahora)}</div>
        </div>
        <button type="button" className="boton-icono tocable" aria-label="Alertas" onClick={() => onIr('alertas')}>
          <Bell size={22} aria-hidden="true" />
        </button>
      </header>

      {!enLinea && <BandaSinConexion />}

      {!datos || !cifras ? (
        <ResumenCargando />
      ) : (
        <Resumen
          {...cifras}
          verDesglose={verDesglose}
          onDesglose={() => setVerDesglose((v) => !v)}
          mes={nombreMes(mes)}
          etiquetaAportante={datos.usuarios.find((u) => u.rol === 'colaborador')?.etiqueta_aportante ?? 'papá'}
          onIr={onIr}
        />
      )}

      {datos && <Bienvenida onIr={onIr} />}

      {datos && !datos.esColaborador && <Aviso />}

      {!datos ? (
        <>
          <div className="seccion-cabecera">
            <h2 className="titulo-seccion">Visitas de hoy</h2>
          </div>
          <div className="esqueleto" style={{ height: 76 }} />
        </>
      ) : (
        <VisitasDeHoy ahora={ahora} onIr={onIr} onHoja={setHoja} />
      )}

      {datos && <ResumenSemanalTarjeta ahora={ahora} />}

      <p className="version-app">FERGO v{VERSION_APP}</p>

      {hoja && <HojaHecho visitaId={hoja.id} modo={hoja.modo} onCerrar={() => setHoja(null)} />}
    </main>
  );
}

// ---------- Aviso contextual (§10.1.1.3, C5): máximo uno, el más prioritario ----------
function Aviso() {
  const datos = useDatos()!;
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  const aviso = useMemo(
    () => avisoContextual(datos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos.visitas, datos.clientes, datos.deudas, datos.movimientos],
  );
  if (!aviso) return null;

  const resolver = async (a: AvisoContextual) => {
    if (!cerrojo.tomar()) return;
    try {
      const fecha = new Date().toISOString();
      const categoria = (clave: string) => datos.categorias.find((c) => c.clave === clave)?.id ?? null;
      if (a.tipo === 'cobro_visita') {
        const r = await crearMovimiento({
          tipo: 'cobro', importe: a.importe, fecha, categoria_id: categoria('cobro_trabajo'), medio_pago: datos.ultimoMedio,
          cliente_id: a.cliente_id, nota: textoServicio(a.visita), saldos: [{ clave: `deuda:${a.deuda_id}`, importe: a.importe }],
        });
        mostrar('Cobro guardado', r.deshacer);
      } else if (a.tipo === 'fianza') {
        const r = await devolverFianza(a.fianza_id, a.importe, datos.ultimoMedio);
        mostrar('Fianza devuelta', r.deshacer);
      } else {
        const r = await crearMovimiento({
          tipo: 'cobro', importe: a.importe, fecha, categoria_id: categoria('cobro_abono'), medio_pago: datos.ultimoMedio,
          cliente_id: a.cliente_id, nota: `Abono de ${nombreMes(a.periodo)}`, periodo_abono: a.periodo, saldos: [{ clave: `abono:${a.periodo}`, importe: a.importe }],
        });
        mostrar('Cobro guardado', r.deshacer);
      }
    } catch (e) {
      console.error(e);
      mostrar('No se pudo guardar. Vuelve a intentarlo.');
    } finally {
      cerrojo.soltar();
    }
  };

  return (
    <section className="aviso-contextual" aria-label="Aviso">
      <Clock size={20} aria-hidden="true" />
      <p className="texto" style={{ margin: 0 }}>{aviso.texto}</p>
      <button type="button" className="boton-aviso tocable" disabled={cerrojo.ocupado} onClick={() => resolver(aviso)}>
        {aviso.boton}
      </button>
    </section>
  );
}

// ---------- Visitas de hoy (§10.1.1.4–5, C6–C8) ----------
function VisitasDeHoy({ ahora, onIr, onHoja }: { ahora: Date; onIr: (d: DestinoHoy) => void; onHoja: (h: { id: string; modo?: ModoHecho }) => void }) {
  const datos = useDatos()!;
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  const hoy = claveDia(ahora);
  const lista = useMemo(() => visitasDeHoy(datos.visitas, hoy), [datos.visitas, hoy]);
  const proxima = proximaPendiente(lista);
  const contador = contadorHechas(lista);
  const manana = textoManana(datos.visitas, hoy);
  const soloVer = datos.esColaborador; // Pablo ve la agenda pero no marca visitas (§3)

  // Flujo Hecho (§10.1.4): puntual con precio → hoja «¿Cobraste a …?»; abono o sin precio → hecha directa
  // con «Visita completada · Deshacer»; en abono con cuota vencida, la hoja «¿Te pagó el abono de [mes]?».
  const hecho = async (v: Visita) => {
    if (tipoCobroVisita(v) === 'puntual') return onHoja({ id: v.id, modo: 'cobro' });
    if (!cerrojo.tomar()) return;
    try {
      const r = await completarVisita(v.id, null);
      mostrar('Visita completada', r.deshacer);
      const cliente = datos.clientes.find((c) => c.id === v.cliente_id);
      if (tipoCobroVisita(v) === 'abono' && cliente) {
        const visitasCliente = datos.visitas.filter((x) => x.cliente_id === v.cliente_id);
        if (debePreguntarAbono(cliente, datos.movimientos, visitasCliente, v.id)) onHoja({ id: v.id, modo: 'abono' });
      }
    } catch (e) {
      console.error(e);
      mostrar('No se pudo marcar. Vuelve a intentarlo.');
    } finally {
      cerrojo.soltar();
    }
  };

  return (
    <>
      <div className="seccion-cabecera">
        <h2 className="titulo-seccion">Visitas de hoy</h2>
        {lista.length > 0 && <span className="contador-hechas">{contador.texto}</span>}
      </div>
      {lista.length === 0 ? (
        <div className="tarjeta tarjeta-vacia">
          <p className="titulo">Hoy no tienes visitas</p>
          {manana && (
            <button type="button" className="enlace-agenda tocable" onClick={() => onIr('agenda')}>
              {manana}
            </button>
          )}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {lista.map((v) => {
            const cliente = datos.clientes.find((c) => c.id === v.cliente_id);
            const hecha = v.estado === 'hecha';
            const esProxima = v.id === proxima?.id;
            const sinCobro = hecha && tipoCobroVisita(v) === 'sin_precio' && !datos.deudas.some((d) => d.visita_id === v.id);
            const nombre = cliente?.nombre ?? 'Cliente';
            return (
              <li key={v.id} className={`visita-hoy${hecha ? ' hecha' : ''}${esProxima ? ' proxima' : ''}`}>
                <button type="button" className="abrir tocable" onClick={() => onIr({ visita: v.id })}>
                  <span className="hora">{horaDe(v)}</span>
                  <span className="textos">
                    <span className="cliente">{nombre}</span>
                    <span className="linea">{lineaVisita(v, cliente, datos.deudas, datos.movimientos)}</span>
                    {hecha && <span className="estado-hecha">Hecha</span>}
                  </span>
                </button>
                {hecha ? (
                  sinCobro && !soloVer ? (
                    <button type="button" className="boton-anadir-cobro tocable" onClick={() => onHoja({ id: v.id, modo: 'anadir' })}>
                      Añadir cobro
                    </button>
                  ) : (
                    <span className="check-hecha" aria-hidden="true">
                      <Check size={20} />
                    </span>
                  )
                ) : (
                  !soloVer && (
                    <button
                      type="button"
                      className={`boton-hecho tocable${esProxima ? ' relleno' : ''}`}
                      aria-label={`Hecho: ${nombre}, ${horaDe(v)}`}
                      disabled={cerrojo.ocupado}
                      onClick={() => hecho(v)}
                    >
                      Hecho
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ---------- Resumen semanal positivo (§10.1.2) ----------
function ResumenSemanalTarjeta({ ahora }: { ahora: Date }) {
  const datos = useDatos()!;
  const r = useMemo(
    () => resumenSemanal(datos.movimientos, ahora, { visitas: datos.visitas, deudas: datos.deudas }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos.movimientos, datos.visitas, datos.deudas, claveDia(ahora)],
  );
  if (!mostrarResumenSemanal(r, datos.visitas, ahora)) return null;
  const mejora = textoMejora(r);
  return (
    <section className="tarjeta resumen-semanal" aria-label="Resumen de la semana">
      <p className="titulo">{textoResumenSemanal(r)}</p>
      {mejora && <p className="mejora">{mejora}</p>}
    </section>
  );
}

export function BandaSinConexion() {
  return (
    <div className="banda-sin-conexion" role="status">
      <WifiOff size={16} aria-hidden="true" />
      Sin conexión. Lo guardo y lo envío al volver.
    </div>
  );
}

function ResumenCargando() {
  return (
    <section className="resumen" aria-busy="true" aria-label="Cargando resumen">
      <div className="esqueleto" style={{ height: 16, width: 70 }} />
      <div className="esqueleto" style={{ height: 44, width: 170, marginTop: 8 }} />
      <div className="celdas">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="esqueleto" style={{ height: 70, borderRadius: 14 }} />
        ))}
      </div>
    </section>
  );
}

function Resumen(p: {
  enCaja: number;
  desglose: { efectivo: number; banco: number };
  verDesglose: boolean;
  onDesglose: () => void;
  ganado: number;
  mes: string;
  fianzas: number;
  aportes: number;
  prestamo: number;
  teDeben: number;
  etiquetaAportante: string;
  onIr: (d: DestinoHoy) => void;
}) {
  return (
    <section className="resumen" aria-label="Resumen">
      <button type="button" className="en-caja tocable" aria-expanded={p.verDesglose} onClick={p.onDesglose}>
        <span className="etiqueta">En caja</span>
        <CifraAnimada valor={p.enCaja} formato={formatearEuros} className="cifra-principal" testId="en-caja" />
        {p.verDesglose && (
          <span className="desglose">
            <span>Efectivo {formatearEuros(p.desglose.efectivo)}</span>
            <span>Banco {formatearEuros(p.desglose.banco)}</span>
          </span>
        )}
      </button>
      <div className="celdas">
        <div className="celda">
          <span className="etiqueta">Ganado en {p.mes}</span>
          <CifraAnimada
            valor={p.ganado}
            formato={formatearConSigno}
            className={`valor${p.ganado >= 0 ? ' lima' : ''}`}
            testId="ganado"
          />
        </div>
        <button type="button" className="celda tocable" onClick={() => p.onIr('te-deben')}>
          <span className="etiqueta">Te deben</span>
          <CifraAnimada valor={p.teDeben} formato={formatearEuros} className="valor" testId="te-deben" />
        </button>
        <button type="button" className="celda tocable" onClick={() => p.onIr('mov-fianzas')}>
          <span className="etiqueta">En fianzas</span>
          <CifraAnimada valor={p.fianzas} formato={formatearEuros} className="valor" testId="fianzas" />
        </button>
        <button type="button" className="celda tocable" onClick={() => p.onIr('mov-aportes')}>
          <span className="etiqueta">Aportes de {p.etiquetaAportante}</span>
          <CifraAnimada valor={p.aportes} formato={formatearEuros} className="valor" testId="aportes" />
          {p.prestamo > 0 && <span className="sub">Préstamo pendiente: {formatearEuros(p.prestamo)}</span>}
        </button>
      </div>
    </section>
  );
}

// Primer uso (§10.1.3): tarjeta de bienvenida con tres pasos marcables. Desaparece al completarlos.
function Bienvenida({ onIr }: { onIr: (d: DestinoHoy) => void }) {
  const datos = useDatos()!;
  const { saldoInicialHecho, esColaborador } = datos;
  // El paso del cliente se completa solo al dar de alta el primero (ola 4); se puede seguir marcando a mano.
  const pasos = { ...datos.pasos, cliente: datos.pasos.cliente || datos.clientes.length > 0 };
  if (esColaborador || (saldoInicialHecho && pasos.cliente && pasos.avisos)) return null;
  const marcar = (paso: 'cliente' | 'avisos') => alternarPaso(paso);
  return (
    <section className="tarjeta bienvenida" aria-labelledby="titulo-bienvenida">
      <h2 id="titulo-bienvenida">Para empezar</h2>
      <p className="secundario" style={{ margin: '0 0 6px' }}>
        Tres pasos y la app queda lista.
      </p>
      <button
        type="button"
        className="paso tocable"
        role="checkbox"
        aria-checked={saldoInicialHecho}
        onClick={() => !saldoInicialHecho && onIr('saldo-inicial')}
      >
        <span className="check">{saldoInicialHecho && <Check size={16} aria-hidden="true" />}</span>
        <span className="texto">Añade tu dinero actual</span>
        {!saldoInicialHecho && <span className="accion">Añadir</span>}
      </button>
      <button type="button" className="paso tocable" role="checkbox" aria-checked={pasos.cliente} onClick={() => marcar('cliente')}>
        <span className="check">{pasos.cliente && <Check size={16} aria-hidden="true" />}</span>
        <span className="texto">Añade tu primer cliente</span>
      </button>
      <button type="button" className="paso tocable" role="checkbox" aria-checked={pasos.avisos} onClick={() => marcar('avisos')}>
        <span className="check">{pasos.avisos && <Check size={16} aria-hidden="true" />}</span>
        <span className="texto">Activa los avisos</span>
      </button>
    </section>
  );
}
