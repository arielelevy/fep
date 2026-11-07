# Ola 5 · Frente C · Visitas de hoy y flujo Hecho con cobro

Fecha: 2026-11-07. Coordinación: sesión 53085037 («ola 5 | coordinadora»). Sin Git y sin publicación.

## Qué se hizo

- **Tarjetas de visitas en Hoy** (spec 10.1.1.4–5; maqueta p. 1, docs/maqueta.md §1.1, C6–C8):
  - Título «Visitas de hoy» con «N de M hechas» y una tarjeta por visita, ordenada por hora. Una visita sin hora cuenta como 09:00 y las canceladas no salen.
  - La próxima pendiente lleva contorno lima de 2 pt y «Hecho» relleno en lima; las demás llevan «Hecho» contorneado (44 pt).
  - Las hechas tienen opacidad 75 %, nombre tachado, el texto «Hecha», «Cobrado 60 €» o «Pendiente de cobro» y un check en círculo lima suave.
  - Tocar la tarjeta fuera del botón lleva a `{ visita: id }` (detalle).
  - Sin visitas: «Hoy no tienes visitas» y, si las hay, el enlace «Mañana: N visitas» a la Agenda.
  - Pablo ve las visitas pero no tiene el botón Hecho.
- **Flujo Hecho** (10.1.4), con la hoja nueva `HojaHecho`:
  - Visita puntual con precio: hoja «¿Cobraste a [cliente]?» con «Sí, [importe]», chips de medio de pago (el último usado), «Cobré otra cantidad» y «No, me paga después». Usa `completarVisita` de A y deja la barra «Visita completada · Deshacer».
  - Visita de abono: se marca hecha sin hoja. Si hay cuota vencida sin cobrar y es la primera visita tras el vencimiento (9.4), se abre «¿Te pagó el abono de [mes]?».
  - Visita sin precio: se marca hecha y la tarjeta ofrece «Añadir cobro». Usa `anotarTrabajo` con `visita_id`.
- **Cobros esperados de abono por día de cobro** (9.4, criterio 12): `abonosEsperados.ts`. Son funciones puras sobre `cuotasVencidas` y los cobros activos; no guardan nada. «Te deben» ya los sumaba vía `calcularPendientes`.
- **Aviso contextual** (10.1.1.3, maqueta C5): muestra uno solo y sigue esta prioridad:
  1. Cobro sin registrar de una visita hecha en los últimos 6 días, sin contar hoy: «Ayer en Sra. Morales: ¿cobraste?» con el botón «Sí, 45 €».
  2. Fianza sin devolver desde hace 3 días o más: «Me la devolvieron».
  3. Abono vencido en rojo (15 días o más): «Ya pagó, 90 €».
  - Cada botón guarda y ofrece Deshacer. Pablo no ve el aviso.
- **Resumen semanal positivo** (10.1.2):
  - Muestra «Esta semana cobraste X € en N trabajos» y «X € más que la semana pasada» solo si la semana mejora.
  - Aparece el domingo o el primer día de la semana sin visitas, y nunca con 0 €.
  - La semana va de lunes a domingo, en hora de Madrid.
  - Los trabajos son las visitas hechas más los trabajos sin visita de la semana.
- **Versión al pie de Hoy**: «FERGO v0.2.0», chico y gris. Se lee de `package.json` con `?raw` en el build y no toca la configuración.
- **Hallazgos del revisor de la ola 4** (encargados por la coordinadora):
  1. Las pestañas que Pablo no puede usar en Registrar se ven atenuadas y tachadas. Debajo dice «Solo puedes registrar aportes y préstamos.».
  2. Al 130 %, el nombre del cliente pasa a dos líneas en vez de cortarse con «…», en Te deben y en el listado de Clientes. En Te deben, el concepto también pasa de línea.
  3. «Trabajo hecho» con un cliente de abono abre «¿Te pagó el abono de [mes]?» en vez de «Precio 0 €». Si el abono está al día, lo dice y ofrece «Anotar un trabajo aparte». El botón «Es un trabajo aparte» vuelve a la hoja puntual.
- **Hallazgo de B**: si la hoja se monta antes de que carguen los datos, el medio de pago se sincroniza con el último usado al llegar, salvo que el usuario ya haya elegido otro. Lo apliqué en `HojaHecho` y en `HojaCobro`. La cuota del abono también se fija al llegar los datos.

## Archivos

