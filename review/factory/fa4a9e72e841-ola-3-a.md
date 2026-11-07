# Ola 4 · Frente A · Clientes, cobros, aportes y fianzas

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Referencias: `FERGO App Mockups.pdf` (ficha de cliente, p. 4) y `docs/maqueta.md`. La app sigue en React (PWA), como decidió Ariel en la ola 3.

## 0. Fallo del QA de la ola 2 (corregido antes de lo nuevo)

- **Síntoma.** `node node_modules/vitest/vitest.mjs run` salía con 1 en la copia limpia de Factory.
- **Reproducción.** Con una copia del repo bajo una ruta corta de Windows (`C:\Users\ARIELL~1\…`), fallan los 13 archivos de prueba con «Cannot find module …/src/test/setup.ts … Does the file exist?». Vite resuelve los archivos con la ruta larga, mientras que la raíz y las carpetas permitidas salen del cwd corto.
- **Por qué no bastaba lo anterior.** `scripts/verificar.mjs` ya hacía `realpath` y `chdir` en la ola 2, pero eso solo cubre ese comando. Llamar a vitest directamente seguía fallando.
- **Arreglo.** En `vite.config.ts`, la raíz de Vite (`root`) y `setupFiles` pasan a usar la ruta real, y el cwd del proceso se normaliza a esa ruta antes de que vitest lance sus procesos. Sirve para cualquier forma de invocar vite o vitest.
- **Verificación.** La misma copia bajo la ruta corta: antes 13 archivos en rojo; después 16 archivos y 195 pruebas en verde, con código 0.
- Se añadió `@types/node` 22.20.5 (exacta) para que `tsc` acepte `node:fs` en la configuración.

## Lo hecho

### Feature 1 · Clientes: listado, ficha y alta

Construida por un agente auxiliar con una interfaz cerrada; yo hice la integración en `App.tsx`.

- **`src/screens/Clientes.tsx` (listado, §10.4.1):**
  - Botón «+», buscador por nombre, dirección o teléfono (sin distinguir acentos) y filtros Todos, Abono, Puntual, Te deben e Inactivos.
  - Cada fila lleva chips Jardín o Piscina, «Abono 90 €/mes» o «Puntual», y la deuda con su antigüedad.
  - Orden: primero los que deben, del pendiente más antiguo; después, alfabético.
  - Estados: cargando, vacío («Aún no tienes clientes» con «Añadir el primero») y sin conexión.
- **`src/screens/ClienteFicha.tsx` (ficha, contra la maqueta p. 4):**
  - «‹ Clientes» vuelve al listado y hay botón «Editar».
  - Chips de servicio y modalidad, por ejemplo «Abono 90 €/mes · cada 15 días».
  - Llamar (`tel:+34…`), WhatsApp (`https://wa.me/34…`) y Cómo llegar (`maps.apple.com`, §13.5). Sin datos, el botón pasa a «Añadir teléfono» o «Añadir dirección» y lleva a Editar.
  - Tarjeta de deuda ámbar, o roja desde los 15 días, con «Ya pagó».
  - Notas editables en línea, con deshacer.
  - «Este año»: Cobrado, Gastado (imputado) y Te queda, que es el margen de §9.5.
  - «Trabajo hecho», «Ver movimientos» y «Desactivar cliente» con confirmación.
- **`src/screens/ClienteForm.tsx` (Nuevo / Editar, §10.4.3):**
  - Secciones plegables: Contacto (con «Elegir de mis contactos» cuando el navegador lo permite), Ubicación, Servicio (y abono), Trabajo habitual y Notas.
  - Obligatorios: nombre, al menos un servicio, modalidad y, si es abono, la cuota.
  - Teléfonos guardados en E.164 (`normalizarTelefono`).
  - **Ubicación sin mapa real:** geocodificar y mostrar el mapa son integraciones externas, fuera de esta ola. Queda una caja con el estilo de la app y el texto «Se usa para el tiempo de cada visita.», y lat/lon quedan vacíos.
- El paso «Añade tu primer cliente» de la bienvenida se marca solo al existir un cliente, y se puede seguir marcando a mano.

### Feature 2 · Cobros, aportes, préstamos y fianzas

