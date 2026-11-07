import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useDatos } from '../db/datos';
import { calcularPendientes, diasEntre, nivelAntiguedad, textoAntiguedad, type Nivel, type Pendiente } from '../domain/pendientes';
import type { Cliente, Frecuencia } from '../domain/tipos';
import { formatearEuros } from '../lib/dinero';
import { claveDia } from '../lib/fechas';
import { useEnLinea } from '../lib/hooks';
import { BandaSinConexion } from './Hoy';
import '../styles/clientes.css';

// Listado de Clientes (§10.4.1). No tiene maqueta: se construye con el estilo de la maqueta
// (docs/maqueta.md §3: píldoras C19, chips C22 y C25, filas como Movimientos PDF p. 3).

type Filtro = 'todos' | 'abono' | 'puntual' | 'deben' | 'inactivos';

const FILTROS: { id: Filtro; nombre: string }[] = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'abono', nombre: 'Abono' },
  { id: 'puntual', nombre: 'Puntual' },
  { id: 'deben', nombre: 'Te deben' },
  { id: 'inactivos', nombre: 'Inactivos' },
];

const FRECUENCIAS: Record<Frecuencia, string> = {
  semanal: 'cada semana',
  quincenal: 'cada 15 días',
  mensual: 'cada mes',
  personalizada: 'a medida',
};

/** "Abono 90 €/mes · cada 15 días", "Abono 90 €/mes" o "Puntual". */
export function textoModalidad(c: Cliente, conFrecuencia = true): string {
  if (c.modalidad !== 'abono') return 'Puntual';
  const base = `Abono ${formatearEuros(c.cuota_abono ?? 0)}/mes`;
  return conFrecuencia && c.frecuencia_visitas ? `${base} · ${FRECUENCIAS[c.frecuencia_visitas]}` : base;
}

/** Chips Jardín (lima suave) y Piscina (azul suave), maqueta p. 4 (C25). */
export function ChipsServicio({ cliente }: { cliente: Cliente }) {
  return (
    <>
      {cliente.servicios.includes('jardin') && <span className="chip-servicio jardin">Jardín</span>}
      {cliente.servicios.includes('piscina') && <span className="chip-servicio piscina">Piscina</span>}
    </>
  );
}

/** Lo que debe un cliente: total, pendiente más antiguo, días y nivel de color (§9.4). */
export interface ResumenDeuda {
  total: number;
  pendientes: Pendiente[];
  dias: number;
  nivel: Nivel;
}

export function resumirDeudas(pendientes: Pendiente[], ahora: Date = new Date()): Map<string, ResumenDeuda> {
  const hoy = claveDia(ahora);
  const mapa = new Map<string, ResumenDeuda>();
  // Los pendientes llegan del más antiguo al más reciente: el primero de cada cliente fija la antigüedad.
  for (const p of pendientes) {
    const r = mapa.get(p.cliente_id);
    if (r) {
      r.total += p.pendiente;
      r.pendientes.push(p);
    } else {
      const dias = Math.max(0, diasEntre(p.desde, hoy));
      mapa.set(p.cliente_id, { total: p.pendiente, pendientes: [p], dias, nivel: nivelAntiguedad(dias) });
    }
  }
  return mapa;
}

/** Sin mayúsculas ni acentos, para buscar "alvaro" y encontrar "Álvaro". */
export const sinAcentos = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function coincide(c: Cliente, busqueda: string): boolean {
  const q = sinAcentos(busqueda.trim());
  if (!q) return true;
  const texto = sinAcentos([c.nombre, c.direccion, c.municipio, c.contacto].join(' '));
  if (texto.includes(q)) return true;
  const cifras = busqueda.replace(/\D/g, '');
  if (cifras.length < 3) return false;
  return [c.telefono, c.telefono_2].some((t) => t && t.replace(/\D/g, '').includes(cifras));
}

