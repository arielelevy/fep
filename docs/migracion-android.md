# FERGO · Pasaje de la PWA a app Android nativa (Capacitor)

| | |
|---|---|
| Estado | **Documentado, no ejecutado.** Por decisión de Ariel (6 de noviembre de 2026), la app sigue siendo una PWA en React. Este documento deja listo el camino para envolverla en una app Android cuando se decida. |
| Base | App de la ola 2: React + TypeScript + Vite, `vite-plugin-pwa`, Dexie (IndexedDB). |
| Principio | Una sola base de código para web y Android. No se reescribe ninguna pantalla ni lógica: Capacitor carga el mismo `dist/` dentro de un WebView. |

## 1. Por qué Capacitor

- Envuelve el build web tal cual (`dist/`) en un proyecto Android nativo. Las pantallas, los tokens, el microcopy y las pruebas no cambian.
- Da acceso nativo cuando haga falta: botón Atrás, barra de estado, splash, notificaciones locales o push, cámara y almacenamiento persistente.
- La PWA sigue compilando igual (`npm run build`); Android es una salida más del mismo build.

Alternativas descartadas: reescribir en React Native o Flutter (rehace todo), o usar una TWA (Trusted Web Activity), que no da acceso nativo al botón Atrás ni a notificaciones locales programadas.

## 2. Requisitos de la máquina

| Herramienta | Versión | Estado en la máquina de desarrollo (6-nov-2026) |
|---|---|---|
| Node | ≥ 20 | 26.13.0 instalado |
| JDK | 21 | Instalado en `C:\Program Files\Java\jdk-21`, pero `JAVA_HOME` está vacío |
| Android SDK (platform-tools, build-tools, plataforma de la API objetivo) | La que pida la versión de Capacitor elegida | **No instalado** (no está en `%LOCALAPPDATA%\Android\Sdk` y `ANDROID_HOME` está vacío) |
| Emulador o teléfono Android con depuración USB | — | Pendiente |

Instalar el SDK (Android Studio o `cmdline-tools`) supone aceptar las licencias de Google y descargar varios GB. Requiere autorización explícita.

Variables de entorno, en PowerShell:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

## 3. Pasos de la migración

### 3.1 Dependencias y configuración

```powershell
npm install @capacitor/core @capacitor/app @capacitor/status-bar @capacitor/splash-screen
npm install -D @capacitor/cli @capacitor/android @capacitor/assets
```

Se fijan versiones exactas en `package.json`, como en el resto del proyecto. Capacitor 7 o posterior trae Android con API 35 o superior.

`capacitor.config.ts` en la raíz:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'es.fergo.gestion', // a decidir: ver §7
  appName: 'FERGO',
  webDir: 'dist',
  android: { backgroundColor: '#F4F6EF' },
  plugins: {
    SplashScreen: { backgroundColor: '#FFFFFF', launchShowDuration: 600, showSpinner: false },
    StatusBar: { backgroundColor: '#12391F', style: 'DARK', overlaysWebView: false },
  },
};
export default config;
```

`webDir: 'dist'` reutiliza el build de Vite sin cambios. Capacitor sirve la app en `https://localhost`, así que `base: '/'` de `vite.config.ts` sigue siendo válido.

### 3.2 Proyecto Android

```powershell
npm run build                 # build web (el mismo que la PWA)
npx cap add android           # crea android/ en la raíz (se commitea)
npx cap sync android          # copia dist/ y plugins al proyecto nativo
```

### 3.3 Icono y splash

Fuente: el mismo logo F de FERGO sobre fondo blanco que generan `scripts/generar-iconos.mjs` y `public/icono-512.png`.

```powershell
# assets/icon-only.png (1024 × 1024, F sobre blanco) y assets/splash.png (2732 × 2732, F centrada sobre blanco)
npx capacitor-assets generate --android --iconBackgroundColor '#FFFFFF' --splashBackgroundColor '#FFFFFF'
```

Conviene ampliar `scripts/generar-iconos.mjs` para que también escriba esos dos PNG. Así el logo sale de una sola fuente.

