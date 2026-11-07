# Ola 9 · QA · Notificaciones, Informes y exportación

Fecha: 2026-11-07. Commit revisado: `7421541` («fep ola 9: Notificaciones, Informes y exportación»). Entorno: Windows, Node 26, Vitest 3.2.4 + jsdom + fake-indexeddb.
Informes de la ola: [ficha](fa4a9e72e841-ola-8-ficha.md) y [frente A](fa4a9e72e841-ola-8-a.md). El diff se leyó con `git show` (sólo lectura); no se hizo commit, push ni reinicio.

Alcance real del commit: `src/features/avisos/`, `src/features/informes/`, `src/features/ajustes/Ajustes.tsx`, `src/sync/`, `public/avisos-sw.js`, cambios en `App.tsx`, `Hoy.tsx`, `Movimientos.tsx`, dos retoques de CSS, `vite.config.ts`, las carpetas `tests/avisos`, `tests/informes`, `tests/accesibilidad` y los dos informes de la ola. Se revisó todo.

## 1. /code-review

Cada hallazgo se trató como hipótesis y se contrastó con el código antes de actuar.

| # | Hallazgo | Veredicto | Qué se hizo |
|---|---|---|---|
| 1 | `ejecutarPlanificador` lee el registro, decide y luego escribe: no es atómico. Dos ejecuciones a la vez avisarían dos veces de lo mismo. `main.tsx` usa `StrictMode` (el efecto de `useAvisosSimulados` corre dos veces en desarrollo) y la app instalada y una pestaña del navegador comparten IndexedDB | Confirmado (lectura de `envio.ts`, `main.tsx` y `useAvisosSimulados.ts`) | Las ejecuciones van de una en una (cola en el módulo y Web Locks si el navegador los tiene). Prueba nueva en `tests/avisos/avisos.test.tsx`: dos ejecuciones simultáneas dejan un solo aviso |
| 2 | `avisos-sw.js`: `v.navigate(url)` no se espera ni se captura; en una ventana que el service worker aún no controla la promesa se rechaza sin manejar | Confirmado (API de `WindowClient.navigate`) | Se captura el rechazo y se sigue con `focus()` |
| 3 | Un resumen diario configurado a las 21:00 se pierde si la app no se abre entre las 21:00 y las 22:00 (en silencio sale a las 08:00, pero `ahoraMin < horaResumen` lo descarta) | Aceptado | Es lo correcto: a las 08:00 el título «Mañana: …» sería falso, porque ya es el día de las visitas. Con servidor el resumen sale a su hora aunque la app esté cerrada |
| 4 | CSV: una nota o un nombre que empiece por `=`, `+` o `@` lo abre Excel como fórmula | Aceptado | Los datos son del propio titular y el archivo es para él. En el .xlsx las cadenas van como `inlineStr`, que nunca son fórmula. Prefijar un apóstrofo alteraría el dato exportado |
| 5 | `registro.claves` de avisos crece sin podar | Aceptado | Unos cientos de KB al año como mucho; podar por antigüedad podría volver a avisar de una alerta de clima aún activa |
| 6 | «Ticket sin subir» queda en todas las fotos mientras no haya servidor | Aceptado | Es cierto (no se subieron) y la ola lo documenta; desaparece al enchufar `ServidorSync` |
| 7 | `AJUSTES_LOCALES` no incluye `ultimo_medio_pago`, `pasos_bienvenida` ni `saldo_inicial_hecho`, que son preferencias de cada móvil | Aceptado | Sin servidor no se envía nada; al enchufarlo hay que decidir qué claves son por móvil. Queda anotado aquí |
| 8 | `avisos-sw.js` abre `data.url` de un push sin comprobar el origen | Aceptado | El payload lo manda el servidor propio; hoy no hay ningún push real. Si se enchufa un servidor de terceros, hay que filtrar a mismo origen |
| 9 | Los tres `tests/*/vitest.config.ts` nuevos son casi idénticos | Aceptado | `verificar.mjs` exige un config propio por carpeta; compartirlos sería un cambio de herramienta, no de calidad del código de la ola |
| 10 | `filasPrestamos` no ordena como las otras hojas | Descartado | `prestamos()` de `domain/cifras.ts` ya devuelve los préstamos ordenados por fecha |
| 11 | El zip STORE y el SpreadsheetML mínimo pueden no abrirse en Excel (cabeceras, CRC, tipos de contenido) | Descartado | Se revisó campo a campo contra la especificación de ZIP/OPC; la prueba `exportar.test.ts` comprueba CRC, estructura y las 5 hojas |
| 12 | `compartirODescargar`: iOS exige gesto del usuario para `navigator.share` | Descartado | `exportar()` no hace ninguna espera antes de llamar a `share`; si falla por otra causa, descarga |
| 13 | `alquilerFurgoneta` cuenta todas las categorías con esa clave, incluidas las borradas | Descartado | Es lo deseado: el histórico de una categoría borrada y recreada (`categoriaDescuentoFianza`) sigue siendo alquiler |
| 14 | `sincronizar` marca como enviado lo que cambió mientras se enviaba | Descartado | Se marca con la versión leída al empezar (`c.version`): si cambió después, sigue pendiente. Lectura del código; ninguna prueba cubre el cambio concurrente |
| 15 | Enlaces profundos: un `?ir=` inválido o con un id inexistente rompe el arranque | Descartado | `destinoDeUrl` devuelve `null` si no es válido y `App` lo ignora; la validación de `a=` ahora usa una sola lista (hallazgo 18) |

