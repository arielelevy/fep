import { useEffect, useId, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Dialogo } from '../components/Dialogo';
import { useDeshacer } from '../components/Deshacer';
import { useDatos } from '../db/datos';
import { db } from '../db/db';
import { crearSerie, crearVisita, editarSerieDesde, editarVisita, type DatosVisita, type Deshacer } from '../db/repo';
import { textoDuracion } from '../domain/agenda';
import { TIPOS_TRABAJO, type Cliente, type FrecuenciaSerie, type TipoTrabajo, type Visita } from '../domain/tipos';
import { centimosATexto, formatearMientrasEscribe, parsearImporte } from '../lib/dinero';
import { claveDia, diaSemanaDeClave } from '../lib/fechas';
import { useCerrojo } from '../lib/hooks';
import { ElegirCliente } from './RegistrarDinero';
import '../styles/clientes.css';
import '../styles/agenda.css';

// Nueva / Editar visita (§7.2, §8.4, §8.5). Sin maqueta; decisión H10 (docs/maqueta.md §4.1): estilo de la maqueta.
// Hoja modal como Registrar (PDF p. 2: cabecera con X C9, filas C13, chips C14, botón lima C16), con los campos
// del formulario de cliente (ClienteForm). En alta también crea series («Se repite»).

type Repite = 'no' | FrecuenciaSerie;
const REPETICIONES: { id: Repite; nombre: string }[] = [
  { id: 'no', nombre: 'No' },
  { id: 'semanal', nombre: 'Cada semana' },
  { id: 'quincenal', nombre: 'Cada 15 días' },
  { id: 'mensual', nombre: 'Cada mes' },
];
const DURACIONES = [60, 90, 120, 180];

interface Borrador {
  clienteId: string;
  fecha: string;
  hora: string;
  duracion: string;
  tipos: TipoTrabajo[];
  descripcion: string;
  abono: boolean;
  precio: string;
  furgoneta: boolean;
  ayudantes: number;
  repite: Repite;
  hasta: string;
}

function desdeVisita(v: Visita): Borrador {
  return {
    clienteId: v.cliente_id,
    fecha: v.fecha,
    hora: v.hora_inicio ?? '',
    duracion: String(v.duracion),
    tipos: v.tipos_trabajo,
    descripcion: v.descripcion,
    abono: v.incluida_en_abono,
    precio: v.precio ? centimosATexto(v.precio) : '',
    furgoneta: v.requiere_vehiculo,
    ayudantes: v.ayudantes,
    repite: 'no',
    hasta: '',
  };
}

/** Precarga desde la ficha del cliente (§7.2): trabajo, duración, precio si es puntual, furgoneta, ayudantes y hora. */
function conCliente(b: Borrador, c: Cliente): Borrador {
  const abono = c.modalidad === 'abono';
  return {
    ...b,
    clienteId: c.id,
    tipos: c.tipos_trabajo_habituales.length ? c.tipos_trabajo_habituales : b.tipos,
    duracion: String(c.duracion_habitual || b.duracion),
    abono,
    precio: !abono && c.precio_habitual ? centimosATexto(c.precio_habitual) : '',
    furgoneta: c.requiere_vehiculo_por_defecto,
    ayudantes: c.ayudantes_por_defecto,
    hora: c.hora_preferida ?? b.hora,
  };
}

const vacio = (fecha: string): Borrador => ({
  clienteId: '',
  fecha,
  hora: '',
  duracion: '120',
  tipos: [],
  descripcion: '',
  abono: false,
  precio: '',
  furgoneta: false,
  ayudantes: 0,
  repite: 'no',
  hasta: '',
});

/** Primera visita viva de una serie (para devolverla a quien abrió la hoja). */
async function primeraDeSerie(serieId: string): Promise<Visita | undefined> {
  const vs = (await db.visitas.where('serie_id').equals(serieId).toArray()).filter((v) => !v.eliminado_en);
  return vs.sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
}

