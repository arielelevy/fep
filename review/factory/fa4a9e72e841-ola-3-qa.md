# Ola 4 · QA · Clientes, cobros, aportes y fianzas

Fecha: 2026-11-07. Commit revisado: `1fc2e74`. Entorno: Windows 11, Node 26.13.0, Vitest 3.2.4 + jsdom + fake-indexeddb.
Informes de la ola: [ficha](fa4a9e72e841-ola-3-ficha.md), [frente A](fa4a9e72e841-ola-3-a.md). El commit también trae el [QA de la ola anterior](fa4a9e72e841-ola-9-qa.md) y la [ficha de la ola siguiente](fa4a9e72e841-ola-4-ficha.md).

Contexto: mientras corría este QA, la ola 5 trabajaba sin commitear en el mismo árbol. Por indicación de la coordinadora, sólo se corrigió en archivos de la ola 4 que la ola 5 no toca. Lo que cae en `src/db/*`, `tipos.ts`, `App.tsx`, `Hoy.tsx`, `HojaCobro.tsx`, `TeDeben.tsx`, `ClienteFicha.tsx`, `Registrar.tsx`, los CSS o `clientes.test.tsx` queda anotado **para la ola 5**, sin corregir.

## 1. /code-review (nivel medium)

10 hallazgos. Cada uno se contrastó con el código antes de actuar.

| # | Hallazgo | Veredicto | Qué se hizo |
|---|---|---|---|
| 1 | Editar un cobro (aunque sea sólo la nota) recalcula sus `saldos` desde cero y puede pasar el pago a una deuda más antigua | Confirmado (`saldosCobro` en edición usaba todos los pendientes como marcados) | `RegistrarDinero.tsx`: sin cambio de importe ni cliente se conservan `saldos` y `periodo_abono`; si cambia el importe, primero se reparte sobre lo que ya saldaba. Prueba nueva |
| 2 | `cuotasVencidas` borra la deuda de abono al desactivar el cliente y usa la cuota actual para meses pasados | Confirmado | Aceptado, **para la ola 5**: corregirlo exige guardar la fecha de baja y el historial de cuota en `Cliente` (`tipos.ts`, `db`), que hoy no existen. Es además una decisión de negocio |
| 3 | `devolverFianza` no tiene en cuenta devoluciones o descuentos ya ligados a la fianza: se puede descontar dos veces | Confirmado (`repo.ts`, sólo compara con `entrega.importe`) | **Para la ola 5** (`src/db/repo.ts`) |
| 4 | El borrador del gasto no se borra al guardar un cobro, aporte o fianza | Confirmado (`RegistrarDinero` llama a `onCerrar` sin `borrarAjuste(CLAVE_BORRADOR)`) | **Para la ola 5** (`Registrar.tsx`) |
| 5 | El permiso falla abierto: si `usuario_actual` no existe en `usuarios`, el rol es `titular` | Confirmado (`contexto()` en `repo.ts`) | **Para la ola 5** (`src/db/repo.ts`) |
| 6 | Devolución repartida entre varios préstamos sin transacción común | Confirmado | Aceptado, **para la ola 5**: necesita una función de `repo.ts` que cree todas las devoluciones en una transacción. Riesgo bajo (fallo de IndexedDB a mitad) |
| 7 | Al editar una devolución de préstamo no se comprueba el tope y se puede devolver más de lo prestado | Confirmado | `RegistrarDinero.tsx`: tope = pendiente de su préstamo + lo que ella devolvía, con aviso «Como mucho N €.» también al editar. Prueba nueva |
| 8 | Con la cuota del mes ya pagada, un nuevo cobro de abono vuelve a ir al mismo mes | Confirmado | `RegistrarDinero.tsx`: sin cuota vencida, el adelanto va al primer mes desde el actual que no esté pagado entero, y el chip muestra ese mes. Prueba nueva |
| 9 | `devolverFianza` usa `movilidad!.id` sin comprobar la categoría | Confirmado (la siembra siempre la crea; riesgo bajo) | **Para la ola 5** (`src/db/repo.ts`) |
| 10 | `fianzas()` y `prestamos()` son O(n²), `listaFianzas` se llama dos veces por render y la etiqueta del aportante está copiada | Confirmado | Corregido en el /simplify (abajo). Lo de `Hoy.tsx` y los índices de Dexie, **para la ola 5** |

