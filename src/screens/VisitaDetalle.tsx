import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useDeshacer } from '../components/Deshacer';
import { useDatos } from '../db/datos';
import { cancelarVisita, eliminarVisita } from '../db/repo';
import { estadoCobroVisita, horaFin, textoDuracion, textoFrecuencia } from '../domain/agenda';
import { TIPOS_TRABAJO, type MotivoReprogramacion, type Visita } from '../domain/tipos';
import { formatearEuros } from '../lib/dinero';
import { DIAS_LARGOS, MESES, diaSemanaDeClave, fechaLarga, instanteDeClaveDia } from '../lib/fechas';
import { useCerrojo, useEnLinea } from '../lib/hooks';
import { urlComoLlegar } from '../lib/mapas';
import { BandaSinConexion } from './Hoy';
import { MoverVisita } from './MoverVisita';
import '../styles/clientes.css';
import '../styles/agenda.css';

// Detalle de visita (§10.6). No tiene maqueta (docs/maqueta.md §4.1, H3): mismo estilo que la ficha de cliente
// (PDF p. 4: enlace «‹ …» C24, acciones rápidas C28, tarjetas) y que la Agenda (PDF p. 5). El tiempo es de otra
// ola: semáforo grande gris «Sin previsión» (§11.3).

const NOMBRE_MOTIVO: Record<MotivoReprogramacion, string> = { clima: 'clima', cliente: 'cliente', propio: 'propio', otro: 'otro' };

/** "2026-10-15 09:00" → «Movida desde el jueves 15 de octubre a las 09:00 (motivo: clima)». */
export function textoMovida(v: Pick<Visita, 'reprogramada_desde' | 'motivo_reprogramacion'>): string | null {
  if (!v.reprogramada_desde) return null;
  const [clave, hora] = v.reprogramada_desde.split(' ');
  const [, m, d] = clave.split('-').map(Number);
  let t = `Movida desde el ${DIAS_LARGOS[diaSemanaDeClave(clave)].toLowerCase()} ${d} de ${MESES[m - 1]}`;
  if (hora) t += ` a las ${hora}`;
  if (v.motivo_reprogramacion) t += ` (motivo: ${NOMBRE_MOTIVO[v.motivo_reprogramacion]})`;
  return t;
}

