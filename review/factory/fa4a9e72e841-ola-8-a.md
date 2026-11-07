# Ola 9 · Avisos, informes, exportación y auditoría de accesibilidad y modo sin conexión

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Ola «Notificaciones, Informes y exportación» (ficha `fa4a9e72e841-ola-8-ficha.md`). Cierra la v1.

**Maqueta.** El enlace de la maqueta (`https://claude.ai/artifact/4wpLBYXnSPahaJNptqjSJE`) no se puede abrir desde esta cuenta, y la lectura de la ola 1 (`docs/maqueta.md`) no trae Informes, Ajustes ni Avisos. Esas pantallas se construyeron con el estilo de las maquetadas, como decidió Ariel para H8, H9 y H11. Cada componente cita en un comentario qué sigue:
- Informes: §10.9 y el estilo de «3. Movimientos».
- Ajustes: §10.10 y las filas de la ficha de cliente, p. 4.

No se rediseñó ninguna pantalla ya construida. Solo se corrigieron los defectos que encontró la auditoría.

## Feature 1 · Resumen diario, horas de silencio y ajustes de avisos (`src/features/avisos/`)

- **Planificador** (`planificador.ts`, función pura; §12.1–§12.4):
  - **Resumen diario:** uno solo, a la hora configurada (21:00).
    - Título «Mañana: 3 visitas», o «Mañana no tienes visitas» solo si hay otra cosa que contar.
    - Como mucho 3 líneas, con lo que pide decisión primero. Si hay más de 3, sale «Y N cosas más en Alertas.».
    - Junta las alertas de clima (ola 7), las de preparación (ola 8: furgoneta, material y ropa) y el resumen semanal positivo del domingo.
    - Sin visitas mañana ni nada nuevo que contar, no se envía (criterio 28).
    - Cada asunto se cuenta una sola vez (§12.1.4).
  - **Inmediatos:** aviso oficial AEMET, recordatorio antes de la visita (60 min por defecto; 30, 90 o desactivado) y los de preparación de la ola 8, con su propia regla.
  - **Horas de silencio** (22:00 a 08:00, configurables; criterio 29):
    - En silencio solo sale lo que programó Felipe: el recordatorio de compra y la recogida y devolución de la furgoneta (decisión de Ariel en la ola 8). También el resumen, si se configuró dentro de esas horas.
    - Lo demás espera al siguiente momento permitido, a las 08:00.
  - Cada aviso lleva una acción directa («Ver», «Ver opciones», «Cómo llegar», «Llamar», las de preparación) y un **enlace profundo** a la pantalla exacta (`/?ir=alertas`, `/?ir=visita&id=…`, `/?ir=preparar&fecha=…`; `enlaces.ts`).
- **Envío SIMULADO** (`envio.ts`, `useAvisosSimulados.ts`):
  - No se envía ningún push real ni hay servidor.
  - El planificador corre en el móvil al abrir la app y cada 5 minutos, solo con el titular: Pablo no recibe avisos operativos (§3).
  - Cada aviso queda registrado en `ajustes` (`avisos_simulados`, últimos 50).
  - Lo incluido queda marcado como avisado en el estado de clima y en el de preparación.
- **Enlaces profundos:**
  - La App lee `?ir=…` al arrancar, abre la pantalla y limpia la URL.
  - El service worker abre esa URL al tocar una notificación: `public/avisos-sw.js`, cargado con `importScripts` en `vite.config.ts`. Ese archivo ya maneja `push` para cuando haya servidor.
- **Ajustes** (§10.10; antes era un marcador):
  - **Pantalla Ajustes** (`src/features/ajustes/Ajustes.tsx`): avisos, preparar trabajo (filas de la ola 8), tus datos (exportar), quién usa este móvil y un texto breve de privacidad (§16.7).
  - **Avisos y horarios** (`AjustesAvisos.tsx`, §10.10.5):
    - hora del resumen y resumen semanal (sí/no);
    - recordatorio antes de la visita y días de antelación del aviso de furgoneta (con la función de la ola 8);
    - horas de silencio desde y hasta;
    - cada cambio se guarda al momento con «Deshacer»;
    - debajo, la lista de avisos simulados; tocar uno abre su pantalla.
  - **Instalación y avisos** (`InstalacionAvisos.tsx`, §4.1, §10.10.7, §12.4):
    - estado de la instalación y del permiso;
    - pantalla explicativa propia antes del diálogo del sistema: «Te aviso del tiempo, de la furgoneta y de lo que tienes que comprar. Como mucho un resumen al día.»;
    - el permiso solo se pide al tocar «Activar los avisos»; al concederlo se completa solo el paso «Activa los avisos» de la bienvenida;
    - «Probar notificación» muestra una notificación local (no es push) y la anota;
    - acceso a la guía de instalación y aviso de usar solo WhatsApp Business.
  - **Hoy:** si el permiso está bloqueado, muestra la banda discreta «Activa los avisos para no perderte nada», que lleva a esa pantalla.

## Feature 2 · Informes y exportación a Excel/CSV (`src/features/informes/`)