Nuevos (míos):
- `src/domain/abonosEsperados.ts`: `cobrosEsperadosCliente`, `cobrosEsperadosAbono`, `cobroEsperadoDelMes`, `cuotaAPreguntar`, `totalAbonosEsperados` y `debePreguntarAbono`.
- `src/domain/resumenSemanal.ts`: `resumenSemanal(movs, ahora?, { visitas, deudas }?)`, `textoResumenSemanal`, `textoMejora`, `mostrarResumenSemanal` y `lunesDe`.
- `src/domain/visitasHoy.ts`: `visitasDeHoy`, `contadorHechas`, `proximaPendiente`, `textoServicio`, `tipoCobroVisita`, `lineaVisita`, `textoManana` y `avisoContextual`.
- `src/screens/HojaHecho.tsx`: `<HojaHecho visitaId modo? onCerrar />`, `<HojaAbono clienteId onCerrar onTrabajoAparte? />` y `modoHecho(v)`.
- `src/styles/hoy.css`.
- Pruebas propias: `src/domain/visitasHoy.c.test.ts`, `src/screens/hoy.c.test.tsx` y `src/screens/teDeben.c.test.tsx`.

Modificados:
- `src/screens/Hoy.tsx`: aviso, visitas, flujo Hecho, resumen semanal y versión. `DestinoHoy` suma `'agenda' | { visita: string }`; A los enruta en App.tsx.
- `src/screens/HojaCobro.tsx`: hallazgo 3 y sincronización del medio de pago.
- `src/screens/TeDeben.tsx` y `src/styles/clientes.css`: hallazgo 2. La coordinadora me los asignó en esta ola.
- `src/styles/app.css`: solo agregué la regla `.segmentado button:disabled` (hallazgo 1).
- `src/screens/Registrar.tsx`: solo el texto para el colaborador debajo del control segmentado (hallazgo 1). Es el «texto corto» que pidió la coordinadora; no hay otro lugar donde ponerlo.

De A (no los edité; los uso): `completarVisita`, `anotarTrabajo` con `visita_id`, `crearMovimiento`, `devolverFianza`, `useDatos().visitas`, y `visitasDelDia`, `estadoCobroVisita` y `horaDe` de `src/domain/agenda.ts`.

## Pruebas

PRUEBA: node node_modules/typescript/bin/tsc -b → exit 0, sin errores.
PRUEBA: node node_modules/vitest/vitest.mjs run src/domain/visitasHoy.c.test.ts → 13 de 13 pasan (criterio 12, resumen semanal, tarjetas y aviso contextual).
PRUEBA: node node_modules/vitest/vitest.mjs run src/screens/hoy.c.test.tsx → 17 de 17 pasan (criterios 9 y 10 desde la interfaz, parcial, abono con y sin cuota, sin precio, Pablo, versión, medio de pago antes de cargar, hallazgos 1 y 3).
PRUEBA: node node_modules/vitest/vitest.mjs run src/screens/teDeben.c.test.tsx → 2 de 2 pasan (hallazgo 2: TeDeben y clientes.css).
PRUEBA: node node_modules/vitest/vitest.mjs run → primera corrida: 303 de 304 pasan y falla 1 de A, `src/screens/agenda.test.tsx › Nueva visita (§7.2) › Guardar visita pide cliente…`. Sola pasa (22 de 22), así que la dejo documentada sin tocarla. Segunda corrida completa: 24 de 24 archivos y 304 de 304 pruebas pasan.
PRUEBA: node node_modules/vite/bin/vite.js build → exit 0. El bundle `dist/assets/index-*.js` contiene `"version": "0.2.0"`, es decir, el build lee la versión de package.json.

## Límites y pendientes

- **Línea de semáforo** de cada tarjeta (10.1.1.4): no está. No hay clima ni `semaforo_cache` en el modelo de esta ola, y el clima queda fuera de alcance.
- **«Precio menos anticipos»** (10.1.4): en la hoja Hecho, «Sí» propone el precio entero. Los anticipos todavía no se ligan a visitas, porque `Movimiento` no tiene `visita_id`. Cuando A lo agregue, se resta.
- **Fianza vencida**: sin reservas de furgoneta todavía, la aproximo como «3 días desde la entrega» (FIANZA_PENDIENTE, 12.2). Solo aviso fianzas sin ninguna devolución. Con devoluciones parciales, `devolverFianza` calcularía mal el descuento.
- **Versión**: `?raw` mete el `package.json` entero en el bundle (nombres y versiones de dependencias, sin secretos). Si se prefiere no exponerlo, la alternativa es un `define` en `vite.config.ts`, que no es mío.
- **Detalle de visita (A)**: le pedí que, al marcar Hecho una visita de abono, abra `<HojaHecho modo="abono">` cuando `debePreguntarAbono` lo indique, igual que Hoy. Falta que lo confirme.
- **Firmas pasadas a B**: `resumenSemanal` suma un tercer parámetro opcional, `{ visitas, deudas }`. Es compatible con la firma que le pasé.
- **Mientras corría la suite**, A vio en la prueba del criterio 10 que una CifraAnimada mostraba valores intermedios grandes (p. ej. «− 14.037,75 €»). Mi prueba ya lee `data-valor`. El valor intermedio sale de la animación con `Date` simulado. No es de mi código y no lo toqué.

ESTADO: visitas de hoy y flujo Hecho listo para integrar
