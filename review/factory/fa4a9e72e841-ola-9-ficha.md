# Ola 9: Migración a app nativa Android

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión

Ficha escrita por Factory desde el registro de progreso de la ola (propuesta sin Markdown).

## Alcance

Ariel 2026-11-06: pasar la app a nativa antes de la ola 3. Se envuelve con Capacitor la app React de la ola 2 para conservar código, pantallas, datos y pruebas, y sale un APK instalable. Las olas siguientes se construyen sobre la app nativa.

## Por qué

Ariel 2026-11-06: pasar la app a nativa antes de la ola 3. Se envuelve con Capacitor la app React de la ola 2 para conservar código, pantallas, datos y pruebas, y sale un APK instalable. Las olas siguientes se construyen sobre la app nativa.

## Logros

- App Android nativa con Capacitor, instalable como APK
- Datos locales y funcionamiento sin conexión en la app nativa
- Pruebas y verificación de la migración

## Feature: App Android nativa con Capacitor, instalable como APK

- Agregar Capacitor (Android) al proyecto React+Vite existente, sin reescribir pantallas ni lógica.
- Proyecto Android con nombre FERGO, id de aplicación, ícono F de FERGO, splash y color de tema #12391F.
- Generar un APK de depuración instalable (comando documentado) y dejar el paso a AAB firmado documentado para después.
- Barras de estado y navegación del sistema y safe-area respetadas; botón Atrás de Android coherente con la navegación de 3 niveles.

## Feature: Datos locales y funcionamiento sin conexión en la app nativa

- Verificar que IndexedDB/Dexie persiste entre cierres de la app nativa y tras reiniciar el teléfono; si no, migrar el almacenamiento al plugin adecuado sin perder el modelo de datos.
- La app abre y registra gastos sin red.
- La PWA web sigue compilando: una sola base de código para web y Android.

## Feature: Pruebas y verificación de la migración

- Las 149 pruebas de la ola 2 siguen en verde.
- scripts/verificar.mjs suma la sincronización de Capacitor y el build del APK de depuración.
- Recorrido real en emulador o teléfono Android: instalar el APK, primer uso, registrar un gasto con deshacer y ver Hoy actualizado; capturas en el informe.