Color de tema: `#12391F` en la barra de estado (plugin StatusBar) y en `android/app/src/main/res/values/styles.xml` (`colorPrimary`, `colorPrimaryDark`).

### 3.4 Service worker dentro de la app nativa

En Android, los archivos ya vienen empaquetados en el APK, así que el service worker de la PWA sobra y puede servir versiones viejas tras actualizar. Hay que registrarlo solo en la web:

```ts
// src/main.tsx
import { Capacitor } from '@capacitor/core';
if (!Capacitor.isNativePlatform()) {
  // registro del SW de vite-plugin-pwa (virtual:pwa-register)
}
```

Para eso, en `vite.config.ts` se cambia `injectRegister: 'auto'` por `injectRegister: null` y se registra a mano con `registerSW()` desde `virtual:pwa-register`. La guía de instalación (`debeMostrarGuia`) también debe devolver `false` si `Capacitor.isNativePlatform()`.

### 3.5 Botón Atrás de Android (navegación de máximo 3 niveles, §5.3.4 y §7)

Orden de prioridad, de más interno a más externo. Corresponde al estado que ya tiene `src/App.tsx` (`borradorPendiente`, `hoja`, `sub` y `pestana`) y a los diálogos internos de `Registrar.tsx` (`confirmar`, `verMas`):

1. Si hay un diálogo de confirmación abierto: se cierra, igual que su botón secundario.
2. Si está abierta la lista «Más» de categorías: se cierra.
3. Si hay una hoja abierta (Registrar, Saldo inicial): se cierra con la misma lógica que la X. Con datos sin guardar, aparece «¿Descartar este gasto?».
4. Si se está en una pantalla de segundo nivel (Alertas, Ajustes, Informes): se vuelve a la pestaña.
5. Si se está en una pestaña distinta de Hoy: se va a Hoy.
6. En Hoy: se sale de la app (`App.exitApp()`).

Implementación propuesta: un pequeño registro de «manejadores de Atrás» en pila. Cada componente que abre algo apila su cierre y lo desapila al desmontarse. Un único listener los atiende:

```ts
// src/lib/atras.ts
import { App } from '@capacitor/app';
const pila: Array<() => void> = [];
export function alAtras(cerrar: () => void) { pila.push(cerrar); return () => { const i = pila.lastIndexOf(cerrar); if (i >= 0) pila.splice(i, 1); }; }
App.addListener('backButton', () => { const cerrar = pila.at(-1); if (cerrar) cerrar(); else App.exitApp(); });
```

En la web, el mismo registro puede engancharse a `popstate` para que el gesto Atrás del navegador se comporte igual. Las pruebas de interfaz pueden simular el botón llamando al último manejador de la pila.

### 3.6 Barras del sistema y safe-area

- El CSS ya usa `env(safe-area-inset-*)` en la cabecera, la barra inferior, las hojas y la barra Deshacer (`src/styles/app.css`). Con `viewport-fit=cover` (ya está en `index.html`) funciona igual en el WebView.
- Con `StatusBar.overlaysWebView: false`, la barra de estado no tapa la cabecera. Desde Android 15 (edge-to-edge obligatorio), hay que comprobar en el emulador que los insets llegan al WebView. Si no llegan, se usa el plugin de safe-area de la versión de Capacitor elegida.
- Hay que comprobar con navegación por gestos y con los 3 botones que la barra inferior (84 px más el inset) no queda debajo de la barra de navegación del sistema.

## 4. Datos locales y funcionamiento sin conexión

