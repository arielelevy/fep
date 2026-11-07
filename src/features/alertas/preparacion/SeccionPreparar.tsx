import { ChevronRight, Phone } from 'lucide-react';
import { useState } from 'react';
import { useDeshacer } from '../../../components/Deshacer';
import { useDatos } from '../../../db/datos';
import type { Deshacer } from '../../../db/repo';
import { centimosATexto, formatearEuros, parsearImporte } from '../../../lib/dinero';
import { sumarDias, claveDia } from '../../../lib/fechas';
import { aLocal, instanteLocal, listaMaterial, visitasDelDia } from '../../preparar/logica';
import { guardarRecordatorio, marcarMaterial, registrarDevolucion, registrarRecogida } from '../../preparar/operaciones';
import { leerPlantillas } from '../../preparar/plantillas';
import { posponer } from './estado';
import { HojaReservaAlerta } from './HojaReservaAlerta';
import type { AlertaPreparacion, TarjetaDia } from './motor';
import { useAlertasPreparacion } from './useAlertasPreparacion';
import '../../preparar/preparar.css';
import './alertas-preparacion.css';

// Sección «PREPARAR TRABAJOS» de la pantalla Alertas (§10.7; maqueta «6. Alertas», aceptada sin maqueta propia por
// decisión de Ariel del 2026-11-07, estilo de las tarjetas de Alertas ya construidas):
//   - Avisos de la furgoneta y de la compra con su acción a un toque: «Registrar los dos» (FURGO_RECOGER),
//     «Entera / Me descontaron / Aún no» (FURGO_DEVOLVER), «Ya lo compré / Posponer 2 h» (COMPRA_RECORDATORIO).
//   - Tarjeta de alquiler pendiente (franja roja): «ALQUILA LA FURGONETA · EN 4 DÍAS», «Ya la reservé» abre aquí mismo el
//     formulario de reserva (§10.8.1, HojaReservaAlerta) y «Llamar a …» si hay proveedor habitual con teléfono.
//   - «Me descontaron» pide en la misma tarjeta cuánto devolvieron (§9.6.3). Todo se resuelve sin salir de Alertas (§5.2.2).
//   - Tarjeta de preparación por día (franja verde): «EN 3 DÍAS · 1 DE 3 LISTO», título y chips. Toque → Preparar.
//   - Ropa para mañana sin tarjeta propia (abono normal, §10.8.4): una fila informativa con «Ver lista».
// MATERIAL_REVISAR no tiene tarjeta propia: se ve en el chip «Revisar material» de la tarjeta del día y va al resumen.
// Cada acción deja «… · Deshacer» 8 segundos. Pablo ve la sección y abre Preparar, pero no registra nada (§3).

export function useHayPreparacion(): boolean | null {
  const p = useAlertasPreparacion();
  if (!p) return null;
  return p.tarjetas.length > 0 || p.alertas.some((a) => a.tipo !== 'MATERIAL_REVISAR');
}

