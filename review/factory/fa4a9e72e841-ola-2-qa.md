# Ola 2 · QA · Base de la app y registro de gastos

Fecha: 2026-11-06. Commit revisado: `f891b5f`. Entorno: Windows 11, Node 26.13.0, npm 11.20.0, Vitest 3.2.4 + jsdom + fake-indexeddb.
Informes de la ola: [ficha](fa4a9e72e841-ola-2-ficha.md), [frente A](fa4a9e72e841-ola-2-a.md), [frente B](fa4a9e72e841-ola-2-b.md).

Línea de base antes de tocar nada: `node scripts/verificar.mjs` en verde (12 archivos, 149 pruebas, build y PWA OK).

## 1. /code-review (nivel medium)

10 hallazgos. Cada uno se contrastó con el código antes de corregirlo.

| # | Hallazgo | Veredicto | Qué se hizo |
|---|---|---|---|
| 1 | `Registrar.guardar` sin guarda: un doble toque crea dos gastos (y dos fotos) | Confirmado | Cerrojo síncrono (`useCerrojo`) y botón desactivado mientras guarda. Prueba nueva |
| 2 | `SaldoInicial.guardar` sin guarda: doble toque duplica el saldo | Confirmado | Mismo cerrojo |
| 3 | Movimientos no deja pasar del mes actual, pero Registrar admite hasta +7 días: un gasto previsto del mes siguiente queda invisible e ineditable | Confirmado | El selector llega hasta el mes de hoy + 7 días. Prueba nueva con la fecha fijada al 28-10 |
| 4 | Deslizar para eliminar: `.mov-contenido` hereda `touch-action: manipulation`; el navegador se queda el gesto horizontal y lanza `pointercancel` | Confirmado por especificación de Pointer Events (no medido en un móvil) | `touch-action: pan-y` en `.mov-contenido` |
| 5 | `FilaMovimiento.eliminar` sin try/catch ni aviso; etiqueta «Gasto eliminado» para cualquier tipo | Confirmado el try/catch; la etiqueta, aceptada | try/catch con aviso «No se pudo eliminar…». En esta ola sólo existen gastos y saldo inicial; la etiqueta queda centralizada en `etiquetaEliminado` para ampliarla cuando lleguen cobros, aportes y fianzas |
| 6 | Al editar, el aviso de importe atípico vuelve a saltar aunque no cambien importe ni categoría | Confirmado | Sólo se comprueba si cambia el importe o la categoría. Prueba nueva |
| 7 | El tope de +7 días es sólo el atributo `max`; escribiendo a mano se acepta cualquier fecha | Confirmado | `onChange` ignora fechas posteriores al tope. Prueba nueva |
| 8 | `DatosProvider` observa toda la tabla `ajustes`; el borrador se escribe en cada pulsación y relanza la consulta completa | Confirmado | `bulkGet` de las 4 claves que usa: Dexie sólo observa esas claves y el borrador ya no dispara la consulta |
| 9 | Fotos y URL de objeto que se pierden (foto guardada antes del movimiento; URL no revocada; efecto que crea la URL tras desmontar) | Confirmado en parte | Corregido: reintento tras un fallo reutiliza la foto ya guardada; la URL de la miniatura se revoca al cambiarla o al cerrar; el efecto de la foto existente no crea URL tras desmontarse. Aceptado: la foto anterior no se borra al reemplazarla (borrarla rompería el deshacer de la edición) |
| 10 | `editarMovimiento` hace get→put fuera de transacción; su deshacer restaura `eliminado_en` | Confirmado en parte | Lectura y escritura en una transacción; el deshacer conserva el `eliminado_en` actual. El escenario de «deshacer tras eliminar en otro sitio» no es alcanzable hoy (una sola barra Deshacer, sin servidor), pero la corrección es barata. Prueba nueva en el repositorio |

HALLAZGO: doble toque en «Guardar gasto» duplica el gasto → corregido
HALLAZGO: doble toque en «Guardar» del saldo inicial lo duplica → corregido
HALLAZGO: gasto previsto del mes siguiente invisible en Movimientos → corregido
HALLAZGO: deslizar para eliminar bloqueado por touch-action: manipulation → corregido
HALLAZGO: eliminar desde la fila sin manejo de error → corregido
HALLAZGO: etiqueta «Gasto eliminado» para tipos que aún no existen → aceptado
HALLAZGO: aviso de importe atípico repetido al editar sin cambiar importe ni categoría → corregido
HALLAZGO: fecha futura sin tope al escribirla a mano → corregido
HALLAZGO: el borrador relanza la consulta de todos los datos en cada pulsación → corregido
HALLAZGO: fotos huérfanas en reintentos y URL de objeto sin revocar → corregido
HALLAZGO: la foto anterior no se borra al reemplazarla en una edición → aceptado
HALLAZGO: editarMovimiento sin transacción y deshacer que resucita un eliminado → corregido

## 2. /simplify (reuso, simplificación, eficiencia, altura)

