# Ola 7 · QA · Alertas de clima y mover visita por WhatsApp

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Commit revisado: `a70c44d`.
Ficha de la ola: [`fa4a9e72e841-ola-6-ficha.md`](fa4a9e72e841-ola-6-ficha.md). Informes de los frentes: [A](fa4a9e72e841-ola-6-a.md) y [B](fa4a9e72e841-ola-6-b.md).
El nombre del archivo sigue la numeración interna de Factory (ola 6 = esta ola, «Alertas de clima»). La ficha `fa4a9e72e841-ola-7-ficha.md` es de la ola siguiente («Preparar trabajo»).

Entorno: Windows 11, Node local, en `D:\Apps\fep`. Mientras corría este QA, otra sesión escribía la ola siguiente sin commitear (`src/features/`, `tests/preparar/`). No toqué esos archivos.

## 1. Code review

Cada hallazgo se trató como hipótesis y se contrastó con el código.

- **README desactualizado.** Decía «Estado: ola 6 … Alertas, mover y avisar por WhatsApp … llegan en olas posteriores». La tabla de carpetas no tenía `src/dominio/alertas`, `src/pantallas/alertas`, `src/componentes/alertas` ni `tests/alertas`. Confirmado y corregido (punto 4).
- **«Mover» sólo resuelve la alerta principal.** Con aviso AEMET y semáforo rojo en la misma visita, la otra alerta queda activa hasta el siguiente recálculo. Descartado: mover cambia la fecha y la versión de la visita. Eso cambia la firma del hook y dispara el recálculo. El paso 1 del motor resuelve las alertas cuya fecha ya no coincide. «Deshacer» restaura las dos.
- **`window.open` después de `await`.** Algunos navegadores móviles pueden bloquear la ventana si la activación del gesto ya expiró. Aceptado: la espera es una escritura local en IndexedDB, de milisegundos. Hay que verificarlo en el móvil real cuando se pase a Android.
- **Los descartes y las alertas cerradas no se purgan.** Se guardan en una sola fila de `ajustes` y crecen con el tiempo. Aceptado: es poco volumen (unas pocas alertas por visita alertada). Conviene purgar lo pasado cuando exista el servidor o el resumen de las 21:00.
- **Un descarte suprime un aviso AEMET nuevo del mismo nivel.** Pasa cuando cambia el fenómeno en la misma visita y el mismo día. Aceptado: es el criterio documentado («no vuelve salvo que empeore por encima de lo descartado»). El supuesto 3 de `tests/alertas/SUPUESTOS.md` lo cubre con un aviso de nivel superior.
- **Recálculo duplicado.** El hook se monta en la campana y en la pantalla, y cada instancia recalcula. Aceptado: el motor es idempotente, las escrituras pasan por una cola y en la app instalada no hay proveedor de red.
- **Una visita en el pasado propone días desde mañana.** El calendario «Otro» también empieza mañana. Descartado: es coherente, porque no se mueve una visita a hoy desde una alerta.

## 2. Simplify (sin cambiar comportamiento)

- `detalleSemaforo` estaba copiado en cuatro sitios. Ahora vive en `src/dominio/alertas/textos.ts`, se exporta y se usa en `motor.ts`, `huecos.ts` y `TarjetaDecidir.tsx`. `src/agenda/clima/semaforoVisita.ts` conserva su copia para que `agenda/clima` no dependa de `dominio/alertas`.
- `Alertas.tsx` redefinía `diaEnFrase`. Ahora usa la de `textos.ts`, exportada desde el índice.
- `aemet.ts` tenía su propio rango de niveles. Ahora usa `RANGO_AVISO` de `catalogo.ts`.
- `operaciones.ts` (`mantenerVisita`) repetía el cálculo de rango del motor. Ahora usa `rangoDe` exportado de `motor.ts`.
- `motor.ts` (`datosAemet`) tenía un ternario redundante: `causa: aviso.fenomeno`.
- `TarjetaDecidir.tsx` usaba un `'09:00'` literal en el calendario. Ahora usa `horaDe(visita)`, que tiene el mismo valor por defecto (`HORA_POR_DEFECTO`).

## 3. Orden de los .md

Los informes de la ola (`ola-6-ficha`, `ola-6-a`, `ola-6-b`) y el `ola-5-qa` que entró en este commit ya están en `review/factory/`, sin duplicados. Los enlaces relativos de `ola-5-qa` apuntan a archivos existentes. `CONTRATO.md` y `PREGUNTAS.md` se quedan junto al código en `src/dominio/alertas/`, y `SUPUESTOS.md` junto a sus pruebas en `tests/alertas/`. Ahora el README los enlaza.

## 4. README

Se actualizaron el estado, la viñeta «Alertas de clima» en «Qué hace hoy» y las filas de la tabla de carpetas (`src/dominio/alertas/`, `src/pantallas/alertas/`, `src/componentes/alertas/` y `tests/alertas`). No existe `mobile/`, así que no hay `mobile/README.md` que tocar.

## Hallazgos

HALLAZGO: README sin la ola de alertas (estado, «Qué hace hoy», carpetas) → corregido
HALLAZGO: mover sólo resuelve la alerta principal de la tarjeta → descartado
HALLAZGO: window.open tras await puede chocar con bloqueadores de ventanas en móvil → aceptado
HALLAZGO: descartes y alertas cerradas no se purgan → aceptado
HALLAZGO: un descarte AEMET suprime un aviso nuevo del mismo nivel con otro fenómeno → aceptado
HALLAZGO: recálculo duplicado por cada componente que usa useAlertasClima → aceptado
HALLAZGO: propuesta de días para una visita pasada empieza mañana → descartado
HALLAZGO: detalleSemaforo, diaEnFrase, rango AEMET y rango de descarte duplicados; ternario redundante; hora por defecto literal → corregido

## Pruebas

PRUEBA: node node_modules/typescript/bin/tsc -p .
PRUEBA: node node_modules/typescript/bin/tsc -p tests/alertas
PRUEBA: node node_modules/vitest/vitest.mjs run src/dominio/alertas
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/alertas/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run
PRUEBA: node scripts/verificar.mjs

Resultados, después de los cambios:
- Los dos `tsc` salieron con código 0.
- `src/dominio/alertas`: 52 de 52 pruebas pasan.
- `tests/alertas`: 14 de 14 pruebas pasan.
- Suite completa de `src/`: 367 de 367 pruebas pasan, en 4 corridas seguidas.
- `node scripts/verificar.mjs`: 5 corridas. Las dos últimas pasaron.
  - Una falló en `tests/preparar/preparar.test.tsx` (3 pruebas). Es la ola siguiente, en curso y sin commitear.
  - Una falló en `src/screens/clientes.test.tsx` («Notas guardadas»). Ese archivo no lo tocó esta ola. Pasó 3 de 3 veces corrido solo.
  - Una dio «1 error» sin pruebas fallidas.
  - Las dos últimas, con la máquina compartida con la otra sesión, terminaron en código 0.
  - Logs en `.temp/qa7/`.

Sin bloqueantes de esta ola. Aviso para Factory: si integra «todo lo pendiente» mientras la ola siguiente está a medias, `verificar` incluirá `tests/preparar`, que hoy no es estable.

ESTADO: QA ola 7 listo para integrar
