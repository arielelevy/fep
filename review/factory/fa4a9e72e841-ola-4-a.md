# Ola 5 · Frente A · Agenda y visitas (datos y pantallas de agenda)

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Referencias: `FERGO App Mockups.pdf` (Agenda, p. 5; ficha de cliente, p. 4) y `docs/maqueta.md` §1.5.

Reparto de la coordinadora:
- **Frente A (este):** la Agenda y los datos de la ola (`src/db/*`, `src/domain/tipos.ts` y el modelo de visitas). También la integración en `App.tsx`.
- **Frente C:** Hoy, la hoja Hecho, el resumen semanal, los abonos esperados y la versión al pie de Hoy.
- **Frente B:** las pruebas `*.f5.test.*`.

Las pantallas de la Agenda las construyó un agente auxiliar con firmas cerradas y archivos propios; las revisé y las conecté.

## Lo hecho

### Datos y reglas (dueño: A)

- **Modelo nuevo:** `Visita` (§8.4) y `SerieRecurrente` (§8.5) en `src/domain/tipos.ts`, con tablas nuevas en la base Dexie (versión 3). `useDatos()` ya trae `visitas` y `series`.
- **Funciones en `src/db/repo.ts`:**
  - **Crear:** `crearVisita` y `crearSerie`.
  - **Editar:** `editarVisita` («Solo esta visita») y `editarSerieDesde` («Esta y las siguientes»).
  - **Mover, cancelar y eliminar:** `moverVisita` guarda de dónde venía y el motivo; `cancelarVisita` deja la visita como cancelada con su motivo; `eliminarVisita` hace un borrado lógico.
  - **`completarVisita(visitaId, cobro | null)`** (§10.1.4, con la firma que pidió C): una visita puntual con precio crea su deuda (`visita_id`) y, si se cobró, el cobro que la salda; lo no cobrado queda en «Te deben». Una visita de abono o sin precio solo se marca hecha. Error si está cancelada o ya está hecha.
  - **`materializarSeries`** (8 semanas).
  - **Reglas comunes:** todas devuelven deshacer de 8 s, guardan `creado_por` y `modificado_por`, y lanzan `SinPermiso` si quien las usa es Pablo.
- **Funciones puras en `src/domain/agenda.ts`:** `fechasSerie` (semanal, quincenal y mensual), `visitasDelDia`, `estadoCobroVisita` (no aplica, pendiente, parcial o cobrada, sacado de la deuda y los cobros activos), `horaDe` (09:00 si no tiene hora) y `textoDuracion`.
- **Series:** una visita de serie se identifica por su día original en la serie (`fecha_serie`). Una visita movida, cancelada o borrada no se vuelve a crear. «Esta y las siguientes» cierra la serie original el día anterior y crea una serie nueva desde ahí. Las visitas pasadas, hechas o canceladas no se tocan, y el deshacer lo devuelve todo.
- **Hallazgo de B, corregido:** el horizonte de materialización es hoy + 8 semanas (§8.5), no fecha de inicio + 8 semanas. Tiene prueba.
- `App.tsx` crea las visitas que falten de las series al abrir la app, como «proceso diario» mientras no hay servidor; con Pablo no hace nada.

### Pantallas de Agenda

- **`src/screens/Agenda.tsx` (maqueta p. 5 con las correcciones de §10.5):**
  - «Agenda» con el subtítulo «Tiempo de los próximos 14 días», campana y botón «+».
  - Franja de 14 días con el separador «ORIENTATIVO» y los días 8 a 14 atenuados. Por defecto se elige hoy, o mañana si son más de las 20:00 en Madrid.
  - Tarjetas con hora y duración, cliente, trabajo, periodicidad, «Necesita furgoneta», «+N ayudantes» y botón de llamada.
  - Como el clima es de otra ola, cada visita lleva la línea gris «Sin previsión» (§11.3) y, en los días 8 a 14, «Previsión orientativa».
  - Estados: vacío con «Añadir visita», cargando y sin conexión.
