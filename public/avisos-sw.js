/* Avisos en el service worker (§12.1.5, §12.4). Lo importa el service worker de Workbox (vite.config.ts, importScripts).
   - Tocar una notificación abre la app en la pantalla exacta: la URL del enlace profundo va en `data.url` (/?ir=…).
   - `push`: queda listo para cuando exista el servidor de Web Push (hoy no se envía ningún push real). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          if ('navigate' in v) v.navigate(url);
          return v.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let aviso;
  try {
    aviso = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(aviso.titulo || 'FERGO', {
      body: aviso.cuerpo || '',
      icon: '/icono-192.png',
      tag: aviso.clave,
      data: { url: aviso.enlace || '/' },
    }),
  );
});
