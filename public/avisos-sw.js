/* Avisos en el service worker (§12.1.5, §12.4). Lo importa el service worker de Workbox (vite.config.ts, importScripts).
   - Tocar una notificación abre la app en la pantalla exacta: la URL del enlace profundo va en `data.url` (/?ir=…).
   - `push`: queda listo para cuando exista el servidor de Web Push (hoy no se envía ningún push real). */
/** Solo enlaces de la propia app: una URL de otro origen (o ilegible) abre la portada. */
function mismaApp(url) {
  try {
    const destino = new URL(url || '/', self.location.origin);
    return destino.origin === self.location.origin ? destino.pathname + destino.search + destino.hash : '/';
  } catch {
    return '/';
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = mismaApp(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          // navigate() falla en ventanas que este service worker aún no controla: entonces solo se enfoca.
          const navegada = 'navigate' in v ? v.navigate(url).catch(() => undefined) : Promise.resolve();
          return Promise.all([navegada, v.focus()]);
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
      data: { url: mismaApp(aviso.enlace) },
    }),
  );
});
