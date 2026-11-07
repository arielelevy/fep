import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Dialogo } from '../components/Dialogo';
import { useDeshacer } from '../components/Deshacer';
import { useDatos } from '../db/datos';
import { editarCliente } from '../db/repo';
import { margenCliente } from '../domain/cifras';
import { calcularPendientes, textoAntiguedad } from '../domain/pendientes';
import type { Cliente } from '../domain/tipos';
import { formatearEuros } from '../lib/dinero';
import { MESES, claveDia, desdeMadrid, partesMadrid } from '../lib/fechas';
import { horaDe } from '../domain/agenda';
import { useEnLinea } from '../lib/hooks';
import { urlComoLlegar } from '../lib/mapas';
import { UbicacionFicha } from '../clientes/ubicacion/UbicacionCliente';
import { ChipsServicio, resumirDeudas, textoModalidad } from './Clientes';
import { BandaSinConexion } from './Hoy';
import '../styles/clientes.css';
import '../styles/agenda.css';

// Ficha de cliente (§10.4.2). Construida a rajatabla contra la maqueta, PDF p. 4 (docs/maqueta.md §1.4):
// "‹ Clientes", nombre 26 pt y chips (C24, C25), tres acciones rápidas de 64 pt (C28), tarjeta de deuda
// con "Ya pagó" (C29), NOTAS (C30), ESTE AÑO (C31) y ÚLTIMAS VISITAS (C32). Añadidos de la especificación
// que la maqueta no muestra: "Editar", "Ver movimientos", "Desactivar cliente" y la deuda en rojo con 15+ días.

