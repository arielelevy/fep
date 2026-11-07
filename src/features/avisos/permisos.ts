// Permiso de notificaciones (§12.4). Solo se pide tras un toque del usuario y con la pantalla explicativa propia
// antes del diálogo del sistema. «Probar notificación» muestra una notificación LOCAL (no es un push del servidor):
// sirve para comprobar que el móvil las enseña. El envío de avisos sigue simulado (envio.ts).

import { alternarPaso, leerAjuste } from '../../db/repo';
import { enlaceA } from './enlaces';
import { registrarAvisoSimulado } from './envio';

export type EstadoPermiso = 'concedido' | 'denegado' | 'pendiente' | 'no_disponible';

export function estadoPermiso(): EstadoPermiso {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'no_disponible';
  const p = window.Notification.permission;
  return p === 'granted' ? 'concedido' : p === 'denied' ? 'denegado' : 'pendiente';
}

export const TEXTO_PERMISO: Record<EstadoPermiso, string> = {
  concedido: 'Activados',
  denegado: 'Bloqueados en este móvil',
  pendiente: 'Sin activar',
  no_disponible: 'Este navegador no admite avisos',
};

/** Marca hecho el paso «Activa los avisos» de la bienvenida (§10.1.3) si aún no lo está. */
async function completarPasoAvisos(): Promise<void> {
  const pasos = await leerAjuste<Record<string, boolean>>('pasos_bienvenida', {});
  if (!pasos.avisos) await alternarPaso('avisos');
}

/** Pide el permiso (llamar SOLO desde un toque del usuario). */
export async function pedirPermiso(): Promise<EstadoPermiso> {
  if (estadoPermiso() === 'no_disponible') return 'no_disponible';
  const r = await window.Notification.requestPermission();
  const estado = r === 'granted' ? 'concedido' : r === 'denied' ? 'denegado' : 'pendiente';
  if (estado === 'concedido') await completarPasoAvisos();
  return estado;
}

export const PRUEBA = {
  titulo: 'FERGO · Notificación de prueba',
  cuerpo: 'Así te llegarán los avisos. Como mucho un resumen al día.',
};

/**
 * «Probar notificación» (§10.10.7, criterio 31): enseña una notificación local con enlace a Ajustes y la anota en el
 * registro de avisos simulados. Devuelve false si no hay permiso.
 */
export async function probarNotificacion(): Promise<boolean> {
  if (estadoPermiso() !== 'concedido') return false;
  const enlace = enlaceA({ pantalla: 'ajustes', ajuste: 'instalacion' });
  const opciones: NotificationOptions = { body: PRUEBA.cuerpo, icon: '/icono-192.png', tag: 'prueba', data: { url: enlace } };
  const registro = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registro) await registro.showNotification(PRUEBA.titulo, opciones);
  else new window.Notification(PRUEBA.titulo, opciones);
  await registrarAvisoSimulado({ clave: `prueba|${Date.now()}`, canal: 'inmediata', tipo: 'PRUEBA', titulo: PRUEBA.titulo, cuerpo: PRUEBA.cuerpo, enlace, acciones: [] });
  return true;
}
