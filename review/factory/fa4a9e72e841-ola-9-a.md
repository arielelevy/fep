# Ola 9 · Frente A · Documentar el pasaje a app nativa Android

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión.

## Cambio de alcance

El encargo pedía envolver la app con Capacitor y generar un APK. En la máquina no hay Android SDK: no está en `%LOCALAPPDATA%\Android\Sdk` y `ANDROID_HOME` está vacío. Instalarlo exige descargar varios GB y aceptar las licencias de Google.

Ariel decidió el 6-nov-2026: **la app se queda en React (PWA) y solo se documenta el pasaje a nativo.** El título y el alcance de la ficha (`fa4a9e72e841-ola-9-ficha.md`) se actualizaron en consecuencia.

## Lo hecho

- `docs/migracion-android.md`: guía completa para pasar la PWA a Android con Capacitor sin reescribir pantallas ni lógica. Cubre:
  - requisitos de la máquina y su estado actual: JDK 21 instalado, Android SDK ausente, `JAVA_HOME` y `ANDROID_HOME` vacíos;
  - dependencias y un `capacitor.config.ts` propuesto, con nombre FERGO, appId, splash y color de tema `#12391F`;
  - icono y splash a partir del mismo logo F, y el service worker registrado solo en la web;
  - el botón Atrás de Android coherente con los 3 niveles de navegación, con el orden de cierre mapeado al estado actual de `App.tsx` y `Registrar.tsx` y una pila de manejadores propuesta;
  - las barras del sistema y la safe-area, incluido Android 15 en modo edge-to-edge;
  - la persistencia de IndexedDB y Dexie en el WebView, con un plan B en SQLite que conserva el modelo de datos;
  - los comandos del APK de depuración y del AAB firmado, este último sin ejecutar y sin crear claves;
  - los pasos que habría que sumar a `scripts/verificar.mjs` (cap sync y APK), con el aviso sobre el tope de 5 minutos;
  - el recorrido de aceptación en Android y las decisiones pendientes.
- No se tocó código, dependencias ni configuración. La PWA queda igual que en la ola 2.

## Pruebas

Se verificó que la base sigue en verde: tipos, la suite completa de 149 pruebas, el build web y la PWA.

PRUEBA: node scripts/verificar.mjs

Resultado al entregar: código 0. 12 archivos de prueba y 149 pruebas en verde. Build correcto; manifiesto y service worker verificados.

## Pendiente (no ejecutado por decisión de alcance)

- Agregar Capacitor, crear el proyecto `android/` y generar el APK de depuración.
- Hacer el recorrido real en emulador o teléfono, con capturas.
- Sumar cap sync y el APK a `scripts/verificar.mjs`.
- Implementar el botón Atrás nativo.
- Verificar la persistencia de datos tras reiniciar el teléfono.

Requisito previo de todo lo anterior: autorizar la instalación del Android SDK. Las decisiones abiertas (appId, SDK, Play Store, notificaciones locales) están en `docs/migracion-android.md` §7. No se plantean como tarjetas porque la migración no se va a ejecutar ahora.

RESUMEN: La app sigue siendo una PWA en React. Quedó documentado, paso a paso, cómo convertirla en app Android con Capacitor cuando se decida. Las 149 pruebas siguen en verde.

ESTADO: Documentar el pasaje a app nativa Android listo para integrar