- **Informes** (§10.9), en tarjetas con barras CSS. Cada barra lleva su valor en texto y los negativos salen como «− 120 €», sin rojo.
  - Ganado por mes (12 meses).
  - Gasto por categoría del mes, con selector de mes.
  - Margen por cliente (cobros − gastos imputados).
  - Alquiler de furgoneta (3, 6 y 12 meses y media).
  - Crecimiento: ingresos del año, media mensual, clientes activos y de abono, con la evolución por mes.
  - Al final, «Exportar a Excel».
  - Los cálculos reutilizan `src/domain/cifras.ts`.
- **Exportación** (§15): filtro por fechas, por defecto el año en curso.
  - **«Exportar a Excel»:** genera un .xlsx con 5 hojas (Movimientos, Clientes, Visitas, Fianzas, Préstamos), sin librerías: zip STORE con CRC32 y SpreadsheetML.
  - **Alternativa CSV:** un archivo por hoja, con «;», coma decimal y BOM.
  - **Columnas de Movimientos:** fecha, tipo, categoría, grupo, importe con signo, medio de pago, cliente, nota, inversión, cuenta en ganado y foto del ticket.
  - **Importes:** en el xlsx son números con formato de euros; en el CSV van en formato es-ES.
  - **Compartir:** con la hoja de compartir del sistema si admite archivos; si no, se descarga.
  - Está en Informes y en Ajustes › Exportar datos.

## Feature 3 · Auditoría de accesibilidad y modo sin conexión

- **Sincronización local primero** (`src/sync/`, §14):
  - Todo se guarda antes en IndexedDB (Dexie), con UUID generado en el cliente y borrado lógico.
  - La cola de cambios se deduce de los datos: un registro queda pendiente si su `version` no es la última enviada (alta, edición y borrado lógico). También cuentan los ajustes compartidos y las fotos sin subir.
  - Se sincroniza al abrir la app, al volver la conexión y cada 60 s. Si falla, se reintenta.
  - Conflictos: `fusionarPorCampo`, la última escritura gana por campo (§14.4).
  - En Movimientos, «Ticket sin subir» hasta que la foto se sube (§14.5).
  - **No hay servidor real** (Supabase y cuentas, fuera de alcance): el envío pasa por la interfaz `ServidorSync`. En la app instalada no hay ninguno y los cambios quedan guardados en el móvil; las pruebas usan un servidor simulado.
- **Auditoría automática** (`tests/accesibilidad/auditor.ts`), sobre las 14 pantallas principales con todo el CSS del proyecto cargado:
  - zonas táctiles de 44 × 44;
  - nombre accesible en todo control;
  - sin tabindex positivo;
  - puntos de color siempre con texto;
  - contraste de todos los pares color/fondo del CSS y de los pares de tokens de la interfaz (4,5:1, o 3:1 en texto grande);
  - letra en rem (texto del sistema al 130 % o más) y zoom sin bloquear;
  - «Reducir movimiento».
  - Una prueba de control comprueba que el auditor sí detecta defectos.
- **Defectos hallados y corregidos:**
  - Chips de 2 letras («Sí», «No») de unos 42 px de ancho → `min-width: 44px` en `.chip` (`src/styles/app.css`).
  - Casilla de la ropa con texto blanco declarado sobre fondo blanco → el color va solo en el estado marcado (`src/features/preparar/preparar.css`).
  - Las otras 10 marcas de la primera pasada eran errores de estimación del auditor, revisados uno a uno contra el CSS:
    - botones de varias líneas o con la cifra grande («En caja», la tarjeta de preparación);
    - botones repartidos por una cuadrícula (segmentado, categorías);
    - el icono de la flecha «‹», que no sumaba al ancho;
    - el campo de fecha que cubre una fila de 56 px.
    Se mejoró el estimador; no se tocó la interfaz.

## Criterios de aceptación de §18 cubiertos con prueba

| Criterio | Prueba |
|---|---|
| 7 · gasto con foto sin conexión | `tests/accesibilidad/sincronizacion.test.tsx`: sin red se guarda (UUID), se ve con «Ticket sin subir» y no se envía nada. Al volver la red (evento `online`), sin intervención, se envía el gasto, se sube la foto y desaparece el indicador. |
| 28 · sin visitas ni alertas no hay resumen | `tests/avisos/planificador.test.ts` y `avisos.test.tsx`, con la base local. |
| 29 · nada entre 22:00 y 08:00 salvo lo programado | `planificador.test.ts`: una noche entera cada 5 min. Solo sale el recordatorio de compra; material y recordatorio de visita esperan a las 08:00; nada se repite. Silencio configurable. |
| 30 · guía sin instalar | `avisos.test.tsx`: en el navegador sin instalar, «Instala FERGO»; instalada, no. |
| 31 · permiso tras la explicación y «Probar notificación» | `avisos.test.tsx`: el permiso no se pide hasta el toque, queda «Activados», se completa el paso de la bienvenida, y la prueba se muestra y se anota. Con permiso bloqueado, banda en Hoy. |
| 32 · zonas táctiles de 44 × 44 | `tests/accesibilidad/auditoria.test.tsx` (auditoría de 14 pantallas). |
| 33 · contraste de 4,5:1 | `auditoria.test.tsx` (pares del CSS y de tokens). |
| 34 · lector de pantalla | `tests/accesibilidad/criterio34.test.tsx`: registrar un gasto y marcar una visita como hecha solo con roles, nombres accesibles y teclado, con anuncio en `role="status"`. |

