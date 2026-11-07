import { useRef, useState } from 'react';
import { ChartColumn, ChevronLeft, ChevronRight, Heart, Lock } from 'lucide-react';
import { CifraAnimada } from '../components/CifraAnimada';
import { Icono } from '../components/Icono';
import { useDeshacer } from '../components/Deshacer';
import { useDatos } from '../db/datos';
import { eliminarMovimiento } from '../db/repo';
import { resumenMes } from '../domain/cifras';
import { MEDIOS_PAGO, type Categoria, type Movimiento, type TipoMovimiento } from '../domain/tipos';
import { formatearConSigno, formatearEuros } from '../lib/dinero';
import { claveDia, claveMes, encabezadoDia, mesConMayuscula, nombreMes, sumarMeses } from '../lib/fechas';
import { local, useEnLinea } from '../lib/hooks';
import { BandaSinConexion } from './Hoy';

// Pantalla Movimientos (§10.3), construida contra el mockup "3. Movimientos" (PDF p. 3, docs/maqueta.md §1.3).
// Añadido por la especificación: icono de Informes en la cabecera.

export type Filtro = 'todos' | 'cobros' | 'gastos' | 'aportes' | 'fianzas';

const FILTROS: { id: Filtro; nombre: string; tipos?: TipoMovimiento[] }[] = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'cobros', nombre: 'Cobros', tipos: ['cobro', 'anticipo', 'otro_ingreso'] },
  { id: 'gastos', nombre: 'Gastos', tipos: ['gasto'] },
  { id: 'aportes', nombre: 'Aportes', tipos: ['aporte', 'prestamo', 'devolucion_prestamo'] },
  { id: 'fianzas', nombre: 'Fianzas', tipos: ['fianza_entregada', 'fianza_devuelta'] },
];

export const CLAVE_FILTRO = 'fergo.movimientos.filtro';

export function filtroGuardado(): Filtro {
  const f = local.leer(CLAVE_FILTRO);
  return FILTROS.some((x) => x.id === f) ? (f as Filtro) : 'todos';
}

