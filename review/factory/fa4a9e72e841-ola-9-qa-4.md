# Ola 9 · QA 4 · Notificaciones, Informes y exportación

Fecha: 2026-11-07. Commit de la ola: `7421541`. Entorno: Windows, Node 26, Vitest 3.2.4 + jsdom + fake-indexeddb.
Informes de la ola: [ficha](fa4a9e72e841-ola-8-ficha.md), [frente A](fa4a9e72e841-ola-8-a.md) y el QA anterior, [QA 3](fa4a9e72e841-ola-8-qa-3.md). El diff se leyó con `git show` y `git diff` (sólo lectura); no se hizo commit, push ni reinicio.

Se contrastó el diff de la ola con el código actual, que ya incluye las correcciones del QA 3 y el cierre de sus hallazgos aceptados (`f0f3b0d`). No se repiten los hallazgos del QA 3 que ya están cerrados (p. ej. la neutralización de fórmulas en CSV, la poda de claves avisadas y el filtro de origen de `avisos-sw.js`, todos presentes en el código).

## 1. /code-review

Cada hallazgo se trató como hipótesis y se contrastó con el código antes de actuar.

| # | Hallazgo | Veredicto | Qué se hizo |
|---|---|---|---|
| 1 | `planificar` busca la alerta de preparación de cada aviso por `tipo` y `texto`; dos alertas del mismo tipo con el mismo texto (p. ej. dos reservas con los mismos clientes el mismo día) mezclarían cuerpo y acciones. La clave del aviso (`inmediata\|<clave_dedupe>`) es exacta | Confirmado (lectura de `planificador.ts` y de `motor.ts`: el texto no es único por construcción) | Se busca por `claveInmediata(x) === aviso.clave` |
| 2 | `useSincronizacion` llama a `sincronizar()` cada 60 s aunque no haya servidor (el estado real de la app instalada); `cambiosPendientes` lee todas las tablas y todos los ajustes para devolver un número que nadie usa | Confirmado (`sincronizar` calcula los pendientes antes de mirar si hay servidor; el hook descarta el resultado) | El hook no llama a `sincronizar()` mientras `hayServidor()` sea falso. `sincronizar()` conserva su contrato (las pruebas lo llaman directo) |
| 3 | `anotarAvisos` y `marcarAvisados` (preparación) y `marcarNotificadas` (clima) son tres escrituras seguidas: un cierre de la app entre ellas dejaría un aviso inmediato de preparación sin marcar y se repetiría | Aceptado | La ventana es de milisegundos y el resumen diario no se repite (su clave va en el registro, que se escribe primero). Unirlas en una transacción obligaría a tocar el estado de las olas 7 y 8 |
| 4 | `filasMovimientos` ordena por `fecha` (ISO) con desempate por `creado_en`; un `localeCompare` sobre ISO con zona distinta podría desordenar | Descartado | `Registrar.tsx` guarda siempre `toISOString()` (UTC), por lo que el orden de texto es cronológico |
| 5 | `textoCsv` neutraliza con `'` cualquier texto que empiece por `-`; una nota «-5 € de descuento» cambia | Descartado | Es la protección pedida en el cierre de aceptados (`f0f3b0d`); los importes van aparte, como número, y no se tocan |
| 6 | `crearZip` usa la hora local del móvil en la cabecera; Excel puede ver fechas raras | Descartado | Es sólo la fecha de modificación del archivo dentro del zip; no afecta al contenido ni a la validez |
| 7 | `ExportarDatos`: con `cancelado` (el usuario cierra la hoja de compartir) no queda mensaje | Descartado | Es lo esperado: no es un error ni un éxito |
| 8 | `InstalacionAvisos` no relee el permiso tras `requestPermission` si el navegador lo devuelve como `default` | Descartado | `pedirPermiso()` ya devuelve `pendiente` y el estado se asigna con ese valor |

HALLAZGO: planificar casaba la alerta de preparación por tipo y texto, no por clave → corregido
HALLAZGO: la sincronización leía todas las tablas cada minuto sin servidor → corregido
HALLAZGO: tres escrituras seguidas al enviar un aviso (registro, preparación, clima) no son atómicas → aceptado
HALLAZGO: orden de movimientos por fecha ISO → descartado
HALLAZGO: apóstrofo en el CSV a textos que empiezan por «-» → descartado
HALLAZGO: hora local en la cabecera del zip del .xlsx → descartado
HALLAZGO: exportar sin mensaje al cancelar la hoja de compartir → descartado
HALLAZGO: permiso de avisos sin releer tras pedirlo → descartado

