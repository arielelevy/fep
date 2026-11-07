# QA de la ola 8 · Preparar trabajo: furgoneta, material y ropa (commit c9a5cae)

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Diff revisado: `git show c9a5cae` (58 archivos). Informes de la ola: [encargo A](fa4a9e72e841-ola-7-a.md), [encargo B](fa4a9e72e841-ola-7-b.md) y [ficha](fa4a9e72e841-ola-7-ficha.md).

Alcance real de la revisión: leí entero `logica.ts`, `operaciones.ts`, `BloqueFurgoneta.tsx`, `HojaReservaAlerta.tsx`, el motor, el planificador, el estado y los hooks de alertas de preparación, `plantillas.ts` y los cambios de `App.tsx`, `Alertas.tsx`, `CampanaAlertas.tsx`, `dominio/alertas/*`, `Registrar.tsx` y `VisitaDetalle.tsx`. No leí línea a línea `BloqueMaterial.tsx`, `BloqueRopa.tsx`, `PrepararTrabajo.tsx`, las pantallas de Ajustes ni los CSS; de esos archivos sólo comprobé lo que cubren sus pruebas (que pasan).

## 1. Code review

- Reserva, recogida y devolución: `registrarRecogida` crea gastos repartidos por cliente (suma exacta) y la fianza en una sola transacción de Dexie; `registrarDevolucion` y `registrarGastoArticulo` deshacen lo ya escrito si falla el paso siguiente. Sin defectos.
- El motor de alertas es puro y se recalcula desde los datos; sólo se guarda lo avisado y lo pospuesto.

HALLAZGO: `HojaReservaAlerta.tsx` era una copia casi literal de `HojaReserva` (dentro de `BloqueFurgoneta.tsx`): mismos campos, valores por defecto, validación y mensajes de error, con una regex de errores más corta (le faltaba `Esta `), así que un error de la reserva ya recogida se veía distinto según desde dónde se guardara → corregido (un solo formulario `src/features/preparar/HojaReserva.tsx`, usado por Preparar trabajo y por la tarjeta de Alertas; el mensaje «Furgoneta reservada» / «Reserva cambiada» no cambia)
HALLAZGO: `categoriaDeArticulo` buscaba `ph` como subcadena, así que cualquier artículo cuyo nombre contuviera «ph» caía en «Productos de piscina» → corregido (`\bph\b`; «Cloro en pastillas» y «pH» siguen yendo a piscina)
HALLAZGO: `registrarGastoArticulo` no comprueba si el artículo ya tiene un gasto ligado (`gasto_id`), así que dos registros seguidos duplicarían el gasto → aceptado (el cerrojo `useCerrojo` impide el doble toque y volver a «Comprado» exige antes desmarcar el artículo; no encontré otra vía; la comprobación en la operación sería un cambio de comportamiento fuera de esta pasada)
HALLAZGO: una reserva «reservada» cuya recogida pasó y nunca se registró sigue generando FURGO_RECOGER indefinidamente → aceptado (la alerta pide justo la acción pendiente, se resuelve registrando la recogida o anulando la reserva, y «Posponer»/«Aún no» la oculta; limitarla por antigüedad escondería un cobro sin registrar)
HALLAZGO: la sub-pantalla Preparar abierta desde el detalle de una visita vuelve a la pestaña y no al detalle → descartado (la etiqueta del «‹» dice el nombre de la pestaña, coherente con lo que hace; es el comportamiento que cubren las pruebas de navegación)
HALLAZGO: `Registrar.tsx` (cola del borrador) deja de arrastrar un rechazo sin atender → descartado como defecto (es una corrección de la ola; comprobé que `r` devuelve el error a quien espera y `colaBorrador` sigue encadenando)
HALLAZGO: cambio en `clientes.test.tsx` (`findByRole('status')` en vez de `getByRole`) → descartado como defecto (arregla una prueba intermitente por espera de la barra «Deshacer», sin relajar la comprobación)

## 2. Simplify (sin cambiar comportamiento)

HALLAZGO: `motor.ts` repetía `titulo` (idéntica a `tituloDia` de `preparar/logica.ts`), `diasEntre` (idéntica a la de `dominio/alertas/textos.ts`), `enumerar` (la lista «a, b y c» ya escrita en `textoListaCompra`) y la elección del proveedor habitual (`proveedorHabitual`) → corregido (usa las funciones existentes; `enumerar` queda exportada desde `logica.ts` y `textoListaCompra` la reutiliza)
HALLAZGO: `logica.ts` redefinía `diaConNumero`, que ya existe idéntica en `dominio/alertas/textos.ts` → corregido (se importa y se reexporta con el mismo nombre; los importadores no cambian)

## 3. Archivos .md

HALLAZGO: los informes de la ola (`fa4a9e72e841-ola-6-qa.md`, `-ola-7-a.md`, `-ola-7-b.md`, `-ola-7-ficha.md`) ya están en `review/factory/`, sin duplicados (los dos informes A y B tienen contenido distinto) y sus enlaces relativos resuelven → descartado (nada que mover)
HALLAZGO: `src/features/preparar/CONTRATO.md`, `src/features/alertas/preparacion/CONTRATO.md` y `tests/preparacion/SUPUESTOS.md` son documentación de código y viven junto a él; no mencionan `HojaReservaAlerta` → descartado (nada que ordenar). El informe histórico `fa4a9e72e841-ola-7-b.md` sí cita `HojaReservaAlerta` como lo que se entregó en su día; se deja como registro

## 4. README

HALLAZGO: el `README.md` de la raíz decía «ola 7», no describía Preparar trabajo ni las alertas y ajustes de preparación, ni listaba `src/features/*` ni `tests/preparar` y `tests/preparacion` → corregido (estado, tres viñetas en «Qué hace hoy», tres filas en la estructura y los dos frentes de pruebas)
HALLAZGO: `mobile/README.md` → descartado (la carpeta `mobile/` no existe y la ola no tocó ninguna app Android; sigue siendo PWA)

## Pruebas

PRUEBA: npx tsc -b
PRUEBA: npx vitest run src/features/preparar
PRUEBA: npx vitest run -c tests/preparar/vitest.config.ts
PRUEBA: npx vitest run -c tests/preparacion/vitest.config.ts
PRUEBA: npx vitest run -c tests/alertas/vitest.config.ts
PRUEBA: npx vitest run

Resultado: tipos sin errores; 13 + 12 + 36 + 14 pruebas focales en verde y la suite de `src/` completa (36 archivos, 391 pruebas) en verde. No ejecuté `npm run verificar` (build y comprobación de la PWA) ni probé nada en un navegador real.

ESTADO: QA ola 8 listo para integrar