export function Movimientos({
  filtroInicial,
  onEditar,
  onRegistrar,
  onInformes,
}: {
  filtroInicial?: Filtro;
  onEditar: (m: Movimiento) => void;
  onRegistrar: () => void;
  onInformes: () => void;
}) {
  const datos = useDatos();
  const enLinea = useEnLinea();
  const mesActual = claveMes(new Date());
  const [mes, setMes] = useState(mesActual);
  const [filtro, setFiltroEstado] = useState<Filtro>(filtroInicial ?? filtroGuardado());
  const setFiltro = (f: Filtro) => {
    setFiltroEstado(f);
    local.escribir(CLAVE_FILTRO, f); // se recuerda en el dispositivo (§10.3.3)
  };

  const tipos = FILTROS.find((f) => f.id === filtro)!.tipos;
  const delMes = (datos?.movimientos ?? [])
    .filter((m) => claveMes(m.fecha) === mes && (!tipos || tipos.includes(m.tipo)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en));
  const porDia = new Map<string, Movimiento[]>();
  for (const m of delMes) {
    const k = claveDia(m.fecha);
    porDia.set(k, [...(porDia.get(k) ?? []), m]);
  }
  const resumen = datos ? resumenMes(datos.movimientos, mes) : null;
  const categorias = new Map((datos?.categorias ?? []).map((c) => [c.id, c]));

  return (
    <main className="pantalla" aria-labelledby="titulo-mov">
      <header className="cabecera-mov">
        <h1 className="titulo-pantalla" id="titulo-mov">
          Movimientos
        </h1>
        <div className="selector-mes">
          <button type="button" className="tocable" aria-label="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <span className="mes" aria-live="polite">
            {mesConMayuscula(mes)}
          </span>
          <button
            type="button"
            className="tocable"
            aria-label="Mes siguiente"
            disabled={mes >= mesActual}
            onClick={() => setMes(sumarMeses(mes, 1))}
          >
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="boton-icono tocable" aria-label="Informes" onClick={onInformes}>
          <ChartColumn size={22} aria-hidden="true" />
        </button>
      </header>

      {!enLinea && <div style={{ marginTop: 14 }}><BandaSinConexion /></div>}

      <div className="tarjetas-mes">
        {resumen ? (
          <>
            <div className="tarjeta-mes">
              <span className="etiqueta">Cobrado</span>
              <CifraAnimada valor={resumen.cobrado} formato={(c) => formatearConSigno(c)} className="valor positivo" testId="cobrado-mes" />
            </div>
            <div className="tarjeta-mes">
              <span className="etiqueta">Gastado</span>
              <CifraAnimada valor={-resumen.gastado} formato={(c) => formatearEuros(c)} className="valor" testId="gastado-mes" />
              {resumen.inversion > 0 && <span className="extra">Más {formatearEuros(resumen.inversion)} en equipo</span>}
            </div>
          </>
        ) : (
          <>
            <div className="esqueleto" style={{ height: 72 }} />
            <div className="esqueleto" style={{ height: 72 }} />
          </>
        )}
      </div>

      <div className="filtros" role="radiogroup" aria-label="Filtrar movimientos">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={filtro === f.id} className="pildora tocable" onClick={() => setFiltro(f.id)}>
            {f.nombre}
          </button>
        ))}
      </div>

      {!datos ? (
        <div aria-busy="true" aria-label="Cargando movimientos">
          <div className="esqueleto" style={{ height: 14, width: 60, margin: '22px 4px 10px' }} />
          <div className="esqueleto" style={{ height: 140 }} />
        </div>
      ) : delMes.length === 0 ? (
        <div className="tarjeta tarjeta-vacia" style={{ marginTop: 18 }}>
          <p className="titulo">Aún no hay movimientos en {nombreMes(mes)}</p>
          {mes === mesActual && (
            <button type="button" className="boton-principal tocable" style={{ marginTop: 12 }} onClick={onRegistrar}>
              Registrar el primero
            </button>
          )}
        </div>
      ) : (
        [...porDia.entries()].map(([dia, movs]) => (
          <section key={dia} aria-label={encabezadoDia(dia)}>
            <h2 className="etiqueta-seccion">{encabezadoDia(dia)}</h2>
            <ul className="grupo-dia" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {movs.map((m) => (
                <FilaMovimiento
                  key={m.id}
                  m={m}
                  categoria={m.categoria_id ? categorias.get(m.categoria_id) : undefined}
                  etiquetaAportante={datos.usuario?.etiqueta_aportante ?? 'papá'}
                  onEditar={() => onEditar(m)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

const medio = (m: Movimiento) => MEDIOS_PAGO.find((x) => x.id === m.medio_pago)?.nombre ?? '';

function presentacion(m: Movimiento, c: Categoria | undefined, etiquetaAportante: string) {
  switch (m.tipo) {
    case 'gasto': {
      const nombre = c?.nombre_corto ?? 'Gasto';
      const titulo = m.nota || nombre;
      const partes = ['Gasto', ...(m.nota ? [nombre] : []), medio(m), ...(m.foto_id ? ['Ticket'] : [])];
      return { titulo, sub: partes.join(' · '), importe: formatearEuros(-m.importe), clase: '', icono: <Icono nombre={c?.icono ?? 'Ellipsis'} size={20} />, claseIcono: '' };
    }
    case 'saldo_inicial':
      return { titulo: 'Saldo inicial', sub: `Dinero al empezar · ${m.medio_pago === 'efectivo' ? 'Efectivo' : 'Banco'}`, importe: formatearConSigno(m.importe), clase: '', icono: <Icono nombre="Wallet" size={20} />, claseIcono: '' };
    case 'aporte':
    case 'prestamo':
    case 'devolucion_prestamo':
      return { titulo: `Aporte de ${etiquetaAportante}`, chip: { texto: 'No cuenta como ganancia', clase: 'azul' }, importe: formatearConSigno(m.importe), clase: 'azul', icono: <Heart size={20} aria-hidden="true" />, claseIcono: 'aporte' };
    case 'fianza_entregada':
    case 'fianza_devuelta':
      return { titulo: `Fianza ${m.nota || 'furgoneta'}`.trim(), chip: { texto: 'Pendiente de devolver', clase: 'ambar' }, importe: formatearEuros(m.importe), clase: 'gris', icono: <Lock size={20} aria-hidden="true" />, claseIcono: 'fianza' };
    default:
      return { titulo: m.nota || 'Cobro', sub: `Cobro · ${medio(m)}`, importe: formatearConSigno(m.importe), clase: 'positivo', icono: <Icono nombre="ArrowUp" size={20} />, claseIcono: 'cobro' };
  }
}

// Fila de movimiento (C21). Toque → editar; deslizar a la izquierda → Eliminar (§10.3.5).
function FilaMovimiento({
  m,
  categoria,
  etiquetaAportante,
  onEditar,
}: {
  m: Movimiento;
  categoria?: Categoria;
  etiquetaAportante: string;
  onEditar: () => void;
}) {
  const { mostrar } = useDeshacer();
  const [abierta, setAbierta] = useState(false);
  const [dx, setDx] = useState(0);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const arrastro = useRef(false);
  const p = presentacion(m, categoria, etiquetaAportante);

  const eliminar = async () => {
    const r = await eliminarMovimiento(m.id);
    mostrar(m.tipo === 'saldo_inicial' ? 'Saldo eliminado' : 'Gasto eliminado', r.deshacer);
  };

  return (
    <li className={`mov${abierta ? ' abierta' : ''}${dx < 0 ? ' deslizando' : ''}`}>
      <button
        type="button"
        className="mov-eliminar"
        tabIndex={abierta ? 0 : -1}
        aria-hidden={!abierta}
        onClick={eliminar}
      >
        Eliminar
      </button>
      <button
        type="button"
        className="mov-contenido"
        style={{ transform: `translateX(${abierta ? -96 : Math.min(0, dx)}px)`, transition: inicio.current ? 'none' : undefined }}
        onPointerDown={(e) => {
          inicio.current = { x: e.clientX, y: e.clientY };
          arrastro.current = false;
        }}
        onPointerMove={(e) => {
          if (!inicio.current) return;
          const d = e.clientX - inicio.current.x;
          if (Math.abs(d) > 8 && Math.abs(d) > Math.abs(e.clientY - inicio.current.y)) {
            arrastro.current = true;
            setDx(abierta ? d - 96 : d);
          }
        }}
        onPointerUp={() => {
          if (arrastro.current) setAbierta(dx < -48);
          inicio.current = null;
          setDx(0);
        }}
        onPointerCancel={() => {
          inicio.current = null;
          setDx(0);
        }}
        onClick={() => {
          if (arrastro.current) {
            arrastro.current = false;
            return;
          }
          if (abierta) setAbierta(false);
          else onEditar();
        }}
        aria-label={`${p.titulo}, ${p.importe}. Editar`}
      >
        <span className={`mov-icono ${p.claseIcono}`}>{p.icono}</span>
        <span className="mov-textos">
          <span className="mov-titulo">{p.titulo}</span>
          {p.chip ? <span className={`chip-estado ${p.chip.clase}`}>{p.chip.texto}</span> : <span className="mov-sub">{p.sub}</span>}
        </span>
        <span className={`mov-importe ${p.clase}`}>{p.importe}</span>
      </button>
    </li>
  );
}
