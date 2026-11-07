import { useId, useState } from 'react';
import { Bell, ChevronLeft } from 'lucide-react';
import { useDeshacer } from '../../components/Deshacer';
import { useDatos } from '../../db/datos';
import { useLive } from '../../lib/hooks';
import { AVISO_FURGO_OPCIONES, guardarAvisoFurgo, leerAvisoFurgo } from '../ajustes/proveedores/datos';
import { guardarConfigAvisos, leerConfigAvisos, OPCIONES_RECORDATORIO, type ConfigAvisos } from './config';
import { leerRegistroAvisos } from './envio';
import './avisos.css';

// Ajustes › Avisos y horarios (§10.10.5, §12). Sin maqueta propia: estilo de las pantallas maquetadas según
// docs/maqueta.md (filas blancas como la ficha de cliente, chips de 44 pt, etiqueta de sección en mayúsculas).
// Cada cambio se guarda al momento con «Deshacer» (§5.4). Debajo, el registro de avisos SIMULADOS: lo que la app
// habría enviado, con su enlace profundo (tocar abre la pantalla donde se resuelve).

export function AjustesAvisos({ etiquetaVolver, onVolver, onAbrir }: { etiquetaVolver: string; onVolver: () => void; onAbrir: (enlace: string) => void }) {
  const id = useId();
  const datos = useDatos();
  const { mostrar } = useDeshacer();
  const config = useLive(() => leerConfigAvisos());
  const furgo = useLive(() => leerAvisoFurgo());
  const registro = useLive(() => leerRegistroAvisos());
  const [error, setError] = useState('');
  const puede = Boolean(datos && !datos.esColaborador);

  const guardar = async (cambios: Partial<ConfigAvisos>) => {
    setError('');
    try {
      const r = await guardarConfigAvisos(cambios);
      mostrar('Ajuste guardado', r.deshacer);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Vuelve a intentarlo.');
    }
  };
  const guardarFurgo = async (dias: number) => {
    setError('');
    try {
      const r = await guardarAvisoFurgo(dias);
      mostrar('Ajuste guardado', r.deshacer);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Vuelve a intentarlo.');
    }
  };

  return (
    <main className="pantalla ajustes-avisos" aria-labelledby={`${id}-t`}>
      <button type="button" className="volver tocable" onClick={onVolver}>
        <ChevronLeft size={20} aria-hidden="true" />
        {etiquetaVolver}
      </button>
      <h1 className="titulo-pantalla" id={`${id}-t`}>
        Avisos y horarios
      </h1>
      <p className="secundario" style={{ margin: '2px 0 0' }}>
        Un solo resumen al día con todo junto. Nada en horas de silencio.
      </p>

      {config && (
        <>
          <h2 className="etiqueta-seccion">Resumen diario</h2>
          <div className="filas" style={{ marginTop: 0 }}>
            <label className="fila">
              <span className="nombre">Hora del resumen</span>
              <input
                className="campo-hora"
                type="time"
                value={config.horaResumen}
                disabled={!puede}
                onChange={(e) => e.target.value && guardar({ horaResumen: e.target.value })}
              />
            </label>
            <div className="fila fila-columna">
              <span className="nombre">Resumen semanal del domingo</span>
              <div className="chips" role="radiogroup" aria-label="Resumen semanal del domingo">
                {[
                  { v: true, t: 'Sí' },
                  { v: false, t: 'No' },
                ].map((o) => (
                  <button key={o.t} type="button" role="radio" aria-checked={config.resumenSemanal === o.v} className="chip tocable" disabled={!puede} onClick={() => guardar({ resumenSemanal: o.v })}>
                    {o.t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <h2 className="etiqueta-seccion">Antes de cada visita</h2>
          <div className="filas" style={{ marginTop: 0 }}>
            <div className="fila fila-columna">
              <span className="nombre" id={`${id}-rec`}>
                Recordatorio
              </span>
              <div className="chips" role="radiogroup" aria-labelledby={`${id}-rec`}>
                {OPCIONES_RECORDATORIO.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    role="radio"
                    aria-checked={config.recordatorioVisita === o.valor}
                    className="chip tocable"
                    disabled={!puede}
                    onClick={() => guardar({ recordatorioVisita: o.valor })}
                  >
                    {o.texto}
                  </button>
                ))}
              </div>
            </div>
            <div className="fila fila-columna">
              <span className="nombre" id={`${id}-furgo`}>
                Aviso de furgoneta (días antes)
              </span>
              <div className="chips" role="radiogroup" aria-labelledby={`${id}-furgo`}>
                {AVISO_FURGO_OPCIONES.map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={furgo === d} className="chip tocable" disabled={!puede} onClick={() => guardarFurgo(d)}>
                    {d} días
                  </button>
                ))}
              </div>
            </div>
          </div>

          <h2 className="etiqueta-seccion">Horas de silencio</h2>
          <div className="filas" style={{ marginTop: 0 }}>
            <label className="fila">
              <span className="nombre">Desde</span>
              <input
                className="campo-hora"
                type="time"
                value={config.silencioDesde}
                disabled={!puede}
                onChange={(e) => e.target.value && guardar({ silencioDesde: e.target.value })}
              />
            </label>
            <label className="fila">
              <span className="nombre">Hasta</span>
              <input
                className="campo-hora"
                type="time"
                value={config.silencioHasta}
                disabled={!puede}
                onChange={(e) => e.target.value && guardar({ silencioHasta: e.target.value })}
              />
            </label>
          </div>
          <p className="secundario" style={{ margin: '8px 4px 0' }}>
            En silencio solo suena lo que tú programas: la compra que te recuerdo y la recogida o devolución de la furgoneta.
          </p>
        </>
      )}

      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}

      <h2 className="etiqueta-seccion">Avisos enviados</h2>
      <p className="secundario" style={{ margin: '0 4px 8px' }}>
        Modo de prueba: todavía no hay servidor de avisos, así que la app anota aquí lo que te habría enviado.
      </p>
      {registro && registro.enviados.length === 0 && (
        <div className="tarjeta tarjeta-vacia">
          <p className="titulo">Aún no hay avisos.</p>
        </div>
      )}
      {registro && registro.enviados.length > 0 && (
        <ul className="avisos-enviados">
          {registro.enviados.map((a) => (
            <li key={`${a.clave}|${a.enviado_en}`}>
              <button type="button" className="aviso-enviado tocable" onClick={() => onAbrir(a.enlace)}>
                <Bell size={18} aria-hidden="true" />
                <span className="textos">
                  <span className="titulo">{a.titulo}</span>
                  {a.cuerpo && <span className="cuerpo">{a.cuerpo}</span>}
                  <span className="cuando">{textoEnviado(a.enviado_en)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function textoEnviado(iso: string): string {
  const f = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  return f.charAt(0).toUpperCase() + f.slice(1);
}