export function SeccionPreparar({ onPreparar }: { onPreparar: (fecha: string) => void }) {
  const p = useAlertasPreparacion();
  const datos = useDatos();
  const { mostrar } = useDeshacer();
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reservar, setReservar] = useState<string | null>(null);
  const [descuento, setDescuento] = useState<string | null>(null);
  const [devuelto, setDevuelto] = useState('');
  if (!p || !datos) return null;

  const puede = !datos.esColaborador;
  const conTarjeta = p.alertas.filter((a) => a.tipo !== 'MATERIAL_REVISAR' && a.tipo !== 'ROPA_PREPARAR');
  const diasConTarjeta = new Set(p.tarjetas.map((t) => t.fecha));
  const ropaSuelta = p.alertas.filter((a) => a.tipo === 'ROPA_PREPARAR' && !diasConTarjeta.has(a.fecha));
  if (!conTarjeta.length && !p.tarjetas.length && !ropaSuelta.length) return null;

  const accion = async (a: AlertaPreparacion, f: () => Promise<{ deshacer: Deshacer }>, texto: string) => {
    if (ocupada) return;
    setOcupada(a.id);
    setError('');
    try {
      const r = await f();
      mostrar(texto, r.deshacer);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.name === 'SinPermiso' ? e.message : 'No se pudo guardar. Vuelve a intentarlo.');
    } finally {
      setOcupada(null);
    }
  };

  const reservaDe = (a: AlertaPreparacion) => (a.entidad.tipo === 'reserva' ? p.reservas.find((r) => r.id === (a.entidad as { id: string }).id) : undefined);

  const pulsar = (a: AlertaPreparacion, id: AlertaPreparacion['acciones'][number]['id']) => {
    const reserva = reservaDe(a);
    switch (id) {
      case 'registrar_los_dos':
        if (!reserva) return;
        return accion(
          a,
          () => registrarRecogida(reserva.id, { precio: reserva.precio, fianza: reserva.fianza_prevista, medio_pago: datos.ultimoMedio, visitas: datos.visitas }),
          reserva.fianza_prevista > 0 ? 'Alquiler y fianza registrados' : 'Alquiler registrado',
        );
      case 'entera':
        if (!reserva) return;
        return accion(a, () => registrarDevolucion(reserva.id, reserva.fianza_prevista, datos.ultimoMedio), reserva.fianza_prevista > 0 ? 'Fianza devuelta' : 'Furgoneta devuelta');
      case 'aun_no':
        // «Aún no»: vuelve mañana a las 10:00.
        return accion(a, () => posponer(a.id, instanteLocal(`${sumarDias(claveDia(new Date()), 1)}T10:00`)), 'Te lo vuelvo a preguntar mañana');
      case 'ya_comprado':
        return accion(a, () => comprarTodo(a.fecha), 'Marcado como comprado');
      case 'posponer':
        return accion(a, () => guardarRecordatorio(a.fecha, aLocal(new Date(Date.now() + 2 * 3_600_000))), 'Te lo recuerdo en 2 horas');
      case 'ya_reservada':
        return setReservar(a.fecha);
      case 'descuento':
        setDevuelto('');
        return setDescuento(a.id);
      default:
        // «Revisar» y «Ver lista» (§12.2): se ven en Preparar trabajo.
        return onPreparar(a.fecha);
    }
  };

  /** «Ya lo compré»: todo lo que estaba en «Comprar» pasa a «Comprado» (el gasto se registra desde Preparar). */
  const comprarTodo = async (fecha: string): Promise<{ deshacer: Deshacer }> => {
    const plantillas = await leerPlantillas();
    const items = listaMaterial(visitasDelDia(datos.visitas, fecha), plantillas.material, p.preparaciones[fecha]?.material).filter((i) => i.estado === 'comprar');
    const deshaceres: Deshacer[] = [];
    for (const i of items) deshaceres.push((await marcarMaterial(fecha, i, 'comprado')).deshacer);
    // Cada «Deshacer» deja la preparación como estaba antes de su cambio: basta con el primero.
    return { deshacer: async () => deshaceres[0]?.() };
  };

  return (
    <section aria-labelledby="sec-preparar" className="seccion-preparar">
      <h2 className="etiqueta-seccion" id="sec-preparar">
        Preparar trabajos
      </h2>

      {conTarjeta.map((a) => (
        <article key={a.id} className="tarjeta-alerta" data-nivel={a.tipo === 'FURGO_RESERVAR' ? 'rojo' : 'ambar'} data-alerta-prep={a.tipo} aria-labelledby={`t-${a.id}`}>
          <div className="linea-superior">
            <span>{a.etiqueta}</span>
          </div>
          <h3 id={`t-${a.id}`}>{a.titulo}</h3>
          <p className="detalle">{a.tipo === 'FURGO_RESERVAR' ? a.cuerpo : a.texto}</p>
          {a.tipo !== 'FURGO_RESERVAR' && <p className="detalle">{a.cuerpo}</p>}
          <div className="acciones-prep">
            {a.acciones.map((x, i) => {
              if (x.id === 'llamar')
                return x.telefono ? (
                  <a key={x.id} className="boton-secundario tocable" href={`tel:${x.telefono}`}>
                    <Phone size={18} aria-hidden="true" />
                    {x.texto}
                  </a>
                ) : null;
              const resuelveAqui = ['registrar_los_dos', 'entera', 'descuento', 'aun_no', 'ya_comprado', 'posponer', 'ya_reservada'].includes(x.id);
              if (resuelveAqui && !puede) return null;
              return (
                <button
                  key={x.id}
                  type="button"
                  className={i === 0 ? 'boton-principal tocable' : x.id === 'aun_no' || x.id === 'posponer' ? 'boton-texto tocable' : 'boton-secundario tocable'}
                  disabled={ocupada !== null}
                  onClick={() => pulsar(a, x.id)}
                >
                  {x.texto}
                </button>
              );
            })}
            {!puede && <p className="solo-titular">Felipe lo registra.</p>}
          </div>
          {descuento === a.id && reservaDe(a) && (
            <Descuento
              fianza={reservaDe(a)!.fianza_prevista}
              valor={devuelto}
              onValor={setDevuelto}
              ocupado={ocupada !== null}
              onVolver={() => setDescuento(null)}
              onGuardar={(importe) => {
                const reserva = reservaDe(a)!;
                setDescuento(null);
                accion(a, () => registrarDevolucion(reserva.id, importe, datos.ultimoMedio), 'Devolución registrada');
              }}
            />
          )}
        </article>
      ))}

      {p.tarjetas.map((t) => (
        <TarjetaPreparacion key={t.fecha} t={t} onAbrir={() => onPreparar(t.fecha)} />
      ))}

      {ropaSuelta.length > 0 && (
        <ul className="filas-info">
          {ropaSuelta.map((a) => (
            <li key={a.id} className="fila-info" data-alerta-prep={a.tipo}>
              <span className="punto-semaforo" data-nivel="azul" aria-hidden="true" />
              <span className="texto">{a.texto}</span>
              <button type="button" className="chip tocable" aria-label={`Ver la lista de ropa del ${a.titulo}`} onClick={() => onPreparar(a.fecha)}>
                Ver lista
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}

      {reservar && (
        <HojaReservaAlerta
          fecha={reservar}
          visitas={visitasDelDia(datos.visitas, reservar).filter((v) => v.requiere_vehiculo)}
          proveedores={p.plantillas.proveedores}
          onCerrar={(r) => {
            setReservar(null);
            if (r) mostrar('Furgoneta reservada', r.deshacer);
          }}
        />
      )}
    </section>
  );
}

/** «Me descontaron algo» (§9.6.3): cuánto devolvieron. La diferencia la anota `devolverFianza` como gasto. */
function Descuento({
  fianza,
  valor,
  onValor,
  ocupado,
  onVolver,
  onGuardar,
}: {
  fianza: number;
  valor: string;
  onValor: (v: string) => void;
  ocupado: boolean;
  onVolver: () => void;
  onGuardar: (importe: number) => void;
}) {
  const importe = parsearImporte(valor);
  const valido = importe !== null && importe <= fianza;
  return (
    <div className="bloque-acciones">
      <label className="campo-importe">
        <span>¿Cuánto te devolvieron?</span>
        <input inputMode="decimal" value={valor} placeholder={centimosATexto(fianza)} onChange={(e) => onValor(e.target.value)} />
      </label>
      {importe !== null && importe < fianza && (
        <p className="secundario">Se anota un gasto de {formatearEuros(fianza - importe, 'detalle')} con la nota «Descuento de fianza».</p>
      )}
      <button type="button" className="boton-principal tocable" disabled={ocupado || !valido} onClick={() => importe !== null && onGuardar(importe)}>
        Guardar devolución
      </button>
      <button type="button" className="boton-texto tocable" onClick={onVolver}>
        Volver
      </button>
    </div>
  );
}

function TarjetaPreparacion({ t, onAbrir }: { t: TarjetaDia; onAbrir: () => void }) {
  return (
    <button type="button" className="tarjeta-alerta tarjeta-dia-prep tocable" data-nivel="verde" data-tarjeta-dia={t.fecha} onClick={onAbrir} aria-label={`${t.etiqueta}. ${t.titulo}. ${t.chips.map((c) => c.texto).join(', ')}. Preparar trabajo`}>
      <span className="linea-superior">
        <span>{t.etiqueta}</span>
      </span>
      <span className="titulo-dia">{t.titulo}</span>
      <span className="chips-prep">
        {t.chips.map((c) => (
          <span key={c.texto} className={`chip-prep ${c.tono}`}>
            {c.texto}
          </span>
        ))}
      </span>
      <ChevronRight className="flecha" size={20} aria-hidden="true" />
    </button>
  );
}