- **Datos (Dexie versión 2):** tablas `clientes` y `deudas`, y el usuario Pablo como colaborador, con migración para las bases ya creadas. El movimiento suma campos opcionales `saldos`, `periodo_abono`, `fianza`, `fianza_id` y `prestamo_id`, así que los datos guardados no necesitan migrar.
- **Modelo derivado.** La fianza es su movimiento de entrega y el préstamo es su movimiento de préstamo. Su estado, «Te deben», «En fianzas» y «Préstamo pendiente» se calculan a partir de los movimientos activos (`src/domain/pendientes.ts` y `src/domain/cifras.ts`). Por eso borrar o deshacer cualquier movimiento deja todas las cifras coherentes sin lógica extra.
- **Registrar → Cobro** (`src/screens/RegistrarDinero.tsx`):
  - El cliente es obligatorio, salvo en «Otro ingreso», y se elige con un buscador que muestra los 5 más recientes arriba.
  - Al elegir cliente se precarga lo pendiente o, si no debe nada, su precio habitual o su cuota.
  - Chips Trabajo, Abono [mes], Anticipo y Otro ingreso.
  - Lista «¿Qué te paga?» con casillas cuando el cliente tiene varios pendientes. El cobro se reparte del pendiente más antiguo al más reciente, y si es parcial el resto queda pendiente.
- **Registrar → Aporte:** chips Aporte, Préstamo y Devolver préstamo, con el texto en azul «No cuenta como ganancia del negocio.». La devolución muestra «Préstamo pendiente: N €» y no deja devolver más de lo pendiente. En Hoy, bajo «Aportes de papá», aparece «Préstamo pendiente: 300 €».
- **Registrar → Fianza:** «¿A quién se la dejas?» (sugiere las anteriores), motivo («Furgoneta» por defecto) y el texto en ámbar «No es un gasto. Te la devuelven.».
- **Devolución de fianza (§9.6):** se toca la fianza en Movimientos y luego «Me la devolvieron».
  - «Entera» devuelve el total.
  - «Me descontaron algo» crea la devolución por lo devuelto y un gasto automático de Movilidad (categoría «Alquiler de furgoneta») por la diferencia, con nota «Descuento de fianza».
  - Ese gasto resta en Ganado pero no otra vez en caja: según §9.1, ese dinero ya salió al entregar la fianza.
  - Todo se deshace de una vez. Movimientos muestra «Pendiente de devolver», «Devuelta» o «Devuelta con descuento».
- **Hoja «¿Cobraste a …?» (§10.1.4, `src/screens/HojaCobro.tsx`):**
  - Opciones «Sí, [importe]», chips de medio de pago con el último usado, «Cobré otra cantidad» (deja el resto pendiente) y «No, me paga después».
  - Como aún no hay agenda, se abre desde la ficha con «Trabajo hecho» (concepto y precio editables). La agenda podrá usar la misma hoja desde cada visita.
- **«Te deben»:**
  - Suma las cuotas de abono vencidas (el día de cobro de cada mes desde el alta) y los trabajos sin cobrar.
  - La celda de Hoy lleva a la lista (`src/screens/TeDeben.tsx`) con la antigüedad en texto («hace N días»): neutro hasta 6 días, ámbar de 7 a 14 y rojo desde 15.
  - «Ya pagó» abre Registrar en Cobro con el cliente y el importe precargados.
- **Gasto imputado a un cliente (§9.5):** la fila Cliente de Registrar → Gasto ya permite elegir cliente, y ese gasto cuenta en su margen.
- **Movimientos:** los cobros muestran el cliente como título y el tipo de cobro; hay préstamos y devoluciones de Pablo; se filtra por cliente desde «Ver movimientos» (con un chip «Solo [cliente]» para quitar el filtro); la barra Deshacer nombra el tipo («Cobro guardado», «Fianza eliminada»…). Al borrar una fianza o un préstamo se borran con él sus devoluciones, y deshacer las devuelve todas.
- **Rol colaborador (Pablo, §3):**
  - **Capa de datos** (`src/db/repo.ts`): lanza `SinPermiso` si Pablo crea, edita o borra gastos, cobros, fianzas, clientes o trabajos. Puede con aportes, préstamos y sus devoluciones, y queda como `creado_por` y `modificado_por`.
  - **Interfaz:** Registrar abre en Aporte y deshabilita los otros tipos. Los gastos y cobros de Felipe se ven en solo lectura, con «Solo Felipe puede cambiar este movimiento.». Sin «+» de clientes, ni Editar, ni Ya pagó, ni Trabajo hecho. La bienvenida no se le muestra.
  - **Cómo se elige el usuario:** sin inicio de sesión en la v1, en Ajustes hay «Quién usa este móvil» (Felipe o Pablo).
- **Animación de conteo** de 250 ms en las cifras nuevas (Te deben y aportes), con la misma `CifraAnimada`, que respeta «Reducir movimiento».
- **Ajustes visuales:**
  - Las hojas modales quedan por encima de la barra Deshacer, que antes tapaba el botón Guardar, y por debajo de los diálogos.
  - Comprobado con capturas a 390 px sobre la build de producción: listado, formulario, ficha, «¿Cobraste a …?», Registrar en Cobro, Aporte y Fianza, y Hoy.