export function ClienteFicha({
  clienteId,
  onVolver,
  onEditar,
  onYaPago,
  onTrabajoHecho,
  onVerMovimientos,
  onAbrirVisita,
}: {
  clienteId: string;
  onVolver: () => void;
  onEditar: () => void;
  onYaPago: (clienteId: string) => void;
  onTrabajoHecho: (clienteId: string) => void;
  /** Abre el detalle de una visita (ola 5). */
  onAbrirVisita?: (visitaId: string) => void;
  onVerMovimientos: (clienteId: string) => void;
}) {
  const datos = useDatos();
  const enLinea = useEnLinea();
  const cliente = datos?.clientes.find((c) => c.id === clienteId);

  const volver = (
    <button type="button" className="volver tocable" aria-label="Volver a Clientes" onClick={onVolver}>
      <ChevronLeft size={20} aria-hidden="true" />
      Clientes
    </button>
  );

  if (!datos) {
    return (
      <main className="pantalla" aria-busy="true" aria-label="Cargando cliente">
        {volver}
        <div className="esqueleto" style={{ height: 32, width: '70%', marginTop: 6 }} />
        <div className="esqueleto" style={{ height: 26, width: '85%', marginTop: 10 }} />
        <div className="acciones-rapidas">
          {[0, 1, 2].map((i) => (
            <div key={i} className="esqueleto" style={{ height: 64 }} />
          ))}
        </div>
        <div className="esqueleto" style={{ height: 96, marginTop: 12 }} />
        <div className="esqueleto" style={{ height: 96, marginTop: 12 }} />
      </main>
    );
  }

  if (!cliente) {
    return (
      <main className="pantalla">
        {volver}
        <div className="tarjeta tarjeta-vacia" style={{ marginTop: 12 }}>
          <p className="titulo">Este cliente ya no está</p>
          <p className="secundario" style={{ margin: 0 }}>
            Vuelve a Clientes para ver los que tienes.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="pantalla">
      {!enLinea && <BandaSinConexion />}
      <Ficha
        cliente={cliente}
        volver={volver}
        soloLectura={datos.esColaborador}
        onEditar={onEditar}
        onYaPago={onYaPago}
        onTrabajoHecho={onTrabajoHecho}
        onAbrirVisita={onAbrirVisita}
        onVerMovimientos={onVerMovimientos}
      />
    </main>
  );
}

function Ficha({
  cliente,
  volver,
  soloLectura,
  onEditar,
  onYaPago,
  onTrabajoHecho,
  onVerMovimientos,
  onAbrirVisita,
}: {
  cliente: Cliente;
  volver: ReactNode;
  soloLectura: boolean;
  onEditar: () => void;
  onYaPago: (clienteId: string) => void;
  onTrabajoHecho: (clienteId: string) => void;
  /** Abre el detalle de una visita (ola 5). */
  onAbrirVisita?: (visitaId: string) => void;
  onVerMovimientos: (clienteId: string) => void;
}) {
  const datos = useDatos()!;
  const { mostrar } = useDeshacer();
  const [confirmar, setConfirmar] = useState(false);
  const [todasVisitas, setTodasVisitas] = useState(false);
  // Últimas visitas (§10.4.2.7): la próxima programada y las 5 más recientes (con "Ver todas" si hay más).
  const hoy = claveDia(new Date());
  const delCliente = datos.visitas.filter((v) => v.cliente_id === cliente.id);
  const proxima = delCliente
    .filter((v) => v.estado === 'programada' && v.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || horaDe(a).localeCompare(horaDe(b)))[0];
  const pasadas = delCliente
    .filter((v) => v !== proxima && (v.fecha < hoy || v.estado !== 'programada'))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || horaDe(b).localeCompare(horaDe(a)));
  const listaVisitas = [...(proxima ? [proxima] : []), ...(todasVisitas ? pasadas : pasadas.slice(0, 5))];
  const [error, setError] = useState('');

  const deuda = useMemo(
    () => resumirDeudas(calcularPendientes(datos.clientes, datos.deudas, datos.movimientos, new Date(), cliente.id)).get(cliente.id),
    [datos, cliente.id],
  );

  const anio = partesMadrid(new Date()).anio;
  const esteAnio = useMemo(
    () => margenCliente(datos.movimientos, cliente.id, desdeMadrid(anio, 1, 1, 0, 0).toISOString(), desdeMadrid(anio + 1, 1, 1, 0, 0).toISOString()),
    [datos.movimientos, cliente.id, anio],
  );

  const tel = cliente.telefono;
  const llegar = urlComoLlegar(cliente);

  const cambiarActivo = async () => {
    setConfirmar(false);
    try {
      const r = await editarCliente(cliente.id, { activo: !cliente.activo });
      mostrar(cliente.activo ? 'Cliente desactivado' : 'Cliente reactivado', r.deshacer);
    } catch (e) {
      console.error(e);
      setError('No se pudo guardar el cambio. Vuelve a intentarlo.');
    }
  };

  return (
    <>
      <div className="cabecera-ficha">
        {volver}
        {!soloLectura && (
          <button type="button" className="boton-editar tocable" onClick={onEditar}>
            Editar
          </button>
        )}
      </div>

      <h1 className="titulo-pantalla ficha-nombre">{cliente.nombre}</h1>
      <div className="chips-cliente">
        <ChipsServicio cliente={cliente} />
        <span className="chip-servicio modalidad">{textoModalidad(cliente)}</span>
        {!cliente.activo && <span className="chip-servicio inactivo">Inactivo</span>}
      </div>

      <div className="acciones-rapidas">
        {tel ? (
          <>
            <a className="accion-rapida principal tocable" href={`tel:${tel}`} target="_blank" rel="noopener noreferrer">
              <Phone size={22} aria-hidden="true" />
              Llamar
            </a>
            <a className="accion-rapida tocable" href={`https://wa.me/${tel.replace(/^\+/, '')}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={22} aria-hidden="true" />
              WhatsApp
            </a>
          </>
        ) : (
          <>
            <button type="button" className="accion-rapida desactivada tocable" disabled={soloLectura} onClick={onEditar}>
              <Phone size={22} aria-hidden="true" />
              Añadir teléfono
            </button>
            <button type="button" className="accion-rapida" disabled aria-label="WhatsApp, sin teléfono">
              <MessageCircle size={22} aria-hidden="true" />
              WhatsApp
            </button>
          </>
        )}
        {llegar ? (
          <a className="accion-rapida tocable" href={llegar} target="_blank" rel="noopener noreferrer">
            <MapPin size={22} aria-hidden="true" />
            Cómo llegar
          </a>
        ) : (
          <button type="button" className="accion-rapida desactivada tocable" disabled={soloLectura} onClick={onEditar}>
            <MapPin size={22} aria-hidden="true" />
            Añadir dirección
          </button>
        )}
      </div>

      {deuda && (
        <section className={`tarjeta-deuda${deuda.nivel === 'rojo' ? ' rojo' : ''}`} data-nivel={deuda.nivel === 'rojo' ? 'rojo' : 'ambar'} aria-label="Deuda">
          <div className="textos">
            <span className="total">Te debe {formatearEuros(deuda.total)}</span>
            <span className="detalle">
              {deuda.pendientes[0].concepto} · {textoAntiguedad(deuda.dias)}
              {deuda.pendientes.length > 1 && ` y ${deuda.pendientes.length - 1} más`}
            </span>
          </div>
          {!soloLectura && (
            <button type="button" className="boton-ya-pago tocable" onClick={() => onYaPago(cliente.id)}>
              Ya pagó
            </button>
          )}
        </section>
      )}

      <Notas cliente={cliente} soloLectura={soloLectura} />

      {/* Ubicación con chincheta (§10.4.3, §13.3; ola 6 frente B): se usa para el tiempo de cada visita. */}
      <UbicacionFicha cliente={cliente} soloLectura={soloLectura} />

      <section className="tarjeta tarjeta-ficha" aria-labelledby="ficha-este-anio">
        <h2 id="ficha-este-anio" className="etiqueta-seccion">
          Este año
        </h2>
        <dl className="metricas" style={{ margin: 0 }}>
          <div>
            <dt>Cobrado</dt>
            <dd data-testid="cobrado-anio">{formatearEuros(esteAnio.cobrado)}</dd>
          </div>
          <div>
            <dt>Gastado</dt>
            <dd data-testid="gastado-anio">{formatearEuros(esteAnio.gastado)}</dd>
          </div>
          <div>
            <dt>Te queda</dt>
            <dd data-testid="margen-anio" className={esteAnio.margen > 0 ? 'positivo' : undefined}>
              {formatearEuros(esteAnio.margen)}
            </dd>
          </div>
        </dl>
      </section>

      <h2 className="etiqueta-seccion">Últimas visitas</h2>
      <section className="tarjeta" aria-label="Últimas visitas">
        {listaVisitas.length === 0 ? (
          <p className="secundario visitas-vacio">Aún no hay visitas de este cliente.</p>
        ) : (
          <ul className="lista-visitas-cliente" style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
            {listaVisitas.map((v) => {
              const [, m, d] = v.fecha.split('-').map(Number);
              const dia = v.fecha === hoy ? 'Hoy' : `${d} ${MESES[m - 1].slice(0, 3)}`;
              const trabajo = v.descripcion || v.tipos_trabajo.join(', ');
              const estado = v.estado === 'hecha' ? 'Hecha' : v.estado === 'cancelada' ? 'Cancelada' : 'Programada';
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    className="fila tocable"
                    style={{ paddingLeft: 0, paddingRight: 0 }}
                    onClick={() => onAbrirVisita?.(v.id)}
                    aria-label={`${dia} · ${trabajo}: ${estado}`}
                  >
                    <span className="nombre" style={{ flex: 1 }}>{dia} · {trabajo}</span>
                    <span className={`chip-estado ${v.estado === 'hecha' ? 'hecha' : 'neutro'}`}>{estado}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pasadas.length > 5 && !todasVisitas && (
          <button type="button" className="boton-texto tocable" onClick={() => setTodasVisitas(true)}>
            Ver todas
          </button>
        )}
        {!soloLectura && cliente.activo && (
          <button type="button" className="boton-secundario tocable" onClick={() => onTrabajoHecho(cliente.id)}>
            Trabajo hecho
          </button>
        )}
      </section>

      <button type="button" className="boton-texto enlace-movimientos tocable" onClick={() => onVerMovimientos(cliente.id)}>
        Ver movimientos
      </button>

      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}

      {!soloLectura && (
        <div className="zona-desactivar">
          {cliente.activo ? (
            <button type="button" className="boton-peligro tocable" onClick={() => setConfirmar(true)}>
              Desactivar cliente
            </button>
          ) : (
            <button type="button" className="boton-secundario tocable" onClick={() => setConfirmar(true)}>
              Reactivar cliente
            </button>
          )}
        </div>
      )}

      {confirmar &&
        (cliente.activo ? (
          <Dialogo
            titulo={`¿Desactivar a ${cliente.nombre}?`}
            texto="Deja de generar cobros. Su historial se conserva."
            principal="Desactivar"
            secundario="Cancelar"
            onPrincipal={cambiarActivo}
            onSecundario={() => setConfirmar(false)}
          />
        ) : (
          <Dialogo
            titulo={`¿Reactivar a ${cliente.nombre}?`}
            texto="Vuelve a aparecer en tu lista y, si tiene abono, a generar cobros."
            principal="Reactivar"
            secundario="Cancelar"
            onPrincipal={cambiarActivo}
            onSecundario={() => setConfirmar(false)}
          />
        ))}
    </>
  );
}

/** NOTAS (C30): texto libre, editable con un toque; se guarda al salir del campo. */
function Notas({ cliente, soloLectura }: { cliente: Cliente; soloLectura: boolean }) {
  const { mostrar } = useDeshacer();
  const [borrador, setBorrador] = useState<string | null>(null); // null = no se está editando
  const [error, setError] = useState('');

  const guardar = async () => {
    const texto = borrador;
    setBorrador(null);
    if (texto === null || texto.trim() === cliente.notas.trim()) return;
    try {
      const r = await editarCliente(cliente.id, { notas: texto.trim() });
      setError('');
      mostrar('Notas guardadas', r.deshacer);
    } catch (e) {
      console.error(e);
      setBorrador(texto);
      setError('No se pudieron guardar las notas. Lo que has escrito sigue aquí; vuelve a intentarlo.');
    }
  };

  return (
    <section className="tarjeta tarjeta-ficha" aria-labelledby="ficha-notas">
      <h2 id="ficha-notas" className="etiqueta-seccion">
        Notas
      </h2>
      {soloLectura ? (
        <p className={cliente.notas ? 'notas-texto' : 'notas-texto secundario'}>{cliente.notas || 'Sin notas.'}</p>
      ) : (
        <textarea
          className="notas-campo"
          aria-labelledby="ficha-notas"
          placeholder="Toca para añadir notas: llaves, perro, lo que no hay que tocar…"
          value={borrador ?? cliente.notas}
          onFocus={() => setBorrador((b) => b ?? cliente.notas)}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={guardar}
          rows={3}
        />
      )}
      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
