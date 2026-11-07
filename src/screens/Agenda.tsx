import { Fragment, useEffect, useMemo, useState } from 'react';
import { Bell, Phone, Plus } from 'lucide-react';
import { useDatos } from '../db/datos';
import { materializarSeries } from '../db/repo';
import { horaDe, textoDuracion, textoFrecuencia, visitasDelDia } from '../domain/agenda';
import { TIPOS_TRABAJO, type Cliente, type SerieRecurrente, type Visita } from '../domain/tipos';
import { formatearEuros } from '../lib/dinero';
import { DIAS_CORTOS, DIAS_LARGOS, claveDia, diaSemanaDeClave, partesMadrid, sumarDias } from '../lib/fechas';
import { useEnLinea } from '../lib/hooks';
import { BandaSinConexion } from './Hoy';
import '../styles/clientes.css';
import '../styles/agenda.css';

// Pestaña Agenda (§10.5). Sigue la maqueta «5. Agenda» (PDF p. 5, docs/maqueta.md §1.5, componentes C33–C36)
// con las correcciones de la especificación: franja de 14 días con separador «ORIENTATIVO» y días 8–14
// atenuados, subtítulo «Tiempo de los próximos 14 días», campana y botón «+». El clima es de otra ola:
// cada visita lleva la línea de semáforo gris «Sin previsión» (§11.3), sin iconos ni temperaturas.

export const DIAS_FRANJA = 14;
export const DIAS_FIABLES = 7;

/** Día seleccionado al abrir: hoy, o mañana si ya son más de las 20:00 en Madrid (§10.5). */
export function diaInicialAgenda(ahora: Date = new Date()): string {
  const hoy = claveDia(ahora);
  const p = partesMadrid(ahora);
  return p.hora * 60 + p.minuto > 20 * 60 ? sumarDias(hoy, 1) : hoy;
}

/** «Hoy», «Mañana, lunes 12» o «Jueves 15» (título del día, maqueta p. 5). */
export function tituloDia(dia: string, hoy: string): string {
  const n = Number(dia.slice(8, 10));
  const largo = DIAS_LARGOS[diaSemanaDeClave(dia)];
  if (dia === hoy) return 'Hoy';
  if (dia === sumarDias(hoy, 1)) return `Mañana, ${largo.toLowerCase()} ${n}`;
  return `${largo} ${n}`;
}

/** Descripción de la visita o, si no tiene, sus tipos de trabajo. */
export function textoTrabajo(v: Pick<Visita, 'descripcion' | 'tipos_trabajo'>): string {
  if (v.descripcion.trim()) return v.descripcion.trim();
  return v.tipos_trabajo.map((t) => TIPOS_TRABAJO.find((x) => x.id === t)?.nombre ?? t).join(', ');
}

/** «Cada 15 días · 60 €», «Trabajo puntual · 180 €», «Cada semana · Abono». */
export function textoPeriodo(v: Visita, serie: SerieRecurrente | undefined): { repite: boolean; texto: string } {
  const partes = [serie ? textoFrecuencia(serie.regla.frecuencia) : 'Trabajo puntual'];
  if (v.incluida_en_abono) partes.push('Abono');
  else if (v.precio) partes.push(formatearEuros(v.precio));
  return { repite: Boolean(serie), texto: partes.join(' · ') };
}

export const textoAyudantes = (n: number) => (n === 1 ? '+1 ayudante' : `+${n} ayudantes`);

