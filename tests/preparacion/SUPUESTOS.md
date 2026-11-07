# Alertas de preparación, plantillas y proveedores: supuestos (ola 8, encargo B)

Las pruebas están en `tests/preparacion/`:

- `criterios.test.tsx`: criterios 24 a 27 de §18, un `describe` por criterio.
- `motor.test.tsx`: reglas del motor y del planificador.
- `ajustes.test.tsx`: plantillas, proveedores, permisos y navegación.

Usan la base local falsa (IndexedDB) y las escrituras de Preparar trabajo (encargo A). No se envía ningún aviso real.

1. **Avisos push (criterios 24 a 26).** El proceso del servidor que envía los avisos cada 5 minutos (§12.4) todavía no existe: no hay servidor ni cuentas, y crearlos queda fuera de alcance sin autorización. La regla que usará está en `src/features/alertas/preparacion/planificador.ts` y es la que se prueba. «Recibo una notificación» se comprueba como «el planificador la da por enviar a esa hora, y no antes ni dos veces».
2. **Resumen diario (criterio 24).** El resumen de las 21:00 tampoco existe aún, igual que en la ola 7. `lineasResumen` devuelve las líneas de preparación y cada una sale una sola vez por escalón: con la antelación configurada (4 por defecto), a 3 días y a 1 día.
3. **Horas de silencio.**
   - El recordatorio de compra lo programa Felipe, así que se avisa aunque caiga en horas de silencio (criterio 29).
   - La recogida y la devolución de la furgoneta salen a su hora aunque caigan entre las 22:00 y las 08:00 (decisión de Ariel del 2026-11-07).
   - Los demás avisos inmediatos esperan a que acaben las horas de silencio.
4. **FURGO_RESERVAR el mismo día.** Si llega el día y sigue sin reserva, la alerta sigue (urgente, «HOY»). La especificación solo nombra 4, 3 y 1 día.
5. **«Aún no» en la devolución.** Aparta la tarjeta hasta el día siguiente a las 10:00.
6. **«Ya lo compré» en Alertas.** Pasa a «Comprado» todo lo que estaba en «Comprar». El gasto se registra desde Preparar trabajo, que es donde está «¿Registrar el gasto?».
7. **«Ya la reservé» y «Me descontaron» en Alertas.** Se resuelven sin salir de Alertas: el formulario de reserva (mismos valores por defecto que en Preparar trabajo) y el importe devuelto en la propia tarjeta. Las escrituras son las del encargo A (`guardarReserva` y `registrarDevolucion`).
8. **Texto de ROPA_PREPARAR.**
   - Nombra como mucho 4 prendas por persona que aún no estén marcadas. Si hay más, termina en «y lo demás».
   - Con la plantilla por defecto queda: «Mañana sois 3: prepara polos, pantalones, guantes, botas y lo demás.»
   - El ejemplo de §12.2 («polos, guantes, botas y gafas») sale cuando el resto ya está marcado.
9. **Día ya preparado.** Su tarjeta se quita de Alertas y la campana no la cuenta (decisión de Ariel del 2026-11-07).