HALLAZGO: ejecutarPlanificador no era atómico y dos ejecuciones a la vez duplicaban avisos → corregido
HALLAZGO: avisos-sw.js no capturaba el rechazo de navigate() → corregido
HALLAZGO: resumen diario perdido si la app estuvo cerrada de 21:00 a 22:00 → aceptado
HALLAZGO: CSV abre como fórmula un texto que empieza por = + @ → aceptado
HALLAZGO: registro de claves de avisos sin podar → aceptado
HALLAZGO: «Ticket sin subir» permanente mientras no haya servidor → aceptado
HALLAZGO: AJUSTES_LOCALES sin las preferencias propias de cada móvil → aceptado
HALLAZGO: avisos-sw.js abre la URL de un push sin filtrar el origen → aceptado
HALLAZGO: tres vitest.config.ts casi idénticos en tests/ → aceptado
HALLAZGO: filasPrestamos sin ordenar → descartado
HALLAZGO: zip STORE y SpreadsheetML mínimo no válidos para Excel → descartado
HALLAZGO: navigator.share sin gesto de usuario en iOS → descartado
HALLAZGO: alquilerFurgoneta cuenta categorías borradas → descartado
HALLAZGO: sincronizar marca como enviado lo que cambió durante el envío → descartado
HALLAZGO: enlace profundo inválido rompe el arranque → descartado

## 2. /simplify

Sin cambiar comportamiento:

| # | Qué | Cambio |
|---|---|---|
| 16 | `src/screens/Marcador.tsx` y `.marcador` de `app.css` quedaron sin uso cuando Ajustes e Informes pasaron a ser pantallas reales | Borrados; el comentario de la sección de CSS ya no habla de «pantallas marcador» |
| 17 | `registrarAvisoSimulado` y el cuerpo de `ejecutarPlanificador` repetían la transacción que anota los avisos | Una sola `anotarAvisos`; `registrarAvisoSimulado` la reutiliza |
| 18 | `App.tsx` repetía la lista de subpantallas de Ajustes para validar `?ir=ajustes&a=…` | `SUB_AJUSTES` exportada desde `Ajustes.tsx` junto al tipo `SubAjuste` |
| 19 | `AjustesAvisos` tenía `guardar` y `guardarFurgo` con el mismo `try/catch` | Una función `aplicar` que ambas usan |
| 20 | `InstalacionAvisos` y `BandaAvisos` repetían el estado del permiso y el `useEffect` de `visibilitychange` | Hook local `usePermiso` |
| 21 | `hayServidor` en `sincronizacion.ts` no lo usa nadie | Quitada |

HALLAZGO: Marcador.tsx y su CSS sin uso tras la ola → corregido
HALLAZGO: transacción de anotar avisos repetida en envio.ts → corregido
HALLAZGO: lista de subpantallas de Ajustes duplicada en App.tsx → corregido
HALLAZGO: try/catch repetido en guardar y guardarFurgo de AjustesAvisos → corregido
HALLAZGO: estado del permiso de avisos repetido en InstalacionAvisos y BandaAvisos → corregido
HALLAZGO: hayServidor exportada y sin uso → corregido

