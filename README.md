# FERGO · App de gestión

PWA para llevar el día a día de FERGO desde el móvil: registrar gastos y cobros, llevar los clientes y lo que deben, los aportes de Pablo y las fianzas, y ver lo que hay en caja y lo ganado en el mes. Los datos se guardan en el propio dispositivo (IndexedDB); todavía no hay servidor.

Estado: ola 6 (clima y semáforo de visitas), sobre la agenda de la ola 5. Alertas, mover y avisar por WhatsApp e informes llegan en olas posteriores. El tiempo y los mapas son simulados: sin proveedor real, la app instalada muestra «Sin previsión». La app sigue siendo una PWA: el pasaje a app Android nativa está documentado, no ejecutado (ver [migración a Android](docs/migracion-android.md)).

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
- **Ubicación del cliente**: mapa con chincheta corregible en el alta, la edición y la ficha; sin conexión el cliente se guarda igual, sin coordenadas.
- **Rol colaborador**: en Ajustes se elige quién usa el móvil (Felipe o Pablo); Pablo sólo registra aportes y préstamos.

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
| `src/screens/` | Pantallas: Hoy, Agenda, Detalle, alta y mover visita, hoja Hecho, Registrar (gasto y dinero), Movimientos, Clientes (listado, ficha, alta), Te deben, hoja de cobro, Saldo inicial, Guía de instalación, marcadores |
| `src/clima/` | Motor del semáforo por reglas, servicio con caché, proveedor simulado y hooks |
| `src/agenda/clima/` | Franja del tiempo, línea de semáforo y «Tiempo de la visita» |
| `src/clientes/ubicacion/`, `src/geocodificacion/` | Mapa con chincheta y geocodificación tras una interfaz (proveedor simulado) |
| `src/components/` | Barra inferior, Deshacer, diálogos, cifras animadas, iconos |
| `src/domain/` | Tipos, categorías iniciales, cálculo de cifras, pendientes (Te deben, fianzas, préstamos) y orden de categorías |
| `src/db/` | IndexedDB con Dexie: esquema, siembra y repositorio |
| `src/lib/` | Dinero (céntimos y formato es-ES), fechas en Madrid, imágenes, hooks |
| `src/styles/` | Tokens de diseño y estilos |
| `scripts/` | `verificar.mjs` y `generar-iconos.mjs` |
| `public/` | Iconos de la PWA |
| `tests/` | Pruebas por frente con su propia configuración: `tests/clima`, `tests/agenda-clima`, `tests/clientes-ubicacion` |

## Documentación

- [Referencia escrita de la maqueta](docs/maqueta.md), a partir de `FERGO App Mockups.pdf`.
- [Pasaje a app Android nativa con Capacitor](docs/migracion-android.md): requisitos, pasos, compilación, recorrido de aceptación y decisiones pendientes (documentado, no ejecutado).
- Informes de cada ola en [`review/factory/`](review/factory/): ficha, informes de los frentes y QA.
