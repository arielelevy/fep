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
import { desdeMadrid, partesMadrid } from '../lib/fechas';
import { useEnLinea } from '../lib/hooks';
import { ChipsServicio, resumirDeudas, textoModalidad } from './Clientes';
import { BandaSinConexion } from './Hoy';
import '../styles/clientes.css';

// Ficha de cliente (§10.4.2). Construida a rajatabla contra la maqueta, PDF p. 4 (docs/maqueta.md §1.4):
// "‹ Clientes", nombre 26 pt y chips (C24, C25), tres acciones rápidas de 64 pt (C28), tarjeta de deuda
// con "Ya pagó" (C29), NOTAS (C30), ESTE AÑO (C31) y ÚLTIMAS VISITAS (C32). Añadidos de la especificación
// que la maqueta no muestra: "Editar", "Ver movimientos", "Desactivar cliente" y la deuda en rojo con 15+ días.

/** Enlace de "Cómo llegar": coordenadas si las hay; si no, dirección y municipio. */
export function enlaceComoLlegar(c: Pick<Cliente, 'lat' | 'lon' | 'direccion' | 'municipio'>): string | null {
  if (c.lat !== null && c.lon !== null) return `https://maps.apple.com/?daddr=${c.lat},${c.lon}&dirflg=d`;
  if (!c.direccion.trim()) return null;
  const destino = [c.direccion.trim(), c.municipio.trim()].filter(Boolean).join(', ');
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destino)}&dirflg=d`;
}

export function ClienteFicha({
  clienteId,
  onVolver,
  onEditar,
  onYaPago,
  onTrabajoHecho,
  onVerMovimientos,
}: {
  clienteId: string;
  onVolver: () => void;
  onEditar: () => void;
  onYaPago: (clienteId: string) => void;
  onTrabajoHecho: (clienteId: string) => void;
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
}: {
  cliente: Cliente;
  volver: ReactNode;
  soloLectura: boolean;
  onEditar: () => void;
  onYaPago: (clienteId: string) => void;
  onTrabajoHecho: (clienteId: string) => void;
  onVerMovimientos: (clienteId: string) => void;
}) {
  const datos = useDatos()!;
  const { mostrar } = useDeshacer();
  const [confirmar, setConfirmar] = useState(false);
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
  const llegar = enlaceComoLlegar(cliente);

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
        <p className="secundario visitas-vacio">Las visitas aparecerán aquí cuando la agenda esté lista.</p>
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
