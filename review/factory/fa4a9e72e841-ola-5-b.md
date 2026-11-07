# Ola 5 · Frente B: pruebas de visitas y abonos

Feature «Pruebas de visitas y abonos»: criterios 9, 10, 12 y 13 de §18 de la especificación.
Sólo se agregaron pruebas `*.f5.test.*`. No se tocó `src/` fuera de ellas, ni `package.json`, ni la configuración. Sin Git.

## Archivos y criterios

| Archivo | Pruebas | Criterios | Qué cubre |
|---|---|---|---|
| `src/domain/visitasAbonos.f5.test.ts` | 17 | 12, 13, 9 y 10 (parte pura) | Cobro esperado de abono el día de cobro en hora de Madrid (`calcularPendientes`, `cuotasVencidas` y `abonosEsperados.ts` de C), saldado por `periodo_abono`, parcial, cobro borrado, otro cliente, clientes puntuales/inactivos/borrados. `fechasSerie` quincenal: cadencia, ventana a mitad de serie, `fecha_fin`, 8 semanas. `estadoCobroVisita`: cobrada, parcial, pendiente, no aplica. |
| `src/db/visitas.f5.test.ts` | 20 | 9, 10, 12, 13 | Contra IndexedDB (`repo.ts` de A). Hecho con «Sí, 150 €» y el último medio usado, otro medio elegido, deshacer, sin doble cobro. «No, me paga después» sube «Te deben» 150 €; cobro parcial; visita de abono sin deuda. Abono con día de cobro 1: suma el 1 de diciembre y no el 30 de noviembre; lo salda el cobro del periodo. Serie quincenal: materializa sin duplicar. «Esta y las siguientes» cambia las futuras y no las pasadas ni las hechas; cambio de frecuencia; deshacer. «Solo esta visita». Visita puntual: alta con trazabilidad, validación, mover (con `reprogramada_desde` y motivo), deshacer, mover y cancelar en serie sin recrear. |
| `src/screens/hojaHecho.f5.test.tsx` | 4 | 9, 10 (interfaz) | `HojaHecho` de C: «¿Cobraste a Sra. Morales?» con Bizum preseleccionado (último usado), «Sí, 150 €» → visita hecha y cobro de 150 € en Bizum, barra «Visita completada». «No, me paga después» → «Te deben» +150 €. Ficha del cliente muestra «Te debe 150 €». «Cobré otra cantidad» deja 100 € pendientes. |

## Pruebas

PRUEBA: node node_modules/vitest/vitest.mjs run src/domain/visitasAbonos.f5.test.ts src/db/visitas.f5.test.ts src/screens/hojaHecho.f5.test.tsx
PRUEBA: node node_modules/vitest/vitest.mjs run
PRUEBA: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit

Resultado (2026-11-07, sobre el árbol con el código de A y C en ese momento):
- Pruebas de B: 41 pasan, 0 fallan (17 + 20 + 4).
- Suite completa: 20 archivos, 248 pasan, 0 fallan.
- `tsc --noEmit`: sin errores.

Estos resultados corresponden al estado del código al correrlos. A y C siguen editando (`HojaHecho.tsx` cambió después de la última corrida completa); hay que volver a correr la suite antes de integrar.

## Notas para A y C (no las arreglé)

- **A · horizonte de materialización.** `editarSerieDesde` y `crearSerie` materializan 8 semanas desde `max(hoy, fecha_inicio)`. Si la serie nueva empieza en el futuro, se crean visitas más allá de hoy + 8 semanas (ejemplo: hoy 7/11, editar desde el 17/11 crea la del 12/01/2027). §8.5 dice «8 semanas de antelación». No rompe el criterio 13. La prueba no fija el horizonte; sólo comprueba fechas, cambios y que no haya duplicados.
- **A · `visita_id` en el movimiento.** §8.6 pide `visita_id` en Movimiento. Hoy el cobro se liga a la visita por `saldos: deuda:<id>` → `Deuda.visita_id`. Funciona, pero el campo de §8.6 no existe en `Movimiento`.
- **C · medio preseleccionado.** `HojaHecho` fija el medio inicial con `useState(datos?.ultimoMedio ?? 'efectivo')`. Si la hoja se monta antes de que carguen los datos, queda en Efectivo y no en el último usado (criterio 9). Hoy no pasa porque la hoja se abre con los datos cargados. La prueba replica eso y monta la hoja con los datos ya cargados.
- **C · firma.** El mensaje de C anunciaba `completarVisita` con otra firma. Las pruebas usan la firma real de A: `completarVisita(visitaId, { cobrado, medio_pago } | null)`.

RESUMEN: Pruebas automáticas de los criterios 9, 10, 12 y 13: cobrar al marcar Hecho, dejar pendiente, abono que vence el día de cobro y editar «esta y las siguientes» en una serie quincenal. También cubren visitas puntuales, mover y cancelar. Todas pasan.

ESTADO: pruebas de visitas y abonos listo para integrar
