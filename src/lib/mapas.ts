// Enlace de «Cómo llegar» (ficha de cliente, maqueta p. 4, y detalle de visita, §10.6).
// En iPhone/iPad abre Apple Maps; en el resto (Android, decisión de Ariel) Google Maps. Siempre en coche.

export interface DestinoMapa {
  lat: number | null;
  lon: number | null;
  direccion: string;
  municipio: string;
}

const agenteActual = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);

/** URL de indicaciones al destino: coordenadas si las hay; si no, dirección y municipio. null si no hay nada. */
export function urlComoLlegar(destino: DestinoMapa, ua: string = agenteActual()): string | null {
  let d: string;
  if (destino.lat !== null && destino.lon !== null) {
    d = `${destino.lat},${destino.lon}`;
  } else {
    const direccion = destino.direccion.trim();
    if (!direccion) return null;
    d = encodeURIComponent([direccion, destino.municipio.trim()].filter(Boolean).join(', '));
  }
  if (/iphone|ipad|ipod/i.test(ua)) return `https://maps.apple.com/?daddr=${d}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${d}&travelmode=driving`;
}
