import { useEffect, useState } from 'react';
import { EllipsisVertical, Share, SquarePlus } from 'lucide-react';
import { Logo } from '../components/Logo';
import { local } from '../lib/hooks';

// Guía de instalación (§4.1, decisión H11: construir con el estilo de la maqueta). Se muestra al abrir
// la app desde el navegador sin instalar. Los pasos se ilustran con los iconos del sistema en lugar de capturas.

export const CLAVE_GUIA = 'fergo.guia.vista';

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let eventoInstalar: EventoInstalar | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e as EventoInstalar;
  });
}

export function estaInstalada(): boolean {
  if (typeof window === 'undefined') return true;
  const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Enlace directo a la guía: `/?ir=instalar` (para mandarle a Felipe). La muestra aunque ya se haya visto. */
export function pideGuiaPorEnlace(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('ir') === 'instalar';
}

/** Quita `?ir=instalar` de la dirección para que recargar no vuelva a abrir la guía. */
export function olvidarEnlaceGuia(): void {
  if (!pideGuiaPorEnlace()) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('ir');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

export function debeMostrarGuia(): boolean {
  return pideGuiaPorEnlace() || (!estaInstalada() && local.leer(CLAVE_GUIA) !== '1');
}

export function GuiaInstalacion({ onSeguir }: { onSeguir: () => void }) {
  const [puedeInstalar, setPuedeInstalar] = useState(Boolean(eventoInstalar));
  useEffect(() => {
    const f = () => setPuedeInstalar(true);
    window.addEventListener('beforeinstallprompt', f);
    return () => window.removeEventListener('beforeinstallprompt', f);
  }, []);
  const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const seguir = () => {
    local.escribir(CLAVE_GUIA, '1');
    onSeguir();
  };

  const instalar = async () => {
    if (!eventoInstalar) return;
    await eventoInstalar.prompt();
    const r = await eventoInstalar.userChoice;
    eventoInstalar = null;
    setPuedeInstalar(false);
    if (r.outcome === 'accepted') seguir();
  };

  return (
    <main className="guia app" aria-labelledby="titulo-guia">
      <div className="marca">
        <span className="logo-boton">
          <Logo tam={38} />
        </span>
        <h1 className="titulo-pantalla" id="titulo-guia">
          Instala FERGO
        </h1>
      </div>
      <p style={{ margin: 0, fontWeight: 600 }}>Añádela a la pantalla de inicio: se abre como una app, funciona sin conexión y así te llegan los avisos.</p>

      {puedeInstalar && (
        <button type="button" className="boton-principal tocable" onClick={instalar}>
          Instalar FERGO
        </button>
      )}

      <section className="tarjeta" aria-labelledby="guia-android">
        <h2 className="titulo-seccion" id="guia-android" style={{ marginBottom: 10 }}>
          {esIos ? 'En iPhone (Safari)' : 'En Android (Chrome)'}
        </h2>
        {esIos ? (
          <ol>
            <li>
              <span className="num">1</span>
              <div>
                Toca el botón Compartir.
                <br />
                <span className="paso-ilustrado"><Share size={18} aria-hidden="true" /> Compartir</span>
              </div>
            </li>
            <li>
              <span className="num">2</span>
              <div>
                Elige “Añadir a pantalla de inicio”.
                <br />
                <span className="paso-ilustrado"><SquarePlus size={18} aria-hidden="true" /> Añadir a pantalla de inicio</span>
              </div>
            </li>
            <li>
              <span className="num">3</span>
              <div>Abre FERGO desde el icono nuevo.</div>
            </li>
          </ol>
        ) : (
          <ol>
            <li>
              <span className="num">1</span>
              <div>
                Toca el menú de Chrome, arriba a la derecha.
                <br />
                <span className="paso-ilustrado"><EllipsisVertical size={18} aria-hidden="true" /> Menú</span>
              </div>
            </li>
            <li>
              <span className="num">2</span>
              <div>
                Elige “Instalar aplicación” o “Añadir a pantalla de inicio”.
                <br />
                <span className="paso-ilustrado"><SquarePlus size={18} aria-hidden="true" /> Instalar aplicación</span>
              </div>
            </li>
            <li>
              <span className="num">3</span>
              <div>Abre FERGO desde el icono nuevo.</div>
            </li>
          </ol>
        )}
      </section>

      <p className="aviso-ambar">Usa solo WhatsApp Business en este móvil para que los mensajes salgan desde FERGO.</p>

      <button type="button" className="boton-texto tocable" onClick={seguir} style={{ alignSelf: 'center' }}>
        Seguir en el navegador
      </button>
    </main>
  );
}
