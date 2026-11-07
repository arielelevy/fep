# FERGO v1 · Evidencia de los criterios de aceptación (§18)

Matriz de trazabilidad de los 34 criterios de la sección 18 de la especificación (v1.0, 6 de noviembre de 2026) con
la prueba automática que los cubre. Todas se corren con `node scripts/verificar.mjs` (tipos, suite de `src/`, cada
carpeta `tests/*/`, build y PWA). La columna «Cómo se verificó» distingue lo que corre contra la app real en jsdom
de lo que depende de un servicio o un dispositivo que todavía no existe (servidor, push real, Safari, VoiceOver).

Coordinadora de la ola 9 · 2026-11-07. Olas 1 a 9 aceptadas en Factory.

## Registro

| # | Criterio (resumen) | Prueba | Cómo se verificó |
|---|---|---|---|
| 1 | Botón lima abre Registrar en Gasto con teclado numérico | `src/App.test.tsx:35`, `src/screens/registroGasto.f3.test.tsx:41` | App en jsdom |
| 2 | «Guardar gasto» cierra en < 300 ms, baja «En caja» y «Ganado» | `src/db/repo.f3.test.ts:64`, `src/domain/cifras.f3.test.ts:160` | App y base local (fake-indexeddb). El tiempo se mide en jsdom, no en un móvil |
| 3 | «Deshacer» en 8 s devuelve las cifras | `src/db/repo.f3.test.ts:72`, `src/domain/cifras.f3.test.ts:160` | Base local |
| 4 | Aporte de 500 €: sube «En caja» y «Aportes», no «Ganado» | `src/screens/dinero.test.tsx:47` | App en jsdom |
| 5 | Fianza de 150 €: baja «En caja», sube «En fianzas» | `src/screens/dinero.test.tsx:82` | App en jsdom |
| 6 | Fianza devuelta con 120 €: gasto de 30 € «Descuento de fianza» | `src/screens/dinero.test.tsx:102` | App en jsdom |
| 7 | Gasto con foto sin conexión; se sincroniza al volver la red | `tests/accesibilidad/sincronizacion.test.tsx:125` | **Servidor simulado en memoria**: no hay backend real (§14 queda listo para conectarlo) |
| 8 | Importe atípico (3.850 € con media 40 €) pide confirmación | `src/db/repo.f3.test.ts:148`, `src/domain/cifras.f3.test.ts:201` | Base local |

## Visitas y cobros

| # | Criterio (resumen) | Prueba | Cómo se verificó |
|---|---|---|---|
| 9 | «Hecho» + «Sí, 150 €» crea el cobro con el último medio | `src/db/visitas.f5.test.ts:51`, `src/db/agenda.test.ts:115` | Base local |
| 10 | «Hecho» + «No, me paga después» suma a «Te deben» | `src/db/visitas.f5.test.ts:103`, `src/db/agenda.test.ts:115` | Base local |
| 11 | Pendiente: ámbar a los 7 días, rojo a los 15 | `src/domain/pendientes.test.ts:26`, `src/screens/dinero.test.tsx:145` | Lógica pura y app |
| 12 | Abono con día de cobro 1 genera el cobro esperado | `src/db/visitas.f5.test.ts:140`, `src/domain/visitasAbonos.f5.test.ts` | Base local |
| 13 | Serie quincenal: «Esta y las siguientes» cambia solo las futuras | `src/db/visitas.f5.test.ts:158`, `src/db/agenda.test.ts:73` | Base local |

## Clima

| # | Criterio (resumen) | Prueba | Cómo se verificó |
|---|---|---|---|
| 14 | Césped con 80 % y 3 mm/h → rojo «Mejor mover» | `tests/agenda-clima/pantallas.test.tsx:118` | **Proveedor de clima simulado** (Open-Meteo y AEMET reales sin conectar; en la app instalada se ve «Sin previsión», decisión de Ariel) |
| 15 | Piscina con 1 mm/h → verde | `tests/clima/semaforo.test.ts:140`, `tests/agenda-clima/pantallas.test.tsx:124` | Proveedor simulado |
| 16 | Poda + fitosanitarios con viento 25 km/h → rojo | `tests/clima/semaforo.test.ts:171`, `tests/agenda-clima/pantallas.test.tsx:127` | Proveedor simulado |
| 17 | Aviso AEMET naranja → rojo y alerta CLIMA_AEMET | `tests/agenda-clima/pantallas.test.tsx:130`, `tests/alertas/criterios.test.tsx` | Avisos AEMET simulados |
| 18 | Días 8–14 atenuados, «ORIENTATIVO», sin semáforo | `tests/clima/semaforo.test.ts:184`, `tests/agenda-clima/pantallas.test.tsx:164` | App en jsdom |