- **`src/screens/VisitaForm.tsx` (Nueva o Editar visita, decisión H10):**
  - Al elegir el cliente se precargan sus datos habituales.
  - «Se repite»: No, Cada semana, Cada 15 días o Cada mes, con fecha de fin opcional.
  - Al editar una visita de serie pregunta «Solo esta visita» o «Esta y las siguientes».
- **`src/screens/VisitaDetalle.tsx` (§10.6, decisión H3):**
  - Datos de la visita y semáforo grande gris «Sin previsión».
  - Si es de una serie, «Se repite cada 15 días»; si se movió, «Movida desde …».
  - Estado de cobro de las visitas hechas: «Cobrada», «Pendiente de cobro: 150 €» o «Cobro parcial: quedan 50 €».
  - Acciones: Hecho, Mover, Llamar, Cómo llegar, WhatsApp, Editar, Cancelar visita (con motivo y deshacer) y Eliminar.
- **`src/screens/MoverVisita.tsx`: hoja mínima y funcional, PENDIENTE DE MAQUETA** (decisión H4). Fecha, hora y motivo, con el aviso visible «Pantalla provisional: el diseño de mover visita está pendiente de maqueta.».
- **«Hecho» desde el detalle (en `App.tsx`):**
  - Visita puntual con precio: abre la hoja «¿Cobraste a …?» de C (`HojaHecho`).
  - Visita de abono o sin precio: la marca hecha con «Visita completada · Deshacer».
  - Visita de abono con la cuota vencida sin cobrar: además abre «¿Te pagó el abono de [mes]?», a pedido de C.
- **Navegación:** desde Hoy, «Agenda» abre la pestaña y una visita abre su detalle (`DestinoHoy` de C).
- **Ficha de cliente:** «Últimas visitas» ya muestra visitas reales (§10.4.2.7): la próxima y las 5 más recientes, con estado Programada, Hecha o Cancelada, «Ver todas» y acceso al detalle. «Trabajo hecho» se mantiene para trabajos sin visita programada (decisión de Ariel).
- **«Cómo llegar»:** Google Maps en Android y Apple Maps en iPhone (decisión de Ariel), con `src/lib/mapas.ts` (`urlComoLlegar`), usado en la ficha y en el detalle.
- **Estilos** solo en `src/styles/agenda.css`; no se tocaron los archivos de C.

### Correcciones pedidas por la coordinadora

- **Intermitente «Nueva visita» (`agenda.test.tsx`):**
  - **Causa probable:** al correr toda la suite en paralelo, la primera carga de IndexedDB puede pasar de 1 s, el límite por defecto de `findBy` y `waitFor`, y la prueba fallaba solo en la suite completa.
  - **Arreglo:** `src/test/setup.ts` fija `asyncUtilTimeout` en 5 s para toda la suite. No cambia ninguna aserción.
  - **Resultado:** la suite completa pasó 3 veces seguidas (26 archivos y 306 pruebas cada vez).
- **«− 14.037,75 €» en la animación de conteo: era un bug real de `CifraAnimada`, no solo de la prueba.**
  - **Causa:** el progreso usaba la marca de tiempo de `requestAnimationFrame`, que es el inicio del frame y puede ser anterior al instante en que empieza la animación. Con un progreso negativo, la curva de aceleración daba valores fuera del rango, mucho más lejos con relojes falseados en las pruebas.
  - **Arreglo:** el progreso sale del mismo reloj que el inicio (`performance.now()`) y queda acotado entre 0 y 1.
  - **Prueba nueva:** `src/components/CifraAnimada.test.tsx`, con un primer frame cuya marca es anterior al inicio; con el código anterior habría dado un valor muy negativo.
- **QA de la ola 4, `clientes.test.tsx:343`:** esperaba el texto provisional que la ola 5 reemplazó. Ahora comprueba el estado vacío real («Aún no hay visitas de este cliente.»). Las visitas reales de la ficha las cubre `src/screens/fichaVisitas.test.tsx`.

## Pruebas