export function VisitaDetalle({
  visitaId,
  etiquetaVolver,
  onVolver,
  onEditar,
  onHecho,
  onAbrirCliente,
}: {
  visitaId: string;
  etiquetaVolver: string;
  onVolver: () => void;
  onEditar: (id: string) => void;
  onHecho: (id: string) => void;
  onAbrirCliente: (id: string) => void;
}) {
  const datos = useDatos();
  const enLinea = useEnLinea();
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo();
  const [mover, setMover] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [error, setError] = useState('');

  const volver = (
    <button type="button" className="volver tocable" aria-label={`Volver a ${etiquetaVolver}`} onClick={onVolver}>
      <ChevronLeft size={20} aria-hidden="true" />
      {etiquetaVolver}
    </button>
  );

  if (!datos) {
    return (
      <main className="pantalla" aria-busy="true" aria-label="Cargando visita">
        {volver}
        <div className="esqueleto" style={{ height: 32, width: '70%', marginTop: 6 }} />
        <div className="esqueleto" style={{ height: 22, width: '55%', marginTop: 10 }} />
        <div className="esqueleto" style={{ height: 110, marginTop: 14 }} />
        <div className="esqueleto" style={{ height: 96, marginTop: 12 }} />
      </main>
    );
  }

  const v = datos.visitas.find((x) => x.id === visitaId);
  if (!v) {
    return (
      <main className="pantalla">
        {volver}
        <div className="tarjeta tarjeta-vacia" style={{ marginTop: 12 }}>
          <p className="titulo">Esta visita ya no está</p>
          <button type="button" className="boton-secundario tocable" style={{ marginTop: 12 }} onClick={onVolver}>
            Volver
          </button>
        </div>
      </main>
    );
  }

  const cliente = datos.clientes.find((c) => c.id === v.cliente_id);
  const serie = v.serie_id ? datos.series.find((s) => s.id === v.serie_id) : undefined;
  const editable = !datos.esColaborador;
  const programada = v.estado === 'programada';
  const tel = cliente?.telefono ?? null;
  const llegar = cliente ? urlComoLlegar(cliente) : null;
  const cobro = estadoCobroVisita(v, datos.deudas, datos.movimientos);
  const movida = textoMovida(v);
  const tipos = v.tipos_trabajo.map((t) => TIPOS_TRABAJO.find((x) => x.id === t)?.nombre ?? t);

  const fallo = (e: unknown, texto: string) => {
    console.error(e);
    setError(e instanceof Error && e.name === 'SinPermiso' ? e.message : texto);
  };

  const confirmarCancelar = async (motivo: string) => {
    if (!cerrojo.tomar()) return;
    setCancelar(false);
    try {
      const r = await cancelarVisita(v.id, motivo);
      setError('');
      mostrar('Visita cancelada', r.deshacer);
    } catch (e) {
      fallo(e, 'No se pudo cancelar la visita. Vuelve a intentarlo.');
    } finally {
      cerrojo.soltar();
    }
  };

  const eliminar = async () => {
    if (!cerrojo.tomar()) return;
    try {
      const r = await eliminarVisita(v.id);
      mostrar('Visita eliminada', r.deshacer);
      onVolver();
    } catch (e) {
      cerrojo.soltar();
      fallo(e, 'No se pudo eliminar la visita. Vuelve a intentarlo.');
    }
  };

  return (
    <main className="pantalla">
      {!enLinea && <BandaSinConexion />}
      <div className="cabecera-ficha">{volver}</div>

      {cliente ? (
        <button type="button" className="detalle-cliente tocable" onClick={() => onAbrirCliente(cliente.id)}>
          {cliente.nombre}
        </button>
      ) : (
        <h1 className="titulo-pantalla">Cliente borrado</h1>
      )}
      <p className="detalle-fecha">{fechaLarga(instanteDeClaveDia(v.fecha))}</p>
      <p className="detalle-hora secundario">
        {v.hora_inicio ? `${v.hora_inicio} – ${horaFin(v.hora_inicio, v.duracion)}` : 'Sin hora fija'} · {textoDuracion(v.duracion)}
      </p>

      {v.estado !== 'programada' && (
        <div className="detalle-estado" aria-label="Estado de la visita">
          {v.estado === 'hecha' ? <span className="chip-estado verde">Hecha</span> : <span className="chip-estado neutro">Cancelada</span>}
          {cobro.estado === 'cobrada' && <span className="chip-estado verde">Cobrada</span>}
          {cobro.estado === 'pendiente' && <span className="chip-estado ambar">Pendiente de cobro: {formatearEuros(cobro.pendiente)}</span>}
          {cobro.estado === 'parcial' && <span className="chip-estado ambar">Cobro parcial: quedan {formatearEuros(cobro.pendiente)}</span>}
          {v.estado === 'cancelada' && v.motivo_cancelacion && <span className="secundario">Motivo: {v.motivo_cancelacion}</span>}
        </div>
      )}

      <section className="tarjeta detalle-tarjeta" aria-label="Trabajo">
        <h2 className="etiqueta-seccion">Trabajo</h2>
        <div className="chips-cliente" style={{ marginTop: 0 }}>
          {tipos.map((t) => (
            <span key={t} className="chip-servicio jardin">
              {t}
            </span>
          ))}
        </div>
        {v.descripcion && <p style={{ marginTop: 8 }}>{v.descripcion}</p>}
        <p style={{ marginTop: 8, fontWeight: 700 }}>
          {v.incluida_en_abono ? 'Incluida en el abono' : v.precio ? formatearEuros(v.precio) : 'Sin precio'}
        </p>
        {(v.requiere_vehiculo || v.ayudantes > 0) && (
          <div className="chips-cliente">
            {v.requiere_vehiculo && <span className="chip-estado ambar">Necesita furgoneta</span>}
            {v.ayudantes > 0 && <span className="chip-estado neutro">{v.ayudantes === 1 ? '+1 ayudante' : `+${v.ayudantes} ayudantes`}</span>}
          </div>
        )}
        {serie && <p className="secundario">Se repite {textoFrecuencia(serie.regla.frecuencia).toLowerCase()}</p>}
        {movida && <p className="secundario">{movida}</p>}
      </section>

      <section className="tarjeta detalle-tarjeta" aria-labelledby="tiempo-visita">
        <h2 className="etiqueta-seccion" id="tiempo-visita">
          Tiempo de la visita
        </h2>
        <div className="semaforo-grande">
          <span className="punto" aria-hidden="true" />
          <div>
            <span className="estado">Sin previsión</span>
            <p className="secundario">El tiempo llega en la próxima versión.</p>
          </div>
        </div>
      </section>

      {editable && programada && (
        <div className="acciones-visita">
          <button type="button" className="boton-principal tocable" onClick={() => onHecho(v.id)}>
            Hecho
          </button>
          <button type="button" className="boton-secundario tocable" onClick={() => setMover(true)}>
            Mover
          </button>
          <button type="button" className="boton-secundario tocable" onClick={() => onEditar(v.id)}>
            Editar
          </button>
        </div>
      )}

      <div className="acciones-rapidas">
        {tel ? (
          <a className="accion-rapida tocable" href={`tel:${tel}`} target="_blank" rel="noopener noreferrer">
            <Phone size={22} aria-hidden="true" />
            Llamar
          </a>
        ) : (
          <button type="button" className="accion-rapida" disabled aria-label="Llamar, sin teléfono">
            <Phone size={22} aria-hidden="true" />
            Llamar
          </button>
        )}
        {llegar ? (
          <a className="accion-rapida tocable" href={llegar} target="_blank" rel="noopener noreferrer">
            <MapPin size={22} aria-hidden="true" />
            Cómo llegar
          </a>
        ) : (
          <button type="button" className="accion-rapida" disabled aria-label="Cómo llegar, sin dirección">
            <MapPin size={22} aria-hidden="true" />
            Cómo llegar
          </button>
        )}
        {tel ? (
          <a className="accion-rapida tocable" href={`https://wa.me/${tel.replace(/^\+/, '')}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={22} aria-hidden="true" />
            WhatsApp
          </a>
        ) : (
          <button type="button" className="accion-rapida" disabled aria-label="WhatsApp, sin teléfono">
            <MessageCircle size={22} aria-hidden="true" />
            WhatsApp
          </button>
        )}
      </div>

      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}

      {editable && (
        <div className="zona-eliminar">
          {programada && (
            <button type="button" className="boton-peligro tocable" onClick={() => setCancelar(true)}>
              Cancelar visita
            </button>
          )}
          <button type="button" className="boton-eliminar-pequeno tocable" onClick={eliminar}>
            Eliminar visita
          </button>
        </div>
      )}

      {mover && <MoverVisita visita={v} onCerrar={() => setMover(false)} />}
      {cancelar && <DialogoCancelar onConfirmar={confirmarCancelar} onCerrar={() => setCancelar(false)} />}
    </main>
  );
}

/** Diálogo «¿Cancelar esta visita?» con motivo opcional; estilo de components/Dialogo.tsx (hoja inferior). */
function DialogoCancelar({ onConfirmar, onCerrar }: { onConfirmar: (motivo: string) => void; onCerrar: () => void }) {
  const id = useId();
  const [motivo, setMotivo] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="dialogo-capa" onClick={onCerrar}>
      <div
        className="dialogo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
      >
        <h2 id={`${id}-t`}>¿Cancelar esta visita?</h2>
        <p>Queda en el historial como cancelada.</p>
        <label className="cf-campo">
          <span className="cf-etiqueta">Motivo (opcional)</span>
          <input ref={ref} type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <div className="acciones">
          <button type="button" className="boton-principal tocable" onClick={() => onConfirmar(motivo)}>
            Cancelar visita
          </button>
          <button type="button" className="boton-secundario tocable" onClick={onCerrar}>
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}