### Feature 3 · Pruebas

- `src/screens/dinero.test.tsx` (13 pruebas):
  - criterio 4: aporte de 500 €;
  - préstamo y devolución;
  - criterio 5: fianza de 150 €;
  - criterio 6: fianza devuelta con 120 €, y devolución entera con deshacer;
  - criterio 11: 6, 7 y 15 días en «Te deben»;
  - «No, me paga después» con «Ya pagó»;
  - «Sí, 150 €» con el último medio de pago, y cobro parcial;
  - cobro de abono;
  - gasto imputado a un cliente;
  - permisos de Pablo, en la capa de datos y en la interfaz;
  - cambio de usuario desde Ajustes.
- `src/domain/pendientes.test.ts` (9 pruebas): umbrales de antigüedad, cuotas vencidas, «Te deben» con cobros parciales y borrados, reparto del cobro, fianzas y préstamos, y margen por cliente.
- `src/screens/clientes.test.tsx` (20 pruebas, del agente): alta, abono, teléfono inválido, descartar, edición con deshacer, listado (orden, filtros y buscador), antigüedad en el listado, enlaces de la ficha, botones sin datos, deuda ámbar y roja con «Ya pagó», «Este año», notas, desactivar, cliente inexistente y Pablo.
- **Pruebas anteriores ajustadas al nuevo modelo:**
  - `src/db/repo.test.ts`: ahora hay 2 usuarios.
  - `src/domain/cifras.test.ts`: la devolución de fianza indica a qué fianza pertenece.

## Pruebas

PRUEBA: node scripts/verificar.mjs
PRUEBA: node node_modules/vitest/vitest.mjs run

Resultado real con el código final:
- **`node scripts/verificar.mjs`:** código 0. Tipos limpios, 16 archivos y 196 pruebas en verde, build de producción y PWA verificadas.
- **`node node_modules/vitest/vitest.mjs run`:** código 0. En la última comprobación desde la ruta corta (`ARIELL~1`), en una copia limpia, dio 16 archivos y 195 pruebas en verde; esa copia es anterior a la última prueba, la del gasto imputado.
- **Orden de las líneas PRUEBA:** `verificar.mjs` va primero porque instala las dependencias con `npm ci` si la copia limpia no las tiene.

Entorno: Windows 11, Node 26.13.0 y npm 11.20.0. No se probó en un móvil real.

## Pendiente

- **Fuera de esta ola:**
  - Mapa con chincheta y geocodificación (integración externa).
  - «Repartir entre clientes» en un gasto: se imputa a un solo cliente.
  - Visitas («Últimas visitas», «Hecho» desde Hoy y Agenda, y el anticipo descontado al completar una visita).
  - Aviso contextual de Hoy y resumen semanal.
- **Sin probar:** «Elegir de mis contactos» (API de contactos del navegador) en un Android real; en las pruebas solo se comprueba que el botón no aparece si el navegador no la ofrece.
- **Sin autenticación:** el usuario se elige en Ajustes (Felipe o Pablo). Al llegar el backend, el rol vendrá de la sesión y los permisos de `repo.ts` seguirán valiendo.
- **Concurrencia:** durante la ola, otra sesión escribió en el repo, y al copiarlo apareció «file changed as we read it». No se perdió nada: la suite final incluye sus pruebas.

## Decisiones para Ariel

DECISIÓN: «Cómo llegar» abre Apple Maps (`maps.apple.com`), como dice la especificación §13.5, pero la plataforma objetivo es Android. ¿Qué mapa abrimos? | Google Maps en Android y Apple Maps en iPhone | Apple Maps siempre, como dice la especificación
DECISIÓN: Mientras no hay agenda, la hoja «¿Cobraste a …?» se abre desde la ficha del cliente con «Trabajo hecho». ¿Lo mantenemos cuando llegue la agenda? | Mantenerlo para trabajos sin visita programada | Quitarlo y cobrar solo desde la visita
DECISIÓN: El gasto automático por descuento de fianza va a la categoría «Alquiler de furgoneta» (grupo Movilidad). ¿Te parece bien? | Sí, Alquiler de furgoneta | Crear una categoría propia «Descuentos de fianza» en Movilidad

RESUMEN: La app ya tiene clientes (listado, ficha con llamar, WhatsApp y cómo llegar, y alta o edición), cobros con «Te deben» y «Ya pagó», aportes y préstamos de Pablo y fianzas con devolución y descuento automático. Pablo solo puede registrar aportes y préstamos. También se corrigió el fallo de pruebas que encontró el QA de la ola 2, y las 196 pruebas pasan.

ESTADO: Clientes, cobros, aportes y fianzas listo para integrar
