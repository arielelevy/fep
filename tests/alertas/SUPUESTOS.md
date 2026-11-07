# Alertas de clima: supuestos de las pruebas (ola 7, frente B)

Las pruebas están en `tests/alertas/criterios.test.tsx`. Cubren los criterios 17 y 19 a 23 de §18 de la especificación, uno por bloque `describe`. Usan el clima y los avisos AEMET simulados de `src/clima`, el motor del frente A y la base local falsa. Lo que el texto de los criterios no fija se resolvió así; cada punto queda como pregunta abierta.

1. **Resumen de las 21:00 (criterio 19).** Ni el resumen ni su envío push existen todavía: son tareas del servidor y quedan fuera de alcance. La prueba lo arma igual que lo armará el servidor con el motor: alertas activas del canal «resumen diario» que todavía no se avisaron, marcadas como avisadas al enviarlas. «Una sola vez» se comprueba con dos vueltas más del motor que no vuelven a incluirla. ¿Vale este supuesto hasta que exista el resumen en el servidor?
2. **«Pasa a rojo 5 días antes» (criterio 19).** Se usa lluvia del 70 % con 3 mm/h en la franja de un corte de césped: rojo, pero por debajo del 80 %. Con 80 % o más, el motor ya pide decidir a 4 días (§12.2).
3. **«Salvo que empeore» (criterio 23).** Rojo ya es el nivel más alto del semáforo, así que una visita mantenida en rojo solo puede empeorar con un aviso oficial. La prueba comprueba que no vuelve con el mismo tiempo y que sí vuelve con un aviso AEMET naranja. El caso «ámbar mantenido que pasa a rojo» lo cubren las pruebas del motor (frente A).
4. **«Se abre WhatsApp» (criterio 22).** No se envía nada real. Se comprueba la dirección que se abriría: `https://wa.me/34611566779?text=…`, con el mensaje que había en la burbuja.
5. **Visita con semáforo rojo y aviso oficial a la vez (criterio 17).** El motor guarda dos alertas. La pantalla muestra una sola tarjeta con los dos motivos y la campana cuenta 1. Lo decidió Ariel el 2026-11-07.
6. **«Otro» día.** Es un calendario de 13 días con el semáforo de la visita en cada día (color y estado en palabras). Lo decidió Ariel el 2026-11-07.
