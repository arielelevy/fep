// Enlaces profundos (§12.1.5): toda notificación abre la app en la pantalla exacta donde se resuelve.
// Formato: `/?ir=<pantalla>&…`. El service worker abre esa URL al tocar la notificación (public/avisos-sw.js) y la
// App la lee al arrancar (`destinoDeUrl`). También los usa el registro de avisos simulados de Ajustes.

export type Destino =
  | { pantalla: 'hoy' }
  | { pantalla: 'alertas' }
  | { pantalla: 'agenda' }
  | { pantalla: 'visita'; id: string }
  | { pantalla: 'preparar'; fecha: string }
  | { pantalla: 'movimientos'; filtro?: 'fianzas' | 'aportes' }
  | { pantalla: 'ajustes'; ajuste?: string };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function enlaceA(d: Destino): string {
  const p = new URLSearchParams({ ir: d.pantalla });
  if (d.pantalla === 'visita') p.set('id', d.id);
  if (d.pantalla === 'preparar') p.set('fecha', d.fecha);
  if (d.pantalla === 'movimientos' && d.filtro) p.set('f', d.filtro);
  if (d.pantalla === 'ajustes' && d.ajuste) p.set('a', d.ajuste);
  return `/?${p.toString()}`;
}

/** Lee el destino de una URL (absoluta o relativa). null si no trae destino o no es válido. */
export function destinoDeUrl(url: string): Destino | null {
  let q: URLSearchParams;
  try {
    q = new URL(url, 'https://fergo.local').searchParams;
  } catch {
    return null;
  }
  const ir = q.get('ir');
  switch (ir) {
    case 'hoy':
    case 'alertas':
    case 'agenda':
      return { pantalla: ir };
    case 'visita': {
      const id = q.get('id');
      return id ? { pantalla: 'visita', id } : null;
    }
    case 'preparar': {
      const fecha = q.get('fecha') ?? '';
      return FECHA.test(fecha) ? { pantalla: 'preparar', fecha } : null;
    }
    case 'movimientos': {
      const f = q.get('f');
      return { pantalla: 'movimientos', ...(f === 'fianzas' || f === 'aportes' ? { filtro: f } : {}) };
    }
    case 'ajustes': {
      const a = q.get('a');
      return { pantalla: 'ajustes', ...(a ? { ajuste: a } : {}) };
    }
    default:
      return null;
  }
}