- **IndexedDB en el WebView de Android** se guarda en los datos privados de la app (`/data/data/<appId>/app_webview/`). Persiste al cerrar la app y al reiniciar el teléfono. Solo se borra al desinstalar o con «Borrar datos» en Ajustes del sistema.
- **Riesgo de desalojo:** bajo, porque es el almacenamiento propio de la app y no la caché de un navegador. Para pedir almacenamiento persistente también en la web, al arrancar: `navigator.storage?.persist?.()`.
- **Plan B**, solo si el recorrido real muestra pérdida de datos: pasar Dexie a SQLite con `@capacitor-community/sqlite`, detrás de la misma interfaz de `src/db/repo.ts`. El modelo no cambia: céntimos enteros, UUID generados en el cliente y borrado lógico con `eliminado_en`.
- **Sin conexión:** la app nativa no necesita red. Todo va dentro del APK y los datos en IndexedDB. La banda «Sin conexión» (`useEnLinea`) sigue funcionando con `navigator.onLine` en el WebView.
- **Fuente:** Plus Jakarta Sans ya se autoaloja en `dist/assets`, así que también queda dentro del APK.

## 5. Compilar

### 5.1 APK de depuración (instalable)

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
# Resultado: android\app\build\outputs\apk\debug\app-debug.apk
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Lo firma la clave de depuración que crea el SDK (`%USERPROFILE%\.android\debug.keystore`). Sirve para probar en emuladores y teléfonos, no para la Play Store.

### 5.2 AAB firmado de producción (no ejecutar sin autorización)

1. Crear la clave de subida. La crea y la custodia el responsable de FERGO o de IT, **nunca el repo**:
   `keytool -genkeypair -v -keystore fergo-subida.jks -alias fergo -keyalg RSA -keysize 2048 -validity 10000`
2. Guardar las rutas y contraseñas en `android/keystore.properties` (y añadir ese archivo a `.gitignore`) o en variables de entorno del CI.
3. En `android/app/build.gradle`, añadir un `signingConfigs.release` que lea esos valores y usarlo en `buildTypes.release`.
4. `.\gradlew.bat bundleRelease` → `android\app\build\outputs\bundle\release\app-release.aab`.
5. Subirlo a Play Console con Play App Signing. Eso requiere una cuenta de desarrollador de Google: fuera de alcance hasta que se autorice.

### 5.3 `scripts/verificar.mjs`

Cuando se ejecute la migración, el verificador debe sumar dos pasos tras el build web:

```js
correr('Capacitor sync', node, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
if (process.env.ANDROID_HOME) {
  // Ruta absoluta: con cwd en android/, una relativa ('android/gradlew') apuntaría a android/android/.
  correr('APK de depuración', ruta('android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), ['assembleDebug', '-q'], { cwd: ruta('android'), shell: process.platform === 'win32' });
}
```

Aviso: el primer build de Gradle descarga dependencias y puede superar el tope de 5 minutos de Factory. Hay que precalentar la caché de Gradle o correr el APK como prueba aparte.

## 6. Recorrido de aceptación en Android (cuando se ejecute)

En emulador o teléfono, con capturas de cada paso:

1. Instalar el APK (`adb install`) y abrir FERGO: icono F, splash blanco y barra de estado `#12391F`.
2. Primer uso: bienvenida de 3 pasos y saldo inicial.
3. Modo avión: registrar un gasto en 3 toques y ver la banda «Sin conexión».
4. «Deshacer» antes de 8 s: las cifras vuelven al valor anterior. Registrar otro gasto y ver Hoy actualizado.
5. Cerrar la app desde recientes, reabrirla y comprobar que los datos siguen. Reiniciar el teléfono y comprobar de nuevo.
6. Botón Atrás: con una hoja abierta cierra la hoja; en Alertas vuelve a Hoy; en Movimientos va a Hoy; en Hoy sale de la app.
7. Comprobar que la PWA web sigue funcionando: `npm run build` y `node scripts/verificar.mjs` en verde.

## 7. Decisiones pendientes antes de ejecutar

- **appId** de la app (permanente una vez publicada): propuesta `es.fergo.gestion`. Depende del dominio de FERGO.
- **Autorizar la instalación del Android SDK** en la máquina de desarrollo o en un CI, con licencias de Google.
- **Cuenta de Google Play** y custodia de la clave de subida, si se va a publicar.
- **Notificaciones:** en la app nativa podrían programarse notificaciones locales (plugin Local Notifications), lo que en la PWA de iOS no se puede (§12.4). Habría que revisar si eso cambia la arquitectura de avisos del servidor.
