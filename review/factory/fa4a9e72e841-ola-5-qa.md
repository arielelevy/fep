# Ola 6 · QA · Clima y semáforo de visitas

Fecha: 2026-11-07. Commit revisado: `df51e7a`. Entorno: Windows 11, Node 26, Vitest 3.2.4 + jsdom + fake-indexeddb, sin servidores.
Informes de la ola: [ficha](fa4a9e72e841-ola-5-ficha.md), [frente A](fa4a9e72e841-ola-5-a.md) y [frente B](fa4a9e72e841-ola-5-b.md). La [ficha de la ola siguiente](fa4a9e72e841-ola-6-ficha.md) ya está en el árbol.

Contexto: mientras corría este QA, la ola siguiente trabajaba sin commitear en `src/dominio/` (sin seguimiento). No lo toqué. Por eso la suite de `src/` pasó de 315 pruebas (corrida base) a 331 en la corrida final.

## 1. /code-review (nivel high)

10 hallazgos. Cada uno se contrastó con el código antes de actuar. Uno más salió al leer `verificar.mjs` (el 11).

| # | Hallazgo | Veredicto | Qué se hizo |
|---|---|---|---|
| 1 | `UbicacionFormulario`: si se cambia la dirección y se deshace antes de los 600 ms, queda en «Buscando…» y borra las coordenadas guardadas | Confirmado: el efecto sale antes si la clave coincide, con el estado ya en `buscando` | Se guarda lo último mostrado y se recupera en ese caso. Prueba nueva |
| 2 | `useSemaforoVisita` no tiene `huecoLibre` en las dependencias: el consejo «Empieza a las …» usa una agenda vieja | Confirmado | `huecoLibre` entra en las dependencias del memo |
| 3 | El Detalle muestra «Tiempo de la visita» en visitas hechas o canceladas, con «Aún no hay previsión para ese día» | Confirmado; Agenda y Hoy sólo lo muestran en programadas | `VisitaDetalle.tsx`: sólo con la visita programada. Prueba nueva |
| 4 | `usePrevision` no tiene `.catch` y no se reinicia al cambiar la ubicación | Confirmado (a): muestra la previsión del punto anterior hasta que llega la nueva. (b): hoy el servicio nunca rechaza, pero un servicio enchufado sí podría | Al cambiar de punto se pinta lo guardado de ese punto con `cargando`; `.catch` deja de cargar con su motivo |
| 5 | El texto sin conexión promete «buscamos la ubicación al volver», pero tras cerrar el formulario nadie vuelve a buscar | Confirmado; el frente B ya lo dejó como pendiente | Aceptado: la búsqueda en segundo plano es de la ola de sincronización. Cambiar el texto es microcopy de la especificación. Hoy se busca desde la ficha («Buscar en el mapa») |
| 6 | `hayCambios` del formulario no mira la chincheta: cerrar pierde la corrección sin preguntar | Confirmado | `ClienteForm.tsx`: las coordenadas cuentan como cambio. Prueba nueva |
| 7 | Un toque en la chincheta, sin arrastrar, puede guardar «Ubicación corregida» por el redondeo a 5 decimales o el borde del plano | Confirmado con un punto de 7 decimales | `MapaChincheta.tsx`: sólo se guarda si hubo movimiento. Prueba nueva |
| 8a | `SemaforoDetalle` llama dos veces a `usePrevision`, y cada lectura parsea el JSON de `localStorage` | Confirmado | `useSemaforoVisita` devuelve también `prevision`; `almacenLocal` guarda en memoria lo ya leído |
| 8b | `avisos()` no tiene caché ni agrupación | Confirmado | Aceptado: con el proveedor simulado no hay red. Se hará al enchufar AEMET real (frente A, pendiente) |
| 9 | La etiqueta ámbar «Lluvia a partir de las X» usa la hora de mayor probabilidad, no la primera con lluvia | Confirmado (setos, abonado, riego y general) | `semaforo.ts`: usa la primera hora con lluvia. Prueba nueva |
| 10 | `verificar.mjs` salta en silencio una carpeta `tests/*` sin `vitest.config.ts` | Confirmado | Ahora falla con «falta vitest.config.ts» |
| 11 | `verificar.mjs`: al fallar, `process.exit` salta el `finally` y deja la carpeta temporal en el sistema | Confirmado | El temporal se borra en `process.on('exit')` |