HALLAZGO: editar un cobro reparte de nuevo sus saldos y puede mover el pago a otra deuda → corregido
HALLAZGO: cuotasVencidas borra la deuda al desactivar y usa la cuota actual para meses pasados → aceptado
HALLAZGO: devolverFianza permite descontar dos veces la misma fianza → aceptado
HALLAZGO: el borrador de gasto sobrevive a guardar un cobro, aporte o fianza → aceptado
HALLAZGO: el permiso falla abierto si el usuario actual no existe → aceptado
HALLAZGO: devolución repartida entre préstamos sin transacción común → aceptado
HALLAZGO: editar una devolución de préstamo no respeta el tope → corregido
HALLAZGO: el abono adelantado repite el mes ya pagado → corregido
HALLAZGO: devolverFianza usa movilidad! sin comprobarla → aceptado
HALLAZGO: fianzas() y prestamos() cuadráticos y listas recalculadas por render → corregido

Los «aceptado» son todos para la ola 5: caen en archivos que la ola 5 tiene abiertos o necesitan cambios de modelo.

## 2. /simplify (sólo calidad, sin cambiar comportamiento)

Cuatro revisiones (reuso, simplificación, eficiencia y altitud) sobre `RegistrarDinero.tsx`, `ClienteForm.tsx`, `Clientes.tsx`, `Movimientos.tsx`, `pendientes.ts` y `cifras.ts`.

Aplicado:
- `cifras.ts`: `sumaPor()` agrupa en una pasada lo devuelto y descontado por fianza y lo devuelto por préstamo; `fianzas()` y `prestamos()` pasan de O(n²) a O(n).
- `RegistrarDinero.tsx`:
  - `listaFianzas` y `listaPrestamos` memorizadas una vez por render.
  - `precargaDe()` reúne la regla de precarga, antes copiada en dos sitios.
  - El objeto `fianza` se arma una sola vez en `guardar`.
  - El título sale de `nombreTipo()` en vez de recortar `etiquetaGuardado()`.
  - Se quitó un ternario que devolvía lo mismo (`nivelAntiguedad`).
  - El buscador de clientes usa `sinAcentos` de `Clientes.tsx` y normaliza la búsqueda una sola vez.
- `Movimientos.tsx`: la etiqueta del aportante se calcula una vez, no por fila.
- `ClienteForm.tsx`: `DIAS` se arma con `DIAS_CORTOS` y `DIAS_LARGOS` de `lib/fechas.ts`.

Omitido:
- Cambiaría el comportamiento visible:
  - El buscador del selector con `coincide` encontraría más clientes.
  - `textoModalidad` cambiaría el texto de la fila.
- Cae en archivos de la ola 5:
  - Unificar `calcularPendientes` con `abonosEsperados.ts`.
  - Llevar `resumirDeudas` al dominio (lo usa `ClienteFicha.tsx`).
  - Compartir `grupoChips` con `VisitaForm.tsx`.
  - Un helper común para la etiqueta del aportante (también en `Hoy.tsx`).
- Refactor más amplio sin ganancia clara ahora:
  - Tablas de subtipos de cobro y aporte.
  - Un reparto genérico para las devoluciones de préstamo.

## 3. Informes .md

Los informes de la ola ya estaban en `review/factory/`, sin duplicados. Se comprobaron todos los enlaces relativos de `README.md`, `docs/` y `review/factory/`: todos apuntan a archivos existentes. No se movió nada.

## 4. README

`README.md` de la raíz actualizado:
- Estado: ola 4.
- Qué hace hoy: cobros, aportes, fianzas, clientes, Te deben y el rol de Pablo.
- Estructura de `src/screens/` y `src/domain/`.

No existe `mobile/`.

## 5. Pruebas

Pruebas nuevas en `src/screens/dineroQa.test.tsx` (3): editar sólo la nota de un cobro conserva sus saldos, abono adelantado al mes siguiente y tope al editar una devolución.

PRUEBA: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
PRUEBA: node node_modules/vitest/vitest.mjs run src/screens/dinero.test.tsx src/screens/dineroQa.test.tsx src/domain/pendientes.test.ts src/domain/cifras.test.ts src/screens/registroGasto.f3.test.tsx src/screens/qaOla2.test.tsx
PRUEBA: node node_modules/vitest/vitest.mjs run

Resultado con el código final (árbol con la ola 5 sin commitear incluida):
- `tsc`: código 0.
- Focales: 6 archivos y 63 pruebas en verde.
- Suite completa: 27 archivos y 309 pruebas en verde, código 0.

En la primera corrida, antes de tocar nada, había 1 prueba roja en `clientes.test.tsx:343`. Era un texto que la ola 5 reemplazó y su frente A actualizó después; no era de la ola 4.

ESTADO: QA ola 4 listo para integrar