## Pruebas

| Carpeta / archivo | Pruebas |
|---|---|
| `tests/avisos/planificador.test.ts` | 13: resumen, una vez por asunto, 3 líneas, hora configurable, semanal, criterios 28 y 29, silencio configurable, recordatorio de visita y enlaces. |
| `tests/avisos/avisos.test.tsx` | 9: envío simulado con la base local, Pablo, criterio 28, Ajustes con Deshacer, criterios 30 y 31, banda de Hoy y enlaces al abrir la app. |
| `tests/accesibilidad/` | 15: sincronización (cola, edición y borrado lógico, sin conexión, fallo y reintento, ajustes, conflictos), criterios 7, 32, 33 y 34, texto del sistema, «Reducir movimiento» y control del auditor. |
| `tests/informes/` y `src/features/informes/*.test.ts` | 5 + 11: cálculos de las 5 tarjetas, CSV es-ES, xlsx válido (CRC y 5 hojas), pantalla con datos y vacía, y exportar (descarga y compartir). |

PRUEBA: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
PRUEBA: node node_modules/vitest/vitest.mjs run
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/avisos/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/accesibilidad/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/informes/vitest.config.ts
PRUEBA: node scripts/verificar.mjs

**Resultado real** (2026-11-07, sobre el árbol final; `node scripts/verificar.mjs` dos veces seguidas, las dos con código 0):
- tipos (`tsc`) del proyecto y de cada carpeta de pruebas;
- `vitest run` de `src/`: 391 de 391;
- carpetas de pruebas:
  - `tests/accesibilidad`: 15;
  - `tests/agenda-clima`: 37;
  - `tests/alertas`: 14;
  - `tests/avisos`: 22;
  - `tests/clientes-ubicacion`: 29;
  - `tests/clima`: 42;
  - `tests/informes`: 5;
  - `tests/preparacion`: 36;
  - `tests/preparar`: 12;
- build y PWA.

Los logs están en `.temp/a/o9-verificar1.log` y `.temp/a/o9-verificar2.log`.

## Archivos tocados fuera de las carpetas nuevas

- **`src/App.tsx`**: rutas de Ajustes, Informes, Avisos, Instalación y Exportar; enlaces profundos; planificador simulado y sincronización.
- **`src/screens/Hoy.tsx`**: banda de avisos bloqueados.
- **`src/screens/Movimientos.tsx`**: «Ticket sin subir».
- **`src/styles/app.css`** (`.chip`) y **`src/features/preparar/preparar.css`** (casilla de ropa): defectos de la auditoría.
- **`vite.config.ts`** (`importScripts`) y **`public/avisos-sw.js`**: clic en la notificación.

## Pendiente o fuera de esta ola

- **Push real y servidor** (Web Push con VAPID, proceso cada 5 minutos, Supabase): fuera de alcance. Hoy todo es simulado y registrado. Al enchufar el servidor, el planificador puro y `ServidorSync` son los puntos de entrada.
- **Descarga inicial en un móvil nuevo** (§14.7) y **traer cambios del servidor**: sin servidor no aplican. La regla de conflictos está hecha y probada.
- **«Ticket sin subir»**: mientras no haya servidor, ese indicador se queda en todas las fotos (es cierto: no se subieron).
- **Avisos de cobros del catálogo de §12.2** (COBRO_POST_VISITA, COBRO_SIN_REGISTRAR, COBRO_VENCIDO, FIANZA_PENDIENTE): no están en el planificador de esta ola. Los pendientes ya se ven en Hoy y en «Te deben».
- **Ajustes:** «Perfil y negocio» y «Categorías» (§10.10.1–2) siguen sin pantalla; el modo fiscal está fuera de la v1.
- **Supuestos de Informes:**
  - margen por cliente del año en curso;
  - «últimos N meses» incluye el actual;
  - el gasto por categoría incluye los gastos de equipo, marcados.
- **Auditoría sin dispositivo real:** es automática en jsdom, sin navegador real ni VoiceOver real. El tamaño y el contraste se miden sobre lo que declara el CSS. Conviene una pasada a mano en el móvil de Felipe, al sol y con el texto al 130 %.

RESUMEN: La v1 queda cerrada. Hay un único resumen diario de avisos que respeta las horas de silencio, con sus ajustes y la prueba de notificaciones (en modo de prueba, sin envíos reales). Felipe tiene informes de cómo le va y puede sacar sus datos a Excel o CSV. La app pasó una auditoría de accesibilidad y funciona sin conexión, con sincronización al volver la red. Todas las pruebas pasan.

ESTADO: Notificaciones, informes y exportación listo para integrar
