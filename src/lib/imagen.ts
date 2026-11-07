// Compresión de la foto del ticket en el cliente (§10.2.1.6): JPEG de máximo 1600 px, unos 300 KB.
export const LADO_MAXIMO = 1600;

export async function comprimirTicket(archivo: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return archivo;
  try {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) return archivo;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    let calidad = 0.75;
    let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', calidad));
    while (blob && blob.size > 300_000 && calidad > 0.4) {
      calidad -= 0.15;
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', calidad));
    }
    return blob ?? archivo;
  } catch {
    return archivo;
  }
}