## 3. Markdown de la ola

- La ola dejó dos informes, ya en `review/factory/` y sin duplicados: [`fa4a9e72e841-ola-8-ficha.md`](fa4a9e72e841-ola-8-ficha.md) y [`fa4a9e72e841-ola-8-a.md`](fa4a9e72e841-ola-8-a.md). Con este informe son tres.
- Enlaces: en el frente A, la ficha era texto en código y ahora es un enlace vivo, y se añadió el enlace a este QA. Se comprobó que existen `docs/maqueta.md`, `docs/criterios-aceptacion.md`, `docs/releases/0.1.0.md`, `docs/migracion-android.md` y `review/factory/`. Los logs que cita el frente A (`.temp/a/o9-verificar1.log` y `-2.log`) existen.
- Observación sin tocar: Factory nombra esta ola «ola 8» en los archivos y el commit la llama «ola 9»; además ya existen `fa4a9e72e841-ola-9-*.md` (la guía de Android). Los nombres los pone Factory, así que no se renombró nada.
- El frente A dice que `tests/avisos` tiene 22 pruebas; con la prueba nueva de este QA son 23.

HALLAZGO: el frente A citaba la ficha sin enlace y no enlazaba el QA → corregido

## 4. README

- `README.md` (raíz): el estado decía «ola 8» y no mencionaba nada de la ola 9. Ahora describe la v1 completa sin servidor, y se añadieron las viñetas de Avisos, Informes, Exportar datos y Sin conexión y sincronización. En Estructura se quitó «marcadores» y se añadieron `src/features/ajustes/`, `src/features/avisos/`, `src/features/informes/`, `src/sync/`, `public/avisos-sw.js` y todas las carpetas de `tests/`. En Documentación se enlazan la matriz de criterios y las notas de la versión 0.1.0.
- `package.json`: la descripción seguía diciendo «Ola 2: base de la app y registro de gastos»; ahora es «FERGO · App de gestión (PWA).».
- `mobile/README.md`: no aplica. No existe `mobile/` y la ola no tocó la app del celular.

HALLAZGO: README de la raíz desactualizado (ola 8, sin avisos, informes, exportación ni sincronización) → corregido
HALLAZGO: descripción de package.json atascada en la ola 2 → corregido

## Pruebas

PRUEBA: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
PRUEBA: node node_modules/typescript/bin/tsc -p tests/avisos
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/avisos/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/informes/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/accesibilidad/vitest.config.ts
PRUEBA: node scripts/verificar.mjs

Resultado con el código final: `node scripts/verificar.mjs` con código 0 («OK: verificación completa»; log en `.temp/a/o8-qa3-verificar.log`). Tipos del proyecto y de cada carpeta de pruebas OK, `vitest run` de `src/` en verde (36 archivos), carpetas `tests/*/` en verde (accesibilidad 15, agenda-clima 37, alertas 14, avisos 23, clientes-ubicacion 29, clima 42, informes 5, preparacion 36, preparar 12), build y PWA correctos.

Sin medir: el service worker (`avisos-sw.js`) no se ejecutó en un navegador real; el cambio de `navigate` se revisó contra la API y la prueba de Web Locks no es posible en jsdom (no los tiene), así que la prueba nueva cubre la cola del módulo.

Archivos tocados por este QA: `public/avisos-sw.js`, `src/App.tsx`, `src/features/ajustes/Ajustes.tsx`, `src/features/avisos/AjustesAvisos.tsx`, `src/features/avisos/InstalacionAvisos.tsx`, `src/features/avisos/envio.ts`, `src/styles/app.css`, `src/sync/sincronizacion.ts`, `src/screens/Marcador.tsx` (borrado), `tests/avisos/avisos.test.tsx`, `README.md`, `package.json`, `review/factory/fa4a9e72e841-ola-8-a.md` y este informe. No quedan temporales fuera de `.temp/`.

Nota para la integración: el árbol tenía otros cambios pendientes que no son de este QA ni de la ola 9 (`src/features/alertas/preparacion/*`, `src/features/preparar/*`, `scripts/publicar.mjs`, `review/factory/fa4a9e72e841-ola-7-qa-4.md`, `tsconfig.tsbuildinfo`). No se tocaron; la verificación completa pasó con ellos presentes.

ESTADO: QA ola 9 listo para integrar