## 2. /simplify

Sin cambiar comportamiento:

| # | Qué | Cambio |
|---|---|---|
| 9 | `avisos/planificador.ts` tenía su propia `minutos("HH:MM")`, idéntica a la exportada por `clima/horas.ts` | Se importa `minutos` de `clima/horas` |
| 10 | El mismo archivo repetía dos veces «trocear `HH:MM` y llamar a `desdeMadrid`» (`resumenEnSilencio` y `visitasPrevias`), que es `instanteLocal` de `preparar/logica.ts` | Las dos usan `instanteLocal(`${dia}T${hhmm}`)`; se quitan el `split` de la fecha y la importación de `desdeMadrid` |

HALLAZGO: minutos() duplicada en avisos/planificador.ts → corregido
HALLAZGO: conversión de «día + HH:MM» a instante repetida en avisos/planificador.ts → corregido

No se encontró más reuso sin cambiar comportamiento en `informes/`, `sync/` ni en las pantallas de avisos (el QA 3 ya unificó `anotarAvisos`, `aplicar`, `usePermiso` y `SUB_AJUSTES`).

## 3. Markdown de la ola

- La ola dejó dos informes, en `review/factory/` y sin duplicados: [`fa4a9e72e841-ola-8-ficha.md`](fa4a9e72e841-ola-8-ficha.md) y [`fa4a9e72e841-ola-8-a.md`](fa4a9e72e841-ola-8-a.md). Con el QA 3 y este informe son cuatro. No hay informes sueltos en la raíz ni en otras carpetas.
- Enlaces: se comprobaron todos los enlaces relativos de `README.md`, `docs/` y `review/` con un script de sólo lectura; ninguno está roto. Los logs que cita el frente A (`.temp/a/o9-verificar1.log` y `-2.log`) existen.
- Observación sin tocar: Factory nombra esta ola «ola 8» en los archivos (`-ola-8-*`) y el commit la llama «ola 9»; los `fa4a9e72e841-ola-9-*.md` anteriores describen la guía de Android (otra ola) y el QA de esa ola se titula «Ola 3». Los nombres los pone Factory, así que no se renombró nada.

HALLAZGO: informes de la ola dispersos o duplicados → descartado (ya estaban en review/factory/ sin duplicados)
HALLAZGO: enlaces rotos en README, docs y review → descartado (comprobados, ninguno roto)

## 4. README

- `README.md` (raíz): el contenido de la ola ya estaba (avisos, informes, exportación, sincronización, estructura y carpetas de `tests/`). Se corrigió Documentación: sólo enlazaba las notas de la 0.1.0 y ahora enlaza también [`docs/releases/1.0.0.md`](docs/releases/1.0.0.md), que describe la v1 completa.
- `mobile/README.md`: no aplica. No existe `mobile/` y la ola no tocó la app del celular.

HALLAZGO: README sin enlace a las notas de la versión 1.0.0 → corregido

## Pruebas

PRUEBA: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
PRUEBA: node node_modules/typescript/bin/tsc -p tests/avisos
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/avisos/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/accesibilidad/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run

Resultado con el código final: tipos del proyecto y de `tests/avisos` sin errores; `tests/avisos` 23 de 23 (planificador 13, avisos 10); `tests/accesibilidad` 15 de 15 (incluye la sincronización con servidor simulado y el evento `online`); `vitest run` de `src/` 391 de 391 en 36 archivos.

Sin medir: no se corrió `node scripts/verificar.mjs` (build y PWA) porque no se tocó nada que los afecte: sólo `planificador.ts`, `useSincronizacion.ts` y el README. El service worker (`avisos-sw.js`) no se ejecutó en un navegador real y no se cambió.

Archivos tocados por este QA: `src/features/avisos/planificador.ts`, `src/sync/useSincronizacion.ts`, `README.md` y este informe. No quedan temporales fuera de `.temp/`.

ESTADO: QA ola 9 listo para integrar