HALLAZGO: UbicacionFormulario se queda en «Buscando…» y borra las coordenadas al deshacer la dirección → corregido
HALLAZGO: useSemaforoVisita ignora huecoLibre en el memo y el consejo usa una agenda vieja → corregido
HALLAZGO: el Detalle muestra el tiempo en visitas hechas o canceladas → corregido
HALLAZGO: usePrevision sin catch y con la previsión del punto anterior al cambiar de ubicación → corregido
HALLAZGO: el texto sin conexión promete buscar la ubicación al volver y nadie lo hace tras cerrar → aceptado
HALLAZGO: cerrar el formulario pierde la chincheta corregida sin preguntar → corregido
HALLAZGO: un toque en la chincheta guarda «Ubicación corregida» sin moverla → corregido
HALLAZGO: doble usePrevision en el Detalle y JSON de localStorage parseado en cada lectura → corregido
HALLAZGO: avisos() sin caché ni agrupación → aceptado
HALLAZGO: la etiqueta ámbar nombra la hora de mayor probabilidad y no la primera con lluvia → corregido
HALLAZGO: verificar.mjs salta en silencio una carpeta tests/* sin vitest.config.ts → corregido
HALLAZGO: verificar.mjs deja la carpeta temporal si una prueba falla → corregido

## 2. /simplify (sólo calidad, sin cambiar comportamiento)

Cuatro revisiones (reuso, simplificación, eficiencia y altitud) sobre lo que tocó la ola.

Aplicado:
- `semaforo.ts`: la regla «ámbar por probabilidad», escrita cinco veces, pasa a `ambarProb(umbral, regla)`.
- `servicio.ts`:
  - `respaldo(motivo)` reemplaza los tres `guardada ? … : …`.
  - `llamar()` reúne el `AbortController` y la espera máxima de previsión y avisos.
- `redondear` pasa de `proveedorSimulado.ts` a `tipos.ts`: el servicio real ya no depende del simulado. El simulado lo reexporta.
- `wmo.ts` exporta `NOMBRE_ICONO`, y `semaforoVisita.ts` deja su copia de los siete nombres.
- `semaforoVisita.ts`:
  - usa `minutos` y `hhmm` de `clima/horas.ts` en vez de `aMinutos` y dos `padStart`;
  - `datosFranja` usa `horasDeFranja`, las mismas horas que el motor. Es igual para visitas del mismo día. Una visita que cruza la medianoche ahora incluye la hora del día siguiente, como el semáforo.
- `useDiasConRojo`: el mapa de clientes se arma una vez, y se quitaron `huecoLibre` y `motivoSinPrevision`, que no cambian el nivel.
- `coordenadasDe()` en `geocodificacion` reemplaza las tres extracciones de lat/lon (`ClienteForm.tsx` dos veces, `UbicacionFicha`).
- `redondear5` sale de `MapaChincheta.tsx` y se importa de `geocodificacion`.
- Se quitó `horaActual` (`horas.ts`), sin uso.
- `resumirDias` agrega con `push` en vez de copiar el arreglo en cada hora.

Omitido:
- Cambiaría archivos fuera de la ola o la configuración común:
  - Incluir `tests/**` en `vite.config.ts` y quitar el bucle de `verificar.mjs`. `tests/clima` tiene su propio `setup.ts`.
  - Unificar `HORA_POR_DEFECTO` y `horaFin` con `domain/agenda.ts`.
  - Llevar `huecoLibrePara` al dominio.
  - Ayudas comunes en `src/lib`: modo simulado, `enLinea`, `conEspera` y almacenamiento seguro.
- Refactor más amplio sin ganancia clara ahora:
  - Que el motor devuelva `detalle` para no recortar la etiqueta en la interfaz.
  - Un `evaluarVisitas` común para la franja y las tarjetas.
  - Unificar `Coordenadas` y `Ubicacion`.
  - Quitar `visitaClima`.
- Despreciable con los datos de un jardinero: `clientes.find` por tarjeta, `huecoLibrePara` por render y `verificar.mjs` en paralelo.

## 3. Informes .md

Los informes de la ola ya estaban en `review/factory/` (`-ola-5-ficha`, `-a` y `-b`), sin duplicados. Se comprobaron todos los enlaces relativos de `README.md`, `docs/` y `review/factory/`: todos apuntan a archivos existentes. No se movió nada.

## 4. README

`README.md` de la raíz actualizado:
- Estado: ola 6, con el clima y los mapas simulados.
- Qué hace hoy: Agenda, semáforo de visitas y ubicación del cliente.
- Estructura: `src/clima/`, `src/agenda/clima/`, `src/clientes/ubicacion/`, `src/geocodificacion/` y `tests/`.
- `npm run verificar` corre también las carpetas `tests/*/`.

No existe `mobile/`.

## 5. Pruebas

Pruebas nuevas:
- `tests/clima/qaOla6.test.ts` (2): hora de la etiqueta ámbar y lectura única de `localStorage`.
- `tests/clientes-ubicacion/qaOla6.test.tsx` (3): deshacer la dirección conserva las coordenadas, un toque no mueve la chincheta, cerrar tras corregirla pide confirmación.
- `tests/agenda-clima/qaOla6.test.tsx` (1): el Detalle de una visita cancelada no muestra el tiempo.

PRUEBA: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
PRUEBA: node node_modules/typescript/bin/tsc -p tests/clima
PRUEBA: node node_modules/typescript/bin/tsc -p tests/agenda-clima
PRUEBA: node node_modules/typescript/bin/tsc -p tests/clientes-ubicacion
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/clima/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/agenda-clima/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/clientes-ubicacion/vitest.config.ts
PRUEBA: node scripts/verificar.mjs

Resultado con el código final:
- `tsc` de la app y de las tres carpetas de `tests/`: código 0.
- `tests/clima`: 42 pruebas en 3 archivos. `tests/agenda-clima`: 37 en 3. `tests/clientes-ubicacion`: 29 en 3.
- `node scripts/verificar.mjs`: código 0. Suite de `src/`: 29 archivos y 331 pruebas (incluye las de la ola siguiente en curso). Build y PWA en verde.
- Corrida base, antes de tocar nada: `verificar.mjs` con código 0 y 315 pruebas en `src/`.
- Los avisos «not wrapped in act(...)» de las pruebas de ubicación ya estaban en la corrida base (30; ahora 27).
- No probé en un móvil real: no levanté servidores.

ESTADO: QA ola 6 listo para integrar
