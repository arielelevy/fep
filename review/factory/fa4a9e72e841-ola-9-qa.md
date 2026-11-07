# Ola 3 · QA · Documentar el pasaje a app nativa Android

Fecha: 2026-11-07. Commit revisado: `23aa9b6`. Entorno: Windows 11, Node 26.13.0, Vitest 3.2.4 + jsdom + fake-indexeddb.
Informes de la ola: [ficha](fa4a9e72e841-ola-9-ficha.md), [frente A](fa4a9e72e841-ola-9-a.md). Guía revisada: [docs/migracion-android.md](../../docs/migracion-android.md).

Alcance real del commit: la guía `docs/migracion-android.md`, el `README.md` de la raíz, los informes de la ola 9 y, además, las correcciones del QA de la ola 2 (`src/`, `qaOla2.test.tsx`, `fa4a9e72e841-ola-2-qa.md`). Se revisó todo.

## 1. /code-review

Cada hallazgo se contrastó con el código o con el documento antes de actuar.

| # | Hallazgo | Veredicto | Qué se hizo |
|---|---|---|---|
| 1 | Guía §5.3: el paso «APK de depuración» usa `join('android', 'gradlew.bat')` con `cwd: ruta('android')`; la ruta relativa se resuelve desde `android/` y apunta a `android/android/gradlew.bat` | Confirmado (lectura de `correr()` en `scripts/verificar.mjs`) | Cambiado a `ruta('android', …)` (absoluta) con un comentario |
| 2 | Guía §1: «las 149 pruebas» ya no es cierto (hoy 154) y se volverá a quedar viejo | Confirmado | Se quita el número: «las pruebas no cambian» |
| 3 | `README.md` no enlaza la guía de Android ni dice que el pasaje está sólo documentado | Confirmado | Estado y Documentación actualizados con el enlace |
| 4 | Guía §3.5: el orden del botón Atrás no contempla la guía de instalación ni el aviso de borrador pendiente de `App.tsx` | Aceptado | La guía se desactiva en nativo (§3.4) y el aviso de borrador no es modal; se decide al implementar el botón |
| 5 | `editarMovimiento` llama a `categoria()` dentro de una transacción Dexie (una llamada asíncrona ajena rompería la transacción) | Descartado | `categoria()` sólo hace `db.categorias.get`, y `categorias` está en el ámbito de la transacción |
| 6 | `Registrar.guardar` comprueba `cerrojo.ocupado` (estado, puede llegar viejo en el mismo tick) | Descartado | La guarda real es `cerrojo.tomar()`, síncrona sobre un ref; la prueba de doble toque lo cubre |
| 7 | El `timeout: 5000` de `App.test.tsx` puede ocultar una lentitud real del guardado | Aceptado | Intermitencia por carga de la máquina documentada en el QA de la ola 2; la suite pasó entera sin fallos |
| 8 | Guía §3.4 propone `injectRegister: null` | Descartado | `vite-plugin-pwa` 1.0.0 acepta `null`/`false` en `injectRegister` |
| 9 | El resto de afirmaciones de la guía (`viewport-fit=cover`, `env(safe-area-inset-*)`, `--alto-barra: 84px`, `debeMostrarGuia`, estados `borradorPendiente`/`hoja`/`sub`/`pestana`, `confirmar`/`verMas`, `useEnLinea`, «¿Descartar este gasto?», `scripts/generar-iconos.mjs`) | Descartado | Todas existen en el código tal como se citan |

HALLAZGO: ruta de gradlew relativa con cwd en android/ en el paso propuesto para verificar.mjs → corregido
HALLAZGO: número de pruebas desactualizado en la guía de Android → corregido
HALLAZGO: README sin enlace a la guía de Android ni estado del pasaje → corregido
HALLAZGO: orden del botón Atrás sin la guía de instalación ni el aviso de borrador → aceptado
HALLAZGO: categoria() dentro de la transacción de editarMovimiento → descartado
HALLAZGO: guarda de doble guardado basada en estado → descartado
HALLAZGO: timeout de 5 s en App.test.tsx oculta lentitud → aceptado
HALLAZGO: injectRegister: null no admitido → descartado
HALLAZGO: referencias de la guía a código inexistente → descartado

## 2. /simplify

Sin cambios de código. Las piezas de `src/` de este commit ya pasaron por /simplify en el QA de la ola 2 (`useCerrojo`, `fijarEliminado`, `fechaMaximaRegistro`, `INGRESOS_NEGOCIO`, `etiquetaEliminado`, `useMemo`). No se encontró más reuso ni duplicación sin cambiar comportamiento. En la guía, la única simplificación fue quitar el número de pruebas (hallazgo 2).

## 3. Markdown de la ola

- Informes en `review/factory/`, sin duplicados: `-ola-9-ficha`, `-ola-9-a`, `-ola-2-qa` y este informe. La guía queda en `docs/`.
- Enlaces comprobados: `docs/maqueta.md`, `docs/migracion-android.md`, `review/factory/` y `FERGO App Mockups.pdf` existen.
- Observación sin tocar: el commit se llama «ola 3», pero sus informes usan el prefijo `ola-9`. Además, `review/factory/fa4a9e72e841-ola-3-ficha.md` (sin commitear) describe otra ola: «Clientes, cobros, aportes y fianzas». Factory pone esos nombres, así que no se renombró nada. Este informe usa la ruta pedida.

## 4. README

- `README.md` (raíz): el estado aclara que la app sigue siendo una PWA y que el pasaje a Android está documentado, no ejecutado. Se añade el enlace a la guía en Documentación.
- `mobile/README.md`: no aplica. No existe `mobile/` y la ola no tocó la app.

## Pruebas

PRUEBA: node scripts/verificar.mjs

Resultado con el código final: código 0. Tipos OK, 13 archivos y 154 pruebas en verde, build correcto, manifiesto y service worker verificados («OK: verificación completa»).

Sin medir: la guía de Android no se ejecutó (no hay Android SDK; decisión de alcance del 6-nov-2026). El hallazgo 1 se corrigió leyendo el código, sin correr Gradle.

Archivos tocados: `docs/migracion-android.md`, `README.md`, `review/factory/fa4a9e72e841-ola-9-qa.md` (nuevo). No quedan temporales fuera de `.temp/` ni de carpetas ignoradas.

ESTADO: QA ola 3 listo para integrar
