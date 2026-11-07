import { useEffect, useId, useState } from 'react';
import { Bell, BellOff, ChevronLeft, Smartphone } from 'lucide-react';
import { estaInstalada } from '../../screens/GuiaInstalacion';
import { estadoPermiso, pedirPermiso, probarNotificacion, TEXTO_PERMISO, type EstadoPermiso } from './permisos';
import './avisos.css';

// Ajustes › Instalación y notificaciones (§4.1, §10.10.7, §12.4; guía ya construida en la ola 2, H11 «construir con
// el estilo de la maqueta»). Estado de la instalación y del permiso, pantalla explicativa propia ANTES del diálogo
// del sistema (el permiso solo se pide tras un toque), «Probar notificación» y acceso a la guía.

export function InstalacionAvisos({ etiquetaVolver, onVolver, onVerGuia }: { etiquetaVolver: string; onVolver: () => void; onVerGuia: () => void }) {
  const id = useId();
  const [permiso, setPermiso] = useState<EstadoPermiso>(estadoPermiso);
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const instalada = estaInstalada();

  useEffect(() => {
    // El usuario puede cambiar el permiso desde los ajustes del sistema: se relee al volver a la app.
    const releer = () => setPermiso(estadoPermiso());
    document.addEventListener('visibilitychange', releer);
    return () => document.removeEventListener('visibilitychange', releer);
  }, []);

  const activar = async () => {
    setOcupado(true);
    setMensaje('');
    try {
      const r = await pedirPermiso();
      setPermiso(r);
      if (r === 'denegado') setMensaje('Los avisos quedaron bloqueados. Puedes activarlos en los ajustes del móvil, en Notificaciones.');
    } catch (e) {
      console.error(e);
      setMensaje('No se pudo pedir el permiso. Vuelve a intentarlo.');
    } finally {
      setOcupado(false);
    }
  };

  const probar = async () => {
    setOcupado(true);
    setMensaje('');
    try {
      setMensaje((await probarNotificacion()) ? 'Notificación de prueba enviada.' : 'Primero activa los avisos.');
    } catch (e) {
      console.error(e);
      setMensaje('No se pudo mostrar la notificación. Vuelve a intentarlo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <main className="pantalla" aria-labelledby={`${id}-t`}>
      <button type="button" className="volver tocable" onClick={onVolver}>
        <ChevronLeft size={20} aria-hidden="true" />
        {etiquetaVolver}
      </button>
      <h1 className="titulo-pantalla" id={`${id}-t`}>
        Instalación y avisos
      </h1>

      <div className="filas">
        <div className="fila">
          <span className="nombre">
            <Smartphone size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
            App en la pantalla de inicio
          </span>
          <span className="valor">{instalada ? 'Sí' : 'No'}</span>
        </div>
        <div className="fila">
          <span className="nombre">
            {permiso === 'concedido' ? (
              <Bell size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
            ) : (
              <BellOff size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
            )}
            Avisos
          </span>
          <span className="valor" data-testid="estado-permiso">
            {TEXTO_PERMISO[permiso]}
          </span>
        </div>
      </div>

      {permiso !== 'concedido' && permiso !== 'no_disponible' && (
        <section className="tarjeta explicacion-avisos" aria-labelledby={`${id}-exp`}>
          <h2 id={`${id}-exp`}>Activa los avisos</h2>
          <p>Te aviso del tiempo, de la furgoneta y de lo que tienes que comprar. Como mucho un resumen al día.</p>
          {!instalada && <p className="secundario">En iPhone, los avisos solo llegan con la app añadida a la pantalla de inicio.</p>}
          <button type="button" className="boton-principal tocable" disabled={ocupado || permiso === 'denegado'} onClick={activar}>
            Activar los avisos
          </button>
        </section>
      )}

      {permiso === 'concedido' && (
        <div className="bloque-probar">
          <button type="button" className="boton-secundario tocable" disabled={ocupado} onClick={probar}>
            Probar notificación
          </button>
        </div>
      )}

      {mensaje && (
        <p className="texto-aclaratorio neutro" role="status">
          {mensaje}
        </p>
      )}

      <div className="filas">
        <button type="button" className="fila tocable" onClick={onVerGuia}>
          <span className="nombre">Guía de instalación</span>
        </button>
      </div>
      <p className="secundario" style={{ margin: '8px 4px 0' }}>
        Usa solo WhatsApp Business en este móvil para que los mensajes salgan desde FERGO.
      </p>
    </main>
  );
}

/** Banda discreta en Hoy si el permiso se denegó (§12.4): «Activa los avisos para no perderte nada». */
export function BandaAvisos({ onIr }: { onIr: () => void }) {
  const [permiso, setPermiso] = useState<EstadoPermiso>(estadoPermiso);
  useEffect(() => {
    const releer = () => setPermiso(estadoPermiso());
    document.addEventListener('visibilitychange', releer);
    return () => document.removeEventListener('visibilitychange', releer);
  }, []);
  if (permiso !== 'denegado') return null;
  return (
    <button type="button" className="banda-avisos tocable" onClick={onIr}>
      <BellOff size={18} aria-hidden="true" />
      Activa los avisos para no perderte nada
    </button>
  );
}
