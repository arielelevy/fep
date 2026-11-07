import { Bell, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useDeshacer } from '../../components/Deshacer';
import { TarjetaDecidir, type Decision } from '../../componentes/alertas/TarjetaDecidir';
import { almacen, enCola, useAlertasClima } from '../../componentes/alertas/useAlertasClima';
import { useDatos } from '../../db/datos';
import { SinPermiso } from '../../db/repo';
import { diaEnFrase, mantenerVisita, moverVisitaPorAlerta, type AlertaClima } from '../../dominio/alertas';
import { SeccionPreparar, useHayPreparacion } from '../../features/alertas/preparacion';
import '../../agenda/clima/clima.css';
import '../../componentes/alertas/alertas.css';

// Pantalla Alertas (§10.7; maqueta «6. Alertas»). Ola 7: alertas de clima del motor del frente A.
//   1. «‹ Agenda» (o la pantalla de origen), título «Alertas» y subtítulo «Tiempo y preparación de los próximos días».
//   2. Secciones en orden; las vacías no se muestran: PARA DECIDIR (clima a mover y avisos AEMET) y PARA TENER EN
//      CUENTA (informativas y mejoras). Ola 8: PREPARAR TRABAJOS (src/features/alertas/preparacion), entre las dos.
//      «Cobros y fianzas» llega con su ola.
//   3. Pie con la campana: «Un solo aviso al día, a las 21:00, con todo junto.»
//   4. Vacío: «Todo en orden. No hay nada que decidir esta semana.»
// Mover / Mantener dejan la barra «… · Deshacer» 8 segundos. WhatsApp se abre con un enlace wa.me: la app no envía
// nada por sí misma (§13.1).

export function Alertas({
  etiquetaVolver,
  onVolver,
  onAbrirVisita,
  onPreparar = () => {},
}: {
  etiquetaVolver: string;
  onVolver: () => void;
  onAbrirVisita: (visitaId: string) => void;
  /** Ola 8: abre Preparar trabajo de un día (tarjetas de «Preparar trabajos»). */
  onPreparar?: (fecha: string) => void;
}) {
  const datos = useDatos();
  const hayPreparacion = useHayPreparacion();
  const { estado, activas, decisiones, clima } = useAlertasClima();
  const { mostrar } = useDeshacer();
  const [ocupada, setOcupada] = useState<string | null>(null);
  const puedeDecidir = Boolean(datos && !datos.esColaborador);

  const enCuenta = activas.filter((a) => a.seccion === 'para_tener_en_cuenta');

  const fallo = (e: unknown, texto: string) => {
    console.error(e);
    mostrar(e instanceof SinPermiso ? 'Solo Felipe puede decidir sobre las visitas.' : texto);
  };

  const mover = async (a: AlertaClima, d: Decision) => {
    if (ocupada) return;
    setOcupada(a.id);
    try {
      const r = await enCola(() => moverVisitaPorAlerta(almacen, a.id, d.fecha, d.hora));
      // Abre el chat del cliente con el mensaje escrito; el envío lo hace Felipe en WhatsApp Business.
      if (d.enlace) window.open(d.enlace, '_blank', 'noopener');
      mostrar(`Visita movida al ${diaEnFrase(d.fecha)}, ${d.hora}`, () => enCola(r.deshacer));
    } catch (e) {
      fallo(e, 'No se pudo mover la visita. Vuelve a intentarlo.');
    } finally {
      setOcupada(null);
    }
  };

  // Mantener descarta todas las alertas de la decisión (semáforo y aviso oficial de la misma visita). El «Deshacer»
  // de la primera guarda el estado de antes de todas, así que basta con ese.
  const mantener = async (grupo: AlertaClima[], texto: string) => {
    const a = grupo[0];
    if (ocupada || !a) return;
    setOcupada(a.id);
    try {
      const r = await enCola(async () => {
        const primero = await mantenerVisita(almacen, a.id);
        for (const otra of grupo.slice(1)) await mantenerVisita(almacen, otra.id);
        return primero;
      });
      mostrar(texto, () => enCola(r.deshacer));
    } catch (e) {
      fallo(e, 'No se pudo guardar. Vuelve a intentarlo.');
    } finally {
      setOcupada(null);
    }
  };

  const cargando = !datos || !estado;

  return (
    <main className="pantalla alertas" aria-labelledby="titulo-alertas">
      <button type="button" className="volver tocable" onClick={onVolver}>
        <ChevronLeft size={20} aria-hidden="true" />
        {etiquetaVolver}
      </button>
      <h1 className="titulo-pantalla" id="titulo-alertas">
        Alertas
      </h1>
      <p className="subtitulo-alertas">Tiempo y preparación de los próximos días</p>

      {!cargando && activas.length === 0 && hayPreparacion === false && (
        <div className="tarjeta tarjeta-vacia" style={{ marginTop: 16 }}>
          <p className="titulo">Todo en orden. No hay nada que decidir esta semana.</p>
        </div>
      )}

      {decisiones.length > 0 && (
        <section aria-labelledby="sec-decidir">
          <h2 className="etiqueta-seccion" id="sec-decidir">
            Para decidir
          </h2>
          {decisiones.map(({ principal: a, todas }) => {
            const visita = datos?.visitas.find((v) => v.id === a.entidad.id);
            return (
              <TarjetaDecidir
                key={`${a.entidad.id}:${a.fecha}`}
                alerta={a}
                otras={todas.filter((x) => x.id !== a.id)}
                visita={visita}
                cliente={datos?.clientes.find((c) => c.id === a.cliente_id)}
                visitas={datos?.visitas ?? []}
                clima={clima.get(a.cliente_id)}
                puedeDecidir={puedeDecidir}
                ocupado={ocupada !== null}
                onMover={(d) => mover(a, d)}
                onMantener={() => mantener(todas, `Mantienes la visita del ${diaEnFrase(a.fecha)}`)}
              />
            );
          })}
        </section>
      )}

      {/* PREPARAR TRABAJOS (§10.7, ola 8): furgoneta, compra y preparación por día. Va entre las dos de clima. */}
      <SeccionPreparar onPreparar={onPreparar} />

      {enCuenta.length > 0 && (
        <section aria-labelledby="sec-cuenta">
          <h2 className="etiqueta-seccion" id="sec-cuenta">
            Para tener en cuenta
          </h2>
          <ul className="filas-info">
            {enCuenta.map((a) => {
              const mejora = a.tipo === 'CLIMA_MEJORA';
              const nivel = mejora ? 'verde' : a.semaforo;
              return (
                <li key={a.id} className="fila-info" data-alerta={a.id}>
                  <span className="punto-semaforo" data-nivel={nivel} aria-hidden="true" />
                  <span className="texto">
                    <strong>{a.titulo}:</strong> {a.cuerpo}
                    <span className="estado">{mejora ? 'Se puede ir' : a.estado_semaforo}</span>
                  </span>
                  {mejora ? (
                    puedeDecidir && (
                      <button type="button" className="chip tocable" disabled={ocupada !== null} onClick={() => mantener([a], 'Aviso cerrado')}>
                        {a.accion_principal.texto}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      className="chip tocable"
                      aria-label={`Ver la visita de ${a.titulo}`}
                      onClick={() => onAbrirVisita(a.entidad.id)}
                    >
                      {a.accion_principal.texto}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="pie-alertas">
        <Bell size={16} aria-hidden="true" />
        Un solo aviso al día, a las 21:00, con todo junto.
      </p>
    </main>
  );
}