## Alertas

| # | Criterio (resumen) | Prueba | Cómo se verificó |
|---|---|---|---|
| 19 | Rojo a 5 días → «Para tener en cuenta» y una vez en el resumen de las 21:00 | `tests/alertas/criterios.test.tsx:146` | Motor de alertas con clima simulado |
| 20 | Rojo a 2 días → «Para decidir» con propuesta de días y horas | `tests/alertas/criterios.test.tsx:169` | Idem |
| 21 | Cambiar día y hora reescribe el mensaje | `tests/alertas/criterios.test.tsx:212` | App en jsdom |
| 22 | «Mover y avisar por WhatsApp Business» mueve, resuelve y abre `wa.me` | `tests/alertas/criterios.test.tsx:241` | Se comprueba el enlace `wa.me`; no se abre WhatsApp real |
| 23 | «Mantener la visita» no vuelve a avisar salvo que empeore | `tests/alertas/criterios.test.tsx:288` | Motor de alertas |
| 24 | Furgoneta sin reservar a 4 días → «Alquila la furgoneta» y en el resumen | `tests/preparacion/criterios.test.tsx:29` | App en jsdom |
| 25 | «Ya la reservé» → aviso de recogida y registro doble con un botón | `tests/preparacion/criterios.test.tsx:105` | Aviso registrado en modo de prueba |
| 26 | 2 artículos «Comprar» con recordatorio → aviso con esos 2 | `tests/preparacion/criterios.test.tsx:155` | Aviso registrado en modo de prueba |
| 27 | Visita con 2 ayudantes → ropa para 3 personas | `tests/preparacion/criterios.test.tsx:209` | App en jsdom |
| 28 | Sin visitas mañana ni alertas → no hay resumen | `tests/avisos/planificador.test.ts:97`, `tests/avisos/avisos.test.tsx:92` | Planificador |
| 29 | Nada entre 22:00 y 08:00 salvo lo programado por el usuario | `tests/avisos/planificador.test.ts:125` | Planificador |

## Plataforma

| # | Criterio (resumen) | Prueba | Cómo se verificó |
|---|---|---|---|
| 30 | Desde Safari sin instalar muestra la guía de instalación | `tests/avisos/avisos.test.tsx:127` | **Safari simulado** (user agent de iPhone en jsdom) |
| 31 | Permiso de notificaciones tras la explicación; «Probar notificación» funciona | `tests/avisos/avisos.test.tsx:142` | **Notificaciones simuladas**: sin servidor push, el envío se registra en modo de prueba |
| 32 | Zonas táctiles ≥ 44 × 44 (auditoría) | `tests/accesibilidad/auditoria.test.tsx:42` | Auditoría automática de 14 pantallas en jsdom; revisor de la ola 4 midió 62 estados en navegador |
| 33 | Contraste ≥ 4,5:1 (auditoría automática) | `tests/accesibilidad/auditoria.test.tsx:121` | Auditoría automática |
| 34 | Con VoiceOver se registra un gasto y se marca una visita hecha | `tests/accesibilidad/criterio34.test.tsx:31` | **Lector de pantalla simulado** con roles y nombres accesibles; falta VoiceOver real |

## Lo que queda para una pasada en el teléfono de Felipe

Ningún criterio se probó en un dispositivo real. Los que dependen de algo que todavía no existe quedaron verificados
con simulación y conviene confirmarlos a mano antes de usar la app en el trabajo:

- **7 y 31:** sincronización y avisos reales necesitan el servidor (§14, §12), que no está autorizado todavía.
- **14 a 20:** el clima real (Open-Meteo y AEMET) no está conectado; la app instalada muestra «Sin previsión».
- **30 y 34:** instalar desde Safari en un iPhone y recorrer con VoiceOver; también texto al 130 % y uso al sol.
- **2:** el cierre en menos de 300 ms se midió en jsdom, no en el móvil.

## Decisiones de Ariel registradas en la v1

- Maqueta existente (PDF) como insumo a respetar; Alertas, Mover visita y Preparar trabajo se construyeron sin
  maqueta propia y se ajustan cuando la haya.
- La app sigue siendo PWA en React; el pasaje a Android con Capacitor quedó documentado (`docs/migracion-android.md`).
- Clima y ubicación simulados apagados en producción («Sin previsión», clientes sin coordenadas inventadas).
- Versión visible al pie de Hoy.