**Mías:**
- `src/db/agenda.test.ts` (12):
  - fechas de las series;
  - materialización sin duplicar, sin recrear las movidas y con el horizonte de hoy + 8 semanas;
  - criterio 13 («Esta y las siguientes» no toca las pasadas) y «Solo esta visita»;
  - criterios 9 y 10 en la capa de datos;
  - visita de abono, cancelada y ya hecha;
  - orden del día y permisos de Pablo.
- `src/screens/fichaVisitas.test.tsx` (1).
- `src/components/CifraAnimada.test.tsx` (1).
- `src/screens/agenda.test.tsx` (22, del agente):
  - franja de 14 días, visitas después de las 20:00 y día vacío;
  - tarjetas y estados;
  - alta puntual y de abono, serie quincenal, «Solo esta» y «Esta y las siguientes»;
  - detalle con los enlaces de Android e iPhone, hecha con cobro parcial o pendiente, visita inexistente;
  - mover, cancelar con deshacer, eliminar y Pablo;
  - `urlComoLlegar`.
- `src/screens/clientes.test.tsx` ajustado a Google Maps y Apple Maps (21).

**De B y C:** también corren en la suite completa, incluidos los criterios 9, 10, 12 y 13 en `*.f5.test.*`.

PRUEBA: node scripts/verificar.mjs
PRUEBA: node node_modules/vitest/vitest.mjs run

**Resultado real con el código final:**
- `node scripts/verificar.mjs`: código 0. Tipos limpios, build y PWA verificados.
- `node node_modules/vitest/vitest.mjs run`: código 0 en 3 corridas seguidas (26 archivos y 306 pruebas). Después, el QA de la ola 4 sumó `dineroQa.test.tsx`; con él se volvió a correr 3 veces seguidas, con código 0 (27 archivos y 309 pruebas).
- Una corrida del oráculo tomó ese archivo a medio escribir y dio 2 fallos. Con el archivo completo no se repitieron.
- El build incluye la versión de `package.json` (`0.2.0`) en `dist/assets/index-*.js`, y Hoy muestra el pie «FERGO v…» que hizo C.
- `verificar.mjs` va primero porque instala las dependencias en una copia limpia.

**Entorno:** Windows 11, Node 26.13.0. No se probó en un móvil real.

## Pendiente

- **Mover visita:** el diseño propio está pendiente de maqueta (H4). Mientras tanto queda la hoja provisional, que guarda la fecha, la hora y el motivo.
- **Clima y semáforo reales** (otra ola): por ahora todas las visitas muestran «Sin previsión».
- **Anticipo al completar una visita:** §9.1 dice que se descuenta del precio. Los anticipos aún no se ligan a una visita concreta, así que «Hecho» no los descuenta.
- **Materialización «diaria»:** se hace en el cliente al abrir la app o la Agenda; con backend pasará al servidor.
- **Comprobación visual:** no hay capturas de esta ola. Las pruebas de interfaz cubren el comportamiento, no el aspecto en un móvil.

RESUMEN: La app ya tiene agenda: visitas puntuales y recurrentes, franja de 14 días, nueva visita, detalle, mover (provisional, a la espera de maqueta), cancelar y editar solo esta o esta y las siguientes. Marcar una visita como hecha anota el cobro o lo deja en «Te deben». También se corrigió la cifra animada que mostraba valores raros y se estabilizaron las pruebas; las 309 pasan.

## Bloqueo al cerrar

Después de las corridas en verde, entró `src/screens/dineroQa.test.tsx`, el QA de la ola 4, en edición por otra sesión. Hace fallar `tsc` y, con él, `node scripts/verificar.mjs`, que sale con 1:
- `dineroQa.test.tsx(87,123)` y `(88,100)`: `Type '"banco"' is not assignable to type 'MedioPago'`.

No es código de este frente y no lo toqué. «Banco» es solo la agrupación del desglose de «En caja» (§9.3); los medios válidos son efectivo, bizum, tarjeta y transferencia. Se avisó a la coordinadora. Con ese archivo corregido, las dos líneas PRUEBA de este informe estaban en verde.

ESTADO: Agenda y visitas bloqueado: tsc falla en src/screens/dineroQa.test.tsx (QA de la ola 4, en edición por otra sesión), no en el código de esta ola