export function Agenda({
  onAbrirVisita,
  onNuevaVisita,
  onAlertas,
}: {
  onAbrirVisita: (id: string) => void;
  onNuevaVisita: (dia: string) => void;
  onAlertas: () => void;
}) {
  const datos = useDatos();
  const enLinea = useEnLinea();
  const hoy = claveDia(new Date());
  const [dia, setDia] = useState(() => diaInicialAgenda());
  const esColaborador = datos?.esColaborador ?? false;

  // Las series se materializan con 8 semanas de antelación (§8.5): al abrir la Agenda se completan las que falten.
  useEffect(() => {
    materializarSeries(hoy).catch((e) => console.error('No se pudieron preparar las visitas de las series', e));
  }, [hoy]);

  const dias = useMemo(() => Array.from({ length: DIAS_FRANJA }, (_, i) => sumarDias(hoy, i)), [hoy]);
  const conVisitas = useMemo(() => {
    const s = new Set<string>();
    for (const v of datos?.visitas ?? []) if (v.estado !== 'cancelada') s.add(v.fecha);
    return s;
  }, [datos?.visitas]);

  const orientativo = dias.indexOf(dia) >= DIAS_FIABLES;
  const delDia = datos ? visitasDelDia(datos.visitas, dia) : [];

  return (
    <main className="pantalla" aria-labelledby="titulo-agenda">
      <header className="cabecera-agenda">
        <div className="textos">
          <h1 className="titulo-pantalla" id="titulo-agenda">
            Agenda
          </h1>
          <div className="subtitulo">Tiempo de los próximos 14 días</div>
        </div>
        <div className="acciones">
          <button type="button" className="boton-icono tocable" aria-label="Alertas" onClick={onAlertas}>
            <Bell size={22} aria-hidden="true" />
          </button>
          {datos && !esColaborador && (
            <button type="button" className="boton-icono tocable" aria-label="Nueva visita" onClick={() => onNuevaVisita(dia)}>
              <Plus size={24} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {!enLinea && <BandaSinConexion />}

      <div className="franja-dias" role="radiogroup" aria-label="Días">
        {dias.map((d, i) => {
          const n = Number(d.slice(8, 10));
          const ds = diaSemanaDeClave(d);
          const tiene = conVisitas.has(d);
          const atenuado = i >= DIAS_FIABLES;
          return (
            <Fragment key={d}>
              {i === DIAS_FIABLES && (
                <div className="franja-separador" aria-hidden="true">
                  <span>ORIENTATIVO</span>
                </div>
              )}
              <button
                type="button"
                role="radio"
                aria-checked={d === dia}
                aria-label={`${DIAS_LARGOS[ds]} ${n}${tiene ? ', con visitas' : ''}${atenuado ? ', orientativo' : ''}`}
                className={`dia-franja tocable${atenuado ? ' orientativo' : ''}`}
                data-dia={d}
                onClick={() => setDia(d)}
              >
                <span className="corto">{DIAS_CORTOS[ds]}</span>
                <span className="numero">{n}</span>
                <span className={`punto${tiene ? '' : ' vacio'}`} aria-hidden="true" />
              </button>
            </Fragment>
          );
        })}
      </div>

      <h2 className="titulo-seccion titulo-dia">{tituloDia(dia, hoy)}</h2>

      {!datos ? (
        <div aria-busy="true" aria-label="Cargando visitas">
          {[0, 1, 2].map((i) => (
            <div key={i} className="esqueleto" style={{ height: 96, marginTop: i ? 10 : 0 }} />
          ))}
        </div>
      ) : delDia.length === 0 ? (
        <div className="tarjeta tarjeta-vacia">
          <p className="titulo">Sin visitas este día</p>
          {!esColaborador && (
            <button type="button" className="boton-principal tocable ancho-total" style={{ marginTop: 12 }} onClick={() => onNuevaVisita(dia)}>
              Añadir visita
            </button>
          )}
        </div>
      ) : (
        <ul className="lista-visitas" aria-label="Visitas del día">
          {delDia.map((v) => (
            <TarjetaVisita
              key={v.id}
              visita={v}
              cliente={datos.clientes.find((c) => c.id === v.cliente_id)}
              serie={datos.series.find((s) => s.id === v.serie_id)}
              orientativo={orientativo}
              onAbrir={() => onAbrirVisita(v.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

/** Tarjeta de visita de la Agenda (C36, maqueta p. 5) con la línea de semáforo de §10.5.4. */
function TarjetaVisita({
  visita: v,
  cliente,
  serie,
  orientativo,
  onAbrir,
}: {
  visita: Visita;
  cliente: Cliente | undefined;
  serie: SerieRecurrente | undefined;
  orientativo: boolean;
  onAbrir: () => void;
}) {
  const nombre = cliente?.nombre ?? 'Cliente borrado';
  const periodo = textoPeriodo(v, serie);
  const tel = cliente?.telefono;
  return (
    <li className={`visita-agenda${v.estado !== 'programada' ? ` ${v.estado}` : ''}`} data-visita={v.id}>
      <button type="button" className="cuerpo tocable" onClick={onAbrir}>
        <span className="hora">
          <span className="inicio">{horaDe(v)}</span>
          <span className="duracion">{textoDuracion(v.duracion)}</span>
        </span>
        <span className="textos">
          <span className="cliente">{nombre}</span>
          <span className="trabajo">{textoTrabajo(v)}</span>
          <span className="periodo">
            {periodo.repite && <span aria-hidden="true">↻ </span>}
            {periodo.texto}
          </span>
          {(v.requiere_vehiculo || v.ayudantes > 0 || v.estado !== 'programada') && (
            <span className="chips-visita">
              {v.estado === 'hecha' && <span className="chip-estado verde">Hecha</span>}
              {v.estado === 'cancelada' && <span className="chip-estado neutro">Cancelada</span>}
              {v.requiere_vehiculo && <span className="chip-estado ambar">Necesita furgoneta</span>}
              {v.ayudantes > 0 && <span className="chip-estado neutro">{textoAyudantes(v.ayudantes)}</span>}
            </span>
          )}
          <span className="semaforo">
            <span className="punto" aria-hidden="true" />
            {orientativo ? 'Sin previsión · Previsión orientativa' : 'Sin previsión'}
          </span>
        </span>
      </button>
      {tel ? (
        <a className="boton-llamar tocable" href={`tel:${tel}`} aria-label={`Llamar a ${nombre}`}>
          <Phone size={20} aria-hidden="true" />
        </a>
      ) : (
        <button type="button" className="boton-llamar" disabled aria-label={`Llamar a ${nombre}`} title="Sin teléfono">
          <Phone size={20} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
