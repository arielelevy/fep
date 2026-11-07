import { useMemo, useState } from 'react';
import { Bell, Check, WifiOff } from 'lucide-react';
import { CifraAnimada } from '../components/CifraAnimada';
import { Logo } from '../components/Logo';
import { useDatos } from '../db/datos';
import { alternarPaso } from '../db/repo';
import { calcularAportes, calcularEnCaja, calcularEnFianzas, calcularGanado, calcularPrestamoPendiente, desgloseEnCaja } from '../domain/cifras';
import { calcularPendientes, totalPendiente } from '../domain/pendientes';
import { formatearConSigno, formatearEuros } from '../lib/dinero';
import { claveMes, fechaLarga, nombreMes } from '../lib/fechas';
import { useEnLinea } from '../lib/hooks';

// Pantalla Hoy (§10.1), construida contra el mockup "1. Hoy" (PDF p. 1, docs/maqueta.md §1.1).
// Añadido por la especificación: campana de Alertas en la cabecera. En esta ola no hay visitas, cobros
// ni aviso contextual: la sección de visitas muestra su estado Vacío.

export type DestinoHoy = 'alertas' | 'ajustes' | 'mov-fianzas' | 'mov-aportes' | 'saldo-inicial' | 'te-deben';

export function Hoy({ onIr }: { onIr: (d: DestinoHoy) => void }) {
  const datos = useDatos();
  const enLinea = useEnLinea();
  const [verDesglose, setVerDesglose] = useState(false);
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

      <div className="seccion-cabecera">
        <h2 className="titulo-seccion">Visitas de hoy</h2>
      </div>
      {!datos ? (
        <div className="esqueleto" style={{ height: 76 }} />
      ) : (
        <div className="tarjeta tarjeta-vacia">
          <p className="titulo">Hoy no tienes visitas</p>
          <p className="secundario" style={{ margin: 0 }}>
            Cuando la agenda esté lista, verás aquí las visitas del día.
          </p>
        </div>
      )}
    </main>
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