export function VisitaForm({
  visita,
  fechaInicial,
  clienteInicial,
  onCerrar,
}: {
  visita?: Visita;
  fechaInicial?: string;
  clienteInicial?: string;
  onCerrar: (guardada?: Visita) => void;
}) {
  const datos = useDatos();
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo(); // evita crear la visita dos veces con un doble toque
  const id = useId();
  const [original, setOriginal] = useState<Borrador>(() => (visita ? desdeVisita(visita) : vacio(fechaInicial ?? claveDia(new Date()))));
  const [b, setB] = useState<Borrador>(original);
  const [elegir, setElegir] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [preguntarSerie, setPreguntarSerie] = useState(false);
  const [precargado, setPrecargado] = useState(Boolean(visita) || !clienteInicial);
  const [error, setError] = useState('');

  // Cliente inicial (p. ej. desde la ficha): se precarga en cuanto llegan los datos, sin contar como cambio.
  useEffect(() => {
    if (precargado || !datos) return;
    const c = datos.clientes.find((x) => x.id === clienteInicial && x.activo);
    if (c) {
      const n = conCliente(b, c);
      setB(n);
      setOriginal(n);
    }
    setPrecargado(true);
  }, [datos, precargado, clienteInicial, b]);

  const poner = <K extends keyof Borrador>(clave: K, valor: Borrador[K]) => setB((x) => ({ ...x, [clave]: valor }));
  const alternarTipo = (t: TipoTrabajo) => poner('tipos', b.tipos.includes(t) ? b.tipos.filter((x) => x !== t) : [...b.tipos, t]);

  const cliente = datos?.clientes.find((c) => c.id === b.clienteId);
  const duracion = Number(b.duracion);
  const duracionValida = Number.isInteger(duracion) && duracion > 0 && duracion <= 1440;
  const precio = !b.abono && b.precio ? parsearImporte(b.precio) : null;
  const precioValido = b.abono || b.precio === '' || (precio !== null && precio > 0);
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha);
  const hastaValido = b.repite === 'no' || b.hasta === '' || b.hasta >= b.fecha;
  const valido = Boolean(b.clienteId) && fechaValida && b.tipos.length > 0 && duracionValida && precioValido && hastaValido;
  const hayCambios = JSON.stringify(b) !== JSON.stringify(original);

  const cerrar = () => (hayCambios ? setDescartar(true) : onCerrar());

  const datosVisita = (): DatosVisita => ({
    cliente_id: b.clienteId,
    fecha: b.fecha,
    hora_inicio: b.hora || null,
    duracion,
    tipos_trabajo: b.tipos,
    descripcion: b.descripcion.trim(),
    precio: b.abono ? null : precio,
    incluida_en_abono: b.abono,
    requiere_vehiculo: b.furgoneta,
    ayudantes: b.ayudantes,
  });

  /** Solo los campos que cambian respecto a la visita (para «Esta y las siguientes»). */
  const cambiosVisita = (v: Visita): Partial<DatosVisita> => {
    const d = datosVisita();
    const salida: Partial<DatosVisita> = {};
    for (const k of Object.keys(d) as (keyof DatosVisita)[]) {
      if (JSON.stringify(d[k]) !== JSON.stringify(v[k])) (salida as Record<string, unknown>)[k] = d[k];
    }
    return salida;
  };

  const ejecutar = async (accion: () => Promise<{ visita?: Visita; deshacer: Deshacer }>) => {
    if (!cerrojo.tomar()) return;
    try {
      const r = await accion();
      onCerrar(r.visita);
      mostrar('Visita guardada', r.deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError(
        e instanceof Error && e.name === 'SinPermiso'
          ? e.message
          : 'No se pudo guardar. Lo que has escrito sigue aquí; vuelve a intentarlo.',
      );
    }
  };

  const guardar = () => {
    if (!valido || cerrojo.ocupado) return;
    if (visita) {
      if (visita.serie_id) {
        setPreguntarSerie(true);
        return;
      }
      void ejecutar(() => editarVisita(visita.id, datosVisita()));
      return;
    }
    if (b.repite === 'no') {
      void ejecutar(() => crearVisita(datosVisita()));
      return;
    }
    const d = datosVisita();
    const frecuencia = b.repite;
    void ejecutar(async () => {
      const r = await crearSerie({
        cliente_id: d.cliente_id,
        regla: { frecuencia, dias_semana: [diaSemanaDeClave(d.fecha)], hora: d.hora_inicio, duracion: d.duracion },
        fecha_inicio: d.fecha,
        fecha_fin: b.hasta || null,
        plantilla_visita: {
          tipos_trabajo: d.tipos_trabajo,
          descripcion: d.descripcion,
          ayudantes: d.ayudantes,
          requiere_vehiculo: d.requiere_vehiculo,
          precio: d.precio,
          incluida_en_abono: d.incluida_en_abono,
        },
      });
      return { visita: await primeraDeSerie(r.serie.id), deshacer: r.deshacer };
    });
  };

  const soloEsta = () => {
    setPreguntarSerie(false);
    if (visita) void ejecutar(() => editarVisita(visita.id, datosVisita()));
  };
  const estaYSiguientes = () => {
    setPreguntarSerie(false);
    if (!visita) return;
    const cambios = cambiosVisita(visita);
    void ejecutar(async () => {
      const r = await editarSerieDesde(visita.id, {
        visita: cambios,
        regla: cambios.fecha ? { dias_semana: [diaSemanaDeClave(cambios.fecha)] } : undefined,
      });
      return { visita: await primeraDeSerie(r.serie.id), deshacer: r.deshacer };
    });
  };

  const chips = <T extends string | number>(
    etiqueta: string,
    opciones: { id: T; nombre: string; largo?: string }[],
    marcado: (v: T) => boolean,
    pulsar: (v: T) => void,
    multiple: boolean,
    clase = '',
  ) => {
    const idEtiqueta = `${id}-${etiqueta.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-')}`;
    return (
      <div className="cf-campo">
        <span className="cf-etiqueta" id={idEtiqueta}>
          {etiqueta}
        </span>
        <div className={`cf-chips ${clase}`} role={multiple ? 'group' : 'radiogroup'} aria-labelledby={idEtiqueta}>
          {opciones.map((o) => (
            <button
              key={String(o.id)}
              type="button"
              role={multiple ? 'checkbox' : 'radio'}
              aria-checked={marcado(o.id)}
              aria-label={o.largo}
              className="chip tocable"
              onClick={() => pulsar(o.id)}
            >
              {o.nombre}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const titulo = visita ? 'Editar visita' : 'Nueva visita';

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
        <header className="hoja-cabecera">
          <h1 id={`${id}-titulo`}>{titulo}</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={cerrar}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>

        <div className="hoja-cuerpo">
          <div className="filas" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="fila fila-cliente-visita tocable"
              aria-label={cliente ? `Cliente: ${cliente.nombre}. Cambiar` : 'Cliente (obligatorio): elegir'}
              onClick={() => setElegir(true)}
            >
              <span className="nombre">Cliente</span>
              <span className={`valor${cliente ? ' fuerte' : ''}`}>
                {cliente ? cliente.nombre : 'Elegir'}
                <ChevronRight size={18} aria-hidden="true" />
              </span>
            </button>
          </div>

          <div className="cf-seccion">
            <div className="cf-cuerpo" style={{ paddingTop: 16 }}>
              <label className="cf-campo">
                <span className="cf-etiqueta">
                  Fecha<span className="cf-obligatorio"> (obligatorio)</span>
                </span>
                <input type="date" value={b.fecha} aria-required="true" onChange={(e) => poner('fecha', e.target.value)} />
              </label>
              <label className="cf-campo">
                <span className="cf-etiqueta">Hora</span>
                <input type="time" value={b.hora} onChange={(e) => poner('hora', e.target.value)} />
              </label>
              <div className="cf-campo">
                <span className="cf-etiqueta" id={`${id}-duracion`}>
                  Duración
                </span>
                <div className="cf-duracion">
                  <div className="cf-chips" role="radiogroup" aria-labelledby={`${id}-duracion`}>
                    {DURACIONES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={duracion === m}
                        className="chip tocable"
                        onClick={() => poner('duracion', String(m))}
                      >
                        {textoDuracion(m)}
                      </button>
                    ))}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={15}
                      aria-label="Duración en minutos"
                      value={b.duracion}
                      aria-invalid={!duracionValida || undefined}
                      onChange={(e) => poner('duracion', e.target.value)}
                    />
                    <span className="secundario">min</span>
                  </label>
                </div>
                {!duracionValida && <p className="cf-error">Pon los minutos que dura</p>}
              </div>
              {chips('Tipos de trabajo (al menos uno)', TIPOS_TRABAJO, (v) => b.tipos.includes(v), alternarTipo, true)}
              <label className="cf-campo">
                <span className="cf-etiqueta">Descripción</span>
                <input type="text" value={b.descripcion} maxLength={120} placeholder="Opcional" onChange={(e) => poner('descripcion', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="cf-seccion">
            <div className="cf-cuerpo" style={{ paddingTop: 16 }}>
              <label className="cf-interruptor">
                <span>Incluida en el abono</span>
                <input type="checkbox" role="switch" checked={b.abono} onChange={(e) => poner('abono', e.target.checked)} />
              </label>
              {!b.abono && (
                <label className="cf-campo">
                  <span className="cf-etiqueta">Precio</span>
                  <span className="cf-importe">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={b.precio}
                      aria-invalid={!precioValido || undefined}
                      onChange={(e) => {
                        const n = formatearMientrasEscribe(e.target.value, b.precio);
                        if (n !== null) poner('precio', n);
                      }}
                    />
                    <span className="sufijo" aria-hidden="true">
                      €
                    </span>
                  </span>
                </label>
              )}
              <label className="cf-interruptor">
                <span>Necesita furgoneta</span>
                <input type="checkbox" role="switch" checked={b.furgoneta} onChange={(e) => poner('furgoneta', e.target.checked)} />
              </label>
              {chips(
                'Ayudantes',
                [0, 1, 2, 3, 4, 5].map((n) => ({ id: n, nombre: String(n), largo: n === 1 ? '1 ayudante' : `${n} ayudantes` })),
                (v) => b.ayudantes === v,
                (v) => poner('ayudantes', v),
                false,
                'dias',
              )}
            </div>
          </div>

          {!visita && (
            <div className="cf-seccion">
              <div className="cf-cuerpo" style={{ paddingTop: 16 }}>
                {chips('Se repite', REPETICIONES, (v) => b.repite === v, (v) => poner('repite', v), false)}
                {b.repite !== 'no' && (
                  <label className="cf-campo">
                    <span className="cf-etiqueta">Hasta (opcional)</span>
                    <input type="date" value={b.hasta} min={b.fecha} aria-invalid={!hastaValido || undefined} onChange={(e) => poner('hasta', e.target.value)} />
                    {!hastaValido && <p className="cf-error">La fecha final va después del primer día</p>}
                  </label>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="aviso-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="hoja-pie">
          <button type="button" className="boton-principal tocable" disabled={!valido || cerrojo.ocupado} onClick={guardar}>
            Guardar visita
          </button>
        </footer>
      </div>

      {elegir && datos && (
        <ElegirCliente
          clientes={datos.clientes.filter((x) => x.activo)}
          movs={datos.movimientos}
          onElegir={(c) => {
            setB((x) => conCliente(x, c));
            setElegir(false);
          }}
          onCerrar={() => setElegir(false)}
        />
      )}
      {descartar && (
        <Dialogo
          titulo="¿Descartar los cambios?"
          principal="Descartar"
          secundario="Seguir editando"
          onPrincipal={() => onCerrar()}
          onSecundario={() => setDescartar(false)}
        />
      )}
      {preguntarSerie && <DialogoSerie onSoloEsta={soloEsta} onSiguientes={estaYSiguientes} onCancelar={() => setPreguntarSerie(false)} />}
    </div>
  );
}

/** «¿Cambiar solo esta visita o también las siguientes?» (§8.5). Estilo de components/Dialogo.tsx, con 3 botones. */
function DialogoSerie({ onSoloEsta, onSiguientes, onCancelar }: { onSoloEsta: () => void; onSiguientes: () => void; onCancelar: () => void }) {
  const id = useId();
  return (
    <div className="dialogo-capa" onClick={onCancelar}>
      <div
        className="dialogo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancelar()}
      >
        <h2 id={`${id}-t`}>¿Cambiar solo esta visita o también las siguientes?</h2>
        <p>Las visitas anteriores no cambian.</p>
        <div className="acciones">
          <button type="button" className="boton-principal tocable" autoFocus onClick={onSoloEsta}>
            Solo esta visita
          </button>
          <button type="button" className="boton-secundario tocable" onClick={onSiguientes}>
            Esta y las siguientes
          </button>
          <button type="button" className="boton-texto tocable" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
