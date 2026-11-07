import { useEffect, useId, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { Cliente, Visita } from '../../domain/tipos';
import {
  enlaceWhatsApp, esHuecoLibre, horasLibres, mensajeMoverVisita, NOTA_HORAS, proponerMover,
  type AlertaClima, type ClimaCliente, type EntradaPropuesta, type OpcionHora,
} from '../../dominio/alertas';
import { evaluarVisita } from '../../clima';
import { claveDia, DIAS_CORTOS, diaSemanaDeClave, sumarDias } from '../../lib/fechas';

// Tarjeta «PARA DECIDIR» de la pantalla Alertas (§10.7; maqueta «6. Alertas», tarjeta de alerta de clima con acción
// de mover). Clima que pide decisión: fondo rojo suave y franja roja; aviso oficial AEMET: fondo y franja ámbar.
// El nivel siempre va también en palabras («MEJOR MOVER · EN 4 DÍAS», «AVISO AEMET · EN 2 DÍAS»).
//
// Días y horas salen del motor (`proponerMover`, `horasLibres`): 3 días propuestos (el primero «Sugerido») + «Otro»,
// y horas libres de ese día (la original primero) + «Otra». El mensaje se reescribe al cambiar día u hora salvo que
// se haya editado a mano («Mensaje editado · Restaurar»).

const OTRO = 'otro';

export interface Decision {
  fecha: string;
  hora: string;
  /** Enlace wa.me con el mensaje; null = mover sin avisar. */
  enlace: string | null;
}

export function TarjetaDecidir({
  alerta,
  visita,
  cliente,
  visitas,
  clima,
  otras = [],
  puedeDecidir,
  ocupado,
  onMover,
  onMantener,
}: {
  alerta: AlertaClima;
  /** Las otras alertas de la misma visita (semáforo + aviso oficial): sus motivos van en la misma tarjeta. */
  otras?: AlertaClima[];
  visita: Visita | undefined;
  cliente: Cliente | undefined;
  visitas: Visita[];
  clima: ClimaCliente | undefined;
  puedeDecidir: boolean;
  ocupado: boolean;
  onMover: (d: Decision) => void;
  onMantener: () => void;
}) {
  const id = useId();
  const esAviso = alerta.tipo === 'CLIMA_AEMET';
  // Aviso oficial: «Ver opciones» abre la propuesta; la alerta de clima de mover la muestra ya abierta (§10.7).
  const [abierta, setAbierta] = useState(!esAviso);
  const nivel = esAviso ? 'ambar' : 'rojo';

  return (
    <article className="tarjeta-alerta" data-nivel={nivel} aria-labelledby={`${id}-titulo`} data-alerta={alerta.id}>
      <div className="linea-superior">
        <span>{alerta.etiqueta_superior}</span>
        {alerta.dato_clave && <span className="dato-clave">{alerta.dato_clave}</span>}
      </div>
      <h3 id={`${id}-titulo`}>{alerta.titulo}</h3>
      <p className="detalle">{alerta.cuerpo}</p>
      {otrosMotivos(alerta, otras, visita, clima).map((m) => (
        <p key={m} className="detalle">
          {m}
        </p>
      ))}

      {!puedeDecidir ? (
        <p className="solo-titular">Felipe decide si se mueve o se mantiene.</p>
      ) : !visita ? null : abierta ? (
        <PanelMover alerta={alerta} visita={visita} cliente={cliente} visitas={visitas} clima={clima} ocupado={ocupado} onMover={onMover} onMantener={onMantener} />
      ) : (
        <div className="acciones-alerta">
          <button type="button" className="boton-principal tocable" onClick={() => setAbierta(true)}>
            {alerta.accion_principal.texto}
          </button>
          <div className="enlaces">
            <button type="button" className="boton-texto tocable" disabled={ocupado} onClick={onMantener}>
              Mantener la visita
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function PanelMover({
  alerta,
  visita,
  cliente,
  visitas,
  clima,
  ocupado,
  onMover,
  onMantener,
}: {
  alerta: AlertaClima;
  visita: Visita;
  cliente: Cliente | undefined;
  visitas: Visita[];
  clima: ClimaCliente | undefined;
  ocupado: boolean;
  onMover: (d: Decision) => void;
  onMantener: () => void;
}) {
  const id = useId();
  const ahora = new Date();
  const hoy = claveDia(ahora);
  const entrada = useMemo(
    () => ({ visita, visitas, cliente: cliente ? { dias_preferidos: cliente.dias_preferidos } : undefined, clima, ahora: new Date() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visita, visitas, cliente?.dias_preferidos, clima],
  );
  const propuesta = useMemo(() => proponerMover(entrada), [entrada]);

  const [dia, setDia] = useState<string>(() => propuesta.dias[0]?.fecha ?? OTRO);
  const [diaOtro, setDiaOtro] = useState('');
  const fecha = dia === OTRO ? diaOtro : dia;

  const horas: OpcionHora[] = useMemo(() => (fecha ? horasLibres(entrada, fecha) : []), [entrada, fecha]);
  const [hora, setHora] = useState<string>(() => propuesta.dias[0]?.hora ?? propuesta.horas[0]?.hora ?? OTRO);
  const [horaOtra, setHoraOtra] = useState('');
  const horaElegida = hora === OTRO ? horaOtra : hora;

  // Al cambiar de día, si la hora elegida no está libre ese día se pasa a la primera libre (la original si lo está).
  useEffect(() => {
    // «Otra» elegida a mano se respeta; si quedó en «Otra» sólo porque el día no tenía horas, se toma la primera libre.
    if (hora === OTRO) {
      if (!horaOtra && horas.length) setHora(horas[0].hora);
      return;
    }
    if (!horas.some((h) => h.hora === hora)) setHora(horas[0]?.hora ?? OTRO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horas]);

  const huecoLibre = Boolean(fecha && /^\d{2}:\d{2}$/.test(horaElegida) && esHuecoLibre(fecha, horaElegida, visita.duracion, visitas, visita.id));
  const valido = Boolean(fecha) && fecha !== alerta.fecha && huecoLibre;

  const automatico = valido ? mensajeMoverVisita({ fechaOriginal: alerta.fecha, fechaNueva: fecha, horaNueva: horaElegida, causa: alerta.causa }) : '';
  const [editado, setEditado] = useState<string | null>(null);
  const texto = editado ?? automatico;

  const telefono = cliente?.telefono ?? null;
  const enlace = enlaceWhatsApp(telefono, texto);
  const conTelefono = enlaceWhatsApp(telefono) !== null;

  const mover = (avisar: boolean) => onMover({ fecha, hora: horaElegida, enlace: avisar ? enlace : null });

  return (
    <div className="mover">
      <p className="pregunta" id={`${id}-dia`}>
        ¿A qué día?
      </p>
      <div className="opciones" role="radiogroup" aria-labelledby={`${id}-dia`}>
        {propuesta.dias.map((d) => (
          <button
            key={d.fecha}
            type="button"
            role="radio"
            aria-checked={dia === d.fecha}
            className="opcion tocable"
            onClick={() => setDia(d.fecha)}
          >
            {d.sugerido && <span className="sugerido">Sugerido</span>}
            <span>{d.texto_dia}</span>
            <span className="tiempo">{d.tiempo}</span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={dia === OTRO} className="opcion tocable" onClick={() => setDia(OTRO)}>
          Otro
        </button>
      </div>
      {dia === OTRO && <CalendarioDias entrada={entrada} hoy={hoy} fechaOriginal={alerta.fecha} elegido={diaOtro} onElegir={setDiaOtro} />}

      <p className="pregunta" id={`${id}-hora`}>
        ¿A qué hora?
      </p>
      <div className="opciones" role="radiogroup" aria-labelledby={`${id}-hora`}>
        {horas.map((h) => (
          <button key={h.hora} type="button" role="radio" aria-checked={hora === h.hora} className="opcion tocable" onClick={() => setHora(h.hora)}>
            <span>{h.hora}</span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={hora === OTRO} className="opcion tocable" onClick={() => setHora(OTRO)}>
          Otra
        </button>
      </div>
      {hora === OTRO && (
        <>
          <label className="sr-only" htmlFor={`${id}-otra-hora`}>
            Elige la hora
          </label>
          <input id={`${id}-otra-hora`} className="campo-otro" type="time" step={1800} value={horaOtra} onChange={(e) => setHoraOtra(e.target.value)} />
        </>
      )}
      <p className="nota">{propuesta.nota_horas || NOTA_HORAS}</p>
      {fecha && /^\d{2}:\d{2}$/.test(horaElegida) && !huecoLibre && <p className="aviso-hueco">Esa hora choca con otra visita. Elige otra.</p>}

      {conTelefono && (
        <>
          <p className="pregunta" id={`${id}-msg`}>
            Mensaje para el cliente (puedes editarlo)
          </p>
          <div className="burbuja-whatsapp">
            <textarea
              aria-labelledby={`${id}-msg`}
              value={texto}
              placeholder="Elige día y hora"
              onChange={(e) => setEditado(e.target.value)}
            />
          </div>
          {editado !== null && (
            <div className="mensaje-editado">
              <span>Mensaje editado ·</span>
              <button type="button" className="boton-texto tocable" onClick={() => setEditado(null)}>
                Restaurar
              </button>
            </div>
          )}
        </>
      )}

      <div className="acciones-alerta">
        {conTelefono ? (
          <>
            <button type="button" className="boton-principal tocable" disabled={!valido || ocupado || !texto.trim()} onClick={() => mover(true)}>
              <MessageCircle size={22} aria-hidden="true" />
              Mover y avisar por WhatsApp Business
            </button>
            <div className="enlaces">
              <button type="button" className="boton-texto tocable" disabled={!valido || ocupado} onClick={() => mover(false)}>
                Mover sin avisar
              </button>
              <button type="button" className="boton-texto tocable" disabled={ocupado} onClick={onMantener}>
                Mantener la visita
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="boton-principal tocable" disabled={!valido || ocupado} onClick={() => mover(false)}>
              Mover visita
            </button>
            <p className="sin-telefono">Añade su teléfono para avisarle.</p>
            <div className="enlaces">
              <button type="button" className="boton-texto tocable" disabled={ocupado} onClick={onMantener}>
                Mantener la visita
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * «Otro» día (§10.7: «abre un calendario con el semáforo de cada día»; decisión de Ariel del 2026-11-07). Días de
 * mañana a 13 días vista, cada uno con el semáforo de la visita ese día (mismos tipos de trabajo, hora y duración):
 * punto de color y estado en palabras («Se puede ir», «Mejor mover», «Sin previsión», «Previsión orientativa»). Los
 * días sin hueco libre y el día original no se pueden elegir.
 */
function CalendarioDias({
  entrada,
  hoy,
  fechaOriginal,
  elegido,
  onElegir,
}: {
  entrada: EntradaPropuesta;
  hoy: string;
  fechaOriginal: string;
  elegido: string;
  onElegir: (fecha: string) => void;
}) {
  const id = useId();
  const dias = useMemo(() => {
    const hora = entrada.visita.hora_inicio ?? '09:00';
    const r = [];
    for (let i = 1; i <= 13; i++) {
      const fecha = sumarDias(hoy, i);
      const s = evaluarVisita({
        visita: { fecha, hora_inicio: hora, duracion: entrada.visita.duracion, tipos_trabajo: entrada.visita.tipos_trabajo },
        ubicacion: entrada.clima?.ubicacion ?? null,
        prevision: entrada.clima?.prevision ?? null,
        avisos: entrada.clima?.avisos ?? [],
        motivoSinPrevision: entrada.clima?.motivo,
        ahora: entrada.ahora,
      });
      const nivel = s.orientativo ? 'orientativo' : s.nivel;
      const sinHueco = horasLibres(entrada, fecha, 1).length === 0;
      r.push({ fecha, nivel, estado: s.estado, original: fecha === fechaOriginal, sinHueco });
    }
    return r;
  }, [entrada, hoy, fechaOriginal]);

  return (
    <div className="calendario-dias">
      <p className="sr-only" id={`${id}-cal`}>
        Elige otro día
      </p>
      <div className="calendario" role="radiogroup" aria-labelledby={`${id}-cal`}>
        {dias.map((d) => {
          const [, , dd] = d.fecha.split('-');
          const nombre = `${DIAS_CORTOS[diaSemanaDeClave(d.fecha)]} ${Number(dd)}`;
          const nota = d.original ? 'Día de la visita' : d.nivel === 'rojo' || !d.sinHueco ? d.estado : 'Sin huecos';
          return (
            <button
              key={d.fecha}
              type="button"
              role="radio"
              aria-checked={elegido === d.fecha}
              aria-label={`${nombre}: ${nota}`}
              disabled={d.original || d.sinHueco}
              data-fecha={d.fecha}
              data-nivel={d.nivel}
              className="dia-calendario tocable"
              onClick={() => onElegir(d.fecha)}
            >
              <span className="nombre">{nombre}</span>
              <span className="estado">
                <span className="punto-semaforo" data-nivel={d.nivel} aria-hidden="true" />
                {nota}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
/**
 * Segundo motivo de la tarjeta (decisión de Ariel: una tarjeta con los dos motivos). Cuando la visita tiene a la vez
 * aviso oficial y otra alerta, el texto del motor nombra primero el aviso; aquí se añade lo que dice la previsión por
 * sí sola (semáforo de la visita sin los avisos), con su estado en palabras: «Mejor mover: Lluvia toda la mañana».
 * Si la previsión sola no da ámbar ni rojo, el aviso es el único motivo y no se añade nada.
 */
function otrosMotivos(principal: AlertaClima, otras: AlertaClima[], visita: Visita | undefined, clima: ClimaCliente | undefined): string[] {
  if (!otras.length || !visita) return [];
  const s = evaluarVisita({
    visita: { fecha: visita.fecha, hora_inicio: visita.hora_inicio, duracion: visita.duracion, tipos_trabajo: visita.tipos_trabajo },
    ubicacion: clima?.ubicacion ?? null,
    prevision: clima?.prevision ?? null,
    avisos: [],
    motivoSinPrevision: clima?.motivo,
  });
  if (s.orientativo || (s.nivel !== 'ambar' && s.nivel !== 'rojo')) return [];
  const detalle = s.etiqueta.startsWith(s.estado) ? s.etiqueta.slice(s.estado.length).replace(/^\s*·\s*/, '') : s.etiqueta;
  const texto = `${s.estado}: ${detalle}.`.replace(/\.\.$/, '.');
  return principal.cuerpo.includes(detalle) ? [] : [texto];
}