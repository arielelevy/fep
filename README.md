# FERGO · App de gestión

PWA para llevar el día a día de FERGO desde el móvil: registrar gastos y cobros, llevar los clientes y lo que deben, los aportes de Pablo y las fianzas, y ver lo que hay en caja y lo ganado en el mes. Los datos se guardan en el propio dispositivo (IndexedDB); todavía no hay servidor.

Estado: v1 completa en su alcance sin servidor (olas 1 a 9). La ola 9 añade avisos con resumen diario y horas de silencio, Informes, exportación a Excel/CSV, auditoría de accesibilidad y sincronización local primero, sobre la preparación de trabajo (ola 8), las alertas de clima (ola 7) y la agenda y el semáforo (olas 5 y 6). Sin servidor, lo que depende de él es simulado: el tiempo, los avisos AEMET, los mapas, los avisos (se anotan en Ajustes › Avisos y horarios, no se envía ningún push) y la sincronización (los cambios quedan guardados y pendientes en el móvil). Los avisos de cobros y fianzas del catálogo de §12.2 no están en el planificador. La app sigue siendo una PWA: el pasaje a app Android nativa está documentado, no ejecutado (ver [migración a Android](docs/migracion-android.md)).

## Qué hace hoy

- Se instala como app (manifiesto, iconos y service worker con la app y la fuente en precache).
- **Hoy**: En caja (con desglose efectivo/banco), Ganado en el mes, En fianzas y Aportes; bienvenida y saldo inicial en el primer uso.
- **Registrar gasto**: importe en céntimos, categorías ordenadas por uso en 60 días, último medio de pago, foto del ticket, borrador, confirmación de importes atípicos y «Deshacer» durante 8 s.
- **Registrar cobro, aporte o fianza**: cobro a cliente (trabajo, abono, anticipo u otro ingreso) repartido del pendiente más antiguo; aporte, préstamo y devolución de préstamo de Pablo; fianza con devolución entera o con descuento (gasto automático por la diferencia).
- **Clientes**: listado con buscador y filtros, ficha (llamar, WhatsApp, cómo llegar, deuda, notas, «Este año») y alta o edición.
- **Te deben**: cuotas de abono vencidas y trabajos sin cobrar, con antigüedad y «Ya pagó»; hoja «¿Cobraste a …?» desde «Trabajo hecho».
- **Movimientos**: lista del mes con filtros (también por cliente), editar y eliminar (borrado lógico) con deshacer.
- **Agenda**: franja de 14 días con el tiempo de cada día (días 8 a 14 atenuados y «ORIENTATIVO» con su «i»), visitas puntuales y recurrentes, detalle, mover, cancelar y flujo «Hecho» con cobro.
- **Semáforo de visitas**: en Agenda, Hoy y el detalle cada visita programada dice con palabras «Se puede ir», «Con cuidado», «Mejor mover» o «Sin previsión» según el tiempo y el tipo de trabajo, con consejo y hora de actualización. Los días con alguna visita «Mejor mover» llevan contorno rojo.
- **Alertas de clima**: campana con insignia (cuenta sólo lo que hay que decidir) en Hoy y Agenda, y pantalla Alertas con «Para decidir» y «Para tener en cuenta». Sin duplicados: una alerta por visita y asunto, que se actualiza si cambia el nivel. Desde la alerta se propone día y hora libres, se mueve la visita y se abre WhatsApp Business con el mensaje escrito (enlace wa.me; la app no envía nada), o se mantiene la visita. Todo con «Deshacer».
- **Preparar trabajo**: desde el detalle de una visita o desde Alertas, la preparación de un día con tres bloques. Furgoneta (sin reservar, reservada, recogida, devuelta; al recogerla «Registrar los dos» anota el alquiler repartido entre los clientes y la fianza, que no cuenta como gasto; al devolverla, fianza «entera» o «me descontaron»). Material (unión de las plantillas de los tipos de trabajo; «Lo tengo», «Comprar», «Comprado» con gasto opcional, «Recordarme» y «Añadir siempre para [tipo]»). Ropa según las personas del equipo. Todo con «Deshacer», sin conexión y sólo para el titular.
- **Alertas de preparación**: sección «Preparar trabajos» en Alertas (tarjeta por día desde 4 días antes, alquiler de furgoneta pendiente, recoger y devolver, compra y ropa); cuentan en la insignia de la campana lo que hay que decidir. Se recalculan desde los datos; sólo se guarda lo pospuesto y lo ya avisado.
- **Ajustes de preparación**: plantillas de material por tipo de trabajo, plantilla de ropa y proveedores de alquiler (con proveedor habitual: precarga la reserva y da «Llamar a …»).
- **Avisos** (modo simulado): un único resumen diario a las 21:00 («Mañana: 3 visitas», como mucho 3 líneas, sin repetir asuntos), más avisos inmediatos de lo operativo (aviso oficial AEMET, recordatorio antes de la visita y los de preparación), sin nada entre las 22:00 y las 08:00 salvo lo que Felipe programó. Cada aviso lleva acción y enlace profundo (`/?ir=…`) a la pantalla donde se resuelve. El planificador corre en el móvil al abrir la app y cada 5 minutos, sólo con el titular. En Ajustes › Avisos y horarios se cambian las horas y el recordatorio (con «Deshacer») y se ve lo que la app habría enviado; en Ajustes › Instalación y avisos, el permiso (tras una explicación propia), «Probar notificación» y la guía. Si el permiso está bloqueado, Hoy lo avisa con una banda.
- **Informes**: desde Movimientos. Ganado por mes (12 meses), gasto por categoría del mes, margen por cliente del año, alquiler de furgoneta (3, 6 y 12 meses) y crecimiento, con barras y siempre el valor en texto.
- **Exportar datos**: en Informes y en Ajustes. Movimientos, clientes, visitas, fianzas y préstamos de un rango de fechas (por defecto, el año en curso) en un .xlsx de 5 hojas o en CSV es-ES (uno por hoja); se comparte con la hoja del sistema o se descarga.
- **Sin conexión y sincronización**: todo se guarda antes en el móvil con identificador propio y borrado lógico; la cola de cambios se deduce de los datos y se envía al abrir, al volver la conexión y cada 60 s (`src/sync/`). Sin servidor los cambios quedan pendientes, y en Movimientos las fotos de tickets muestran «Ticket sin subir».
- **Ubicación del cliente**: mapa con chincheta corregible en el alta, la edición y la ficha; sin conexión el cliente se guarda igual, sin coordenadas.
- **Rol colaborador**: en Ajustes se elige quién usa el móvil (Felipe o Pablo); Pablo sólo registra aportes y préstamos, y no recibe avisos.