Aplicado (sin cambiar comportamiento):

- `src/lib/hooks.ts`: nuevo `useCerrojo()`; Registrar y SaldoInicial lo usan en vez de copiar ref + estado. Se borra `useAnterior` (no se usaba).
- `src/db/repo.ts`: `fijarEliminado()` reúne el borrado lógico y su deshacer (antes dos copias del bloque de auditoría) y los hace en transacción.
- `src/lib/fechas.ts`: `DIAS_FUTURO_MAX` y `fechaMaximaRegistro()`; Registrar y Movimientos comparten la regla de +7 días.
- `src/domain/cifras.ts`: se exporta `INGRESOS_NEGOCIO`; el filtro «Cobros» de Movimientos la usa en vez de repetir la lista.
- `src/domain/tipos.ts`: `etiquetaEliminado()` compartida por Registrar y Movimientos.
- `src/screens/Movimientos.tsx`: `useMemo` para la lista del mes, la agrupación por día, el resumen y el mapa de categorías; agrupación con `push` en lugar de copiar el array en cada inserción.
- `src/screens/Hoy.tsx`: `useMemo` para las cinco cifras (antes se recalculaban al tocar el desglose o abrir una hoja).
- `src/screens/Hoy.tsx`, `Movimientos.tsx`: `formato={formatearEuros}` en vez de lambdas envolventes.
- `src/db/datos.tsx`: lectura de ajustes por posición del `bulkGet`, sin `Map` intermedio.
- `src/styles/app.css`: se borra la clase `.ancho` (sin uso).

No aplicado (motivo):

- Caché de `claveMes`/`claveDia` por cadena: memoria sin límite; con `useMemo` el coste ya no se paga en cada render.
- Guardar la foto dentro de la transacción de `crearMovimiento`: cambia la API del repositorio; queda para la ola de subida de fotos.
- Sacar el borrador de la tabla `ajustes`: el `bulkGet` ya evita el problema.
- Componente `CampoImporte`, etiqueta de aportante en `DatosProvider`, formas del logo compartidas con `generar-iconos.mjs`, subcomponente de pasos de la bienvenida, `memo` de `FilaMovimiento`, `contexto()` en paralelo, estilos inline a clases y quitar `export` de constantes internas: mejoras menores; algunas (estilos) arriesgan la especificidad del CSS sin una revisión visual.

## 3. Markdown de la ola

- Los informes de la ola (`-ficha`, `-a`, `-b`) ya están en `review/factory/`, sin duplicados. Los enlaces citados (`FERGO App Mockups.pdf`, `docs/maqueta.md`) existen.
- Observación sin tocar: el commit `f891b5f` incluye `review/factory/fa4a9e72e841-ola-9-ficha.md`, de otra ola; ese archivo y `fa4a9e72e841-ola-9-a.md` y `docs/migracion-android.md` (sin commitear) son de la ola 9 y no se tocaron.
- Observación sin tocar: en la ficha de la ola 2 «Alcance» y «Por qué» repiten el mismo texto (lo genera Factory).

## 4. README

- `README.md` en la raíz: no existía; creado con qué hace la app hoy, comandos, estructura y enlaces a `docs/maqueta.md` y `review/factory/`.
- `mobile/README.md`: no aplica; no existe la carpeta `mobile/` (la app es una PWA en la raíz).

## Pruebas

Pruebas nuevas: `src/screens/qaOla2.test.tsx` (5): doble toque, tope de fecha, atípico al editar, mes siguiente con gasto previsto y deshacer de edición tras eliminar. No se comprobó que fallen con el código anterior (sin Git no se volvió a la versión previa); se razonó sobre el código.

PRUEBA: node node_modules/vitest/vitest.mjs run src/screens/qaOla2.test.tsx
PRUEBA: node node_modules/typescript/bin/tsc -p .
PRUEBA: node node_modules/vitest/vitest.mjs run
PRUEBA: node scripts/verificar.mjs

Resultados con el código final: `tsc` código 0; suite completa 13 archivos y 154 pruebas en verde, dos corridas seguidas; `verificar.mjs` termina en «OK: verificación completa» (tipos, pruebas, build y PWA).

Sin medir: ninguna corrección se probó en un móvil real (en particular `touch-action` del deslizar para eliminar).

Archivos tocados: `README.md` (nuevo), `src/screens/qaOla2.test.tsx` (nuevo), `src/lib/hooks.ts`, `src/lib/fechas.ts`, `src/db/repo.ts`, `src/db/datos.tsx`, `src/domain/cifras.ts`, `src/domain/tipos.ts`, `src/screens/Registrar.tsx`, `src/screens/SaldoInicial.tsx`, `src/screens/Movimientos.tsx`, `src/screens/Hoy.tsx`, `src/styles/app.css`. No quedan temporales fuera de `.temp/` ni de carpetas ignoradas (`dist/` está en `.gitignore`).

ESTADO: QA ola 2 listo para integrar