export function Clientes({ onAbrir, onNuevo }: { onAbrir: (id: string) => void; onNuevo: () => void }) {
  const datos = useDatos();
  const enLinea = useEnLinea();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const deudas = useMemo(
    () => (datos ? resumirDeudas(calcularPendientes(datos.clientes, datos.deudas, datos.movimientos)) : new Map<string, ResumenDeuda>()),
    [datos],
  );

  const lista = useMemo(() => {
    if (!datos) return [];
    const pasa = (c: Cliente) => {
      switch (filtro) {
        case 'abono': return c.activo && c.modalidad === 'abono';
        case 'puntual': return c.activo && c.modalidad === 'puntual';
        case 'deben': return deudas.has(c.id);
        case 'inactivos': return !c.activo;
        default: return c.activo;
      }
    };
    return datos.clientes
      .filter((c) => pasa(c) && coincide(c, busqueda))
      .sort((a, b) => {
        const da = deudas.get(a.id);
        const db = deudas.get(b.id);
        if (da && db) return da.pendientes[0].desde.localeCompare(db.pendientes[0].desde) || a.nombre.localeCompare(b.nombre, 'es');
        if (da) return -1;
        if (db) return 1;
        return a.nombre.localeCompare(b.nombre, 'es');
      });
  }, [datos, deudas, filtro, busqueda]);

  const puedeEditar = datos ? !datos.esColaborador : false;

  return (
    <main className="pantalla">
      {!enLinea && <BandaSinConexion />}
      <header className="cabecera-clientes">
        <h1 className="titulo-pantalla">Clientes</h1>
        {puedeEditar && (
          <button type="button" className="boton-icono tocable" aria-label="Nuevo cliente" onClick={onNuevo}>
            <Plus size={24} aria-hidden="true" />
          </button>
        )}
      </header>

      {!datos ? (
        <div aria-busy="true" aria-label="Cargando clientes">
          <div className="esqueleto" style={{ height: 48 }} />
          <div className="esqueleto" style={{ height: 44, marginTop: 14, width: '80%' }} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="esqueleto" style={{ height: 68, marginTop: 10 }} />
          ))}
        </div>
      ) : datos.clientes.length === 0 ? (
        <div className="tarjeta tarjeta-vacia">
          <p className="titulo">Aún no tienes clientes</p>
          {puedeEditar && (
            <>
              <p className="secundario" style={{ margin: '0 0 14px' }}>
                Con su ficha tienes a mano el teléfono, la dirección y lo que te deben.
              </p>
              <button type="button" className="boton-principal tocable" onClick={onNuevo}>
                Añadir el primero
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="buscador-clientes">
            <Search size={20} aria-hidden="true" />
            <input
              type="search"
              className="buscador"
              aria-label="Buscar cliente"
              placeholder="Nombre, dirección o teléfono"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="filtros" role="radiogroup" aria-label="Filtrar clientes">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={filtro === f.id}
                className="pildora tocable"
                onClick={() => setFiltro(f.id)}
              >
                {f.nombre}
              </button>
            ))}
          </div>

          {lista.length === 0 ? (
            <div className="tarjeta tarjeta-vacia" style={{ marginTop: 14 }}>
              <p className="titulo">Ningún cliente en este filtro</p>
              {busqueda && <p className="secundario" style={{ margin: 0 }}>Prueba con otra búsqueda.</p>}
            </div>
          ) : (
            <ul className="lista-clientes" aria-label="Lista de clientes">
              {lista.map((c) => (
                <li key={c.id}>
                  <FilaCliente cliente={c} deuda={deudas.get(c.id)} onAbrir={onAbrir} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function FilaCliente({ cliente, deuda, onAbrir }: { cliente: Cliente; deuda?: ResumenDeuda; onAbrir: (id: string) => void }) {
  return (
    <button type="button" className={`fila-cliente tocable${cliente.activo ? '' : ' inactivo'}`} onClick={() => onAbrir(cliente.id)}>
      <span className="textos">
        <span className="nombre">{cliente.nombre}</span>
        <span className="linea">
          <ChipsServicio cliente={cliente} />
          <span className="secundario">{textoModalidad(cliente, false)}</span>
          {!cliente.activo && <span className="chip-estado neutro">Inactivo</span>}
        </span>
      </span>
      {deuda && (
        <span className="deuda" data-nivel={deuda.nivel}>
          <span className={`chip-estado ${deuda.nivel}`}>Te debe {formatearEuros(deuda.total)}</span>
          <span className={`secundario${deuda.nivel === 'neutro' ? '' : ` antiguedad-${deuda.nivel}`}`}>{textoAntiguedad(deuda.dias)}</span>
        </span>
      )}
    </button>
  );
}