## Uso

Probado con Node 26 y npm 11.

```
npm ci
npm run dev        # servidor de desarrollo
npm test           # pruebas (Vitest + jsdom + fake-indexeddb)
npm run build      # build de producción en dist/
npm run verificar  # tipos, pruebas (src/ y cada carpeta tests/*/), build y comprobación de la PWA
```

`node scripts/verificar.mjs` es la verificación completa de la ola; si falta `node_modules`, ejecuta antes `npm ci`.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/screens/` | Pantallas: Hoy, Agenda, Detalle, alta y mover visita, hoja Hecho, Registrar (gasto y dinero), Movimientos, Clientes (listado, ficha, alta), Te deben, hoja de cobro, Saldo inicial, Guía de instalación |
| `src/features/ajustes/` | Pantalla Ajustes (avisos, preparación, exportar, quién usa el móvil) |
| `src/features/avisos/` | Avisos: planificador puro (resumen, silencio, inmediatos), envío simulado registrado, enlaces profundos, permiso y pantallas Avisos y horarios e Instalación y avisos |
| `src/features/informes/` | Informes (cálculos puros y pantalla) y exportación a .xlsx/CSV sin dependencias |
| `src/sync/` | Sincronización local primero: cola deducida de los datos, interfaz `ServidorSync` (sin servidor), fusión por campo y hooks |
| `src/clima/` | Motor del semáforo por reglas, servicio con caché, proveedor simulado y hooks |
| `src/agenda/clima/` | Franja del tiempo, línea de semáforo y «Tiempo de la visita» |
| `src/dominio/alertas/` | Motor de alertas de clima (catálogo, deduplicación, avisos AEMET simulados, huecos para mover, mensajes wa.me); contrato en `CONTRATO.md`, supuestos en `PREGUNTAS.md` |
| `src/pantallas/alertas/`, `src/componentes/alertas/` | Pantalla Alertas, tarjeta «Para decidir» con mover y avisar, y campana con insignia |
| `src/features/preparar/` | Preparar trabajo: lógica pura, escrituras (reservas, recogida, devolución, material, ropa), bloques de pantalla y formulario de reserva; contrato en `CONTRATO.md` |
| `src/features/alertas/preparacion/` | Alertas de preparación (motor puro, planificador de avisos, estado de lo avisado y pospuesto) y sección «Preparar trabajos» de Alertas; contrato en `CONTRATO.md` |
| `src/features/ajustes/plantillas/`, `src/features/ajustes/proveedores/` | Ajustes de plantillas de material y ropa, y proveedores de alquiler |
| `src/clientes/ubicacion/`, `src/geocodificacion/` | Mapa con chincheta y geocodificación tras una interfaz (proveedor simulado) |
| `src/components/` | Barra inferior, Deshacer, diálogos, cifras animadas, iconos |
| `src/domain/` | Tipos, categorías iniciales, cálculo de cifras, pendientes (Te deben, fianzas, préstamos) y orden de categorías |
| `src/db/` | IndexedDB con Dexie: esquema, siembra y repositorio |
| `src/lib/` | Dinero (céntimos y formato es-ES), fechas en Madrid, imágenes, hooks |
| `src/styles/` | Tokens de diseño y estilos |
| `scripts/` | `verificar.mjs` y `generar-iconos.mjs` |
| `public/` | Iconos de la PWA y `avisos-sw.js` (abre la pantalla exacta al tocar una notificación; lo carga el service worker con `importScripts`) |
| `tests/` | Pruebas por frente con su propia configuración: `tests/clima`, `tests/agenda-clima`, `tests/clientes-ubicacion`, `tests/alertas`, `tests/preparar`, `tests/preparacion`, `tests/avisos`, `tests/informes`, `tests/accesibilidad` (incluye la auditoría automática de zonas táctiles, contraste y nombres accesibles) |

## Documentación

- [Referencia escrita de la maqueta](docs/maqueta.md), a partir de `FERGO App Mockups.pdf`.
- [Evidencia de los criterios de aceptación](docs/criterios-aceptacion.md): matriz de los 34 criterios de §18 con la prueba que cubre cada uno.
- Notas de las versiones: [1.0.0](docs/releases/1.0.0.md) (v1 completa) y [0.1.0](docs/releases/0.1.0.md).
- [Pasaje a app Android nativa con Capacitor](docs/migracion-android.md): requisitos, pasos, compilación, recorrido de aceptación y decisiones pendientes (documentado, no ejecutado).
- Informes de cada ola en [`review/factory/`](review/factory/): ficha, informes de los frentes y QA.
