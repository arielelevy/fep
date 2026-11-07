# Alertas de preparación: contrato (ola 8, encargo B)

Spec: §12.2, §10.7, §10.8.4, §12.1, §12.4. Se importa desde `src/features/alertas/preparacion` (`index.ts`).

## Qué hay

| Pieza | Para qué |
|---|---|
| `calcularAlertasPreparacion(entrada)` | Función pura. Recibe visitas, clientes, preparaciones, reservas, plantillas, `avisoFurgoDias`, `pospuestas` y `ahora`. Devuelve `{ alertas, tarjetas }`. La tarjeta de un día todo preparado no sale. |
| `avisosInmediatos(alertas, avisados, ahora)` | Avisos push que tocan ahora. Respeta las horas de silencio, salvo el recordatorio de compra y la recogida y devolución de la furgoneta (campo `ignora_silencio`). |
| `lineasResumen(alertas, avisados)` | Líneas para el resumen de las 21:00. Cada una sale una vez por clave. |
| `marcarAvisados(claves)` / `posponer(asunto, hasta)` | Estado en `ajustes`, con la clave `alertas_preparacion`. |
| `useAlertasPreparacion()` | Hook reactivo para la pantalla y la campana. |
| `SeccionPreparar` / `useHayPreparacion` | Sección «PREPARAR TRABAJOS» de Alertas. La usa `src/pantallas/alertas/Alertas.tsx`. |

## Alertas

| Código | Cuándo | Nivel | Canal | Clave de aviso |
|---|---|---|---|---|
| FURGO_RESERVAR | Visita con furgoneta y sin reserva viva, de 0 días a la antelación configurada (3 a 5, por defecto 4) | decisión; urgente a 1 día o menos | resumen; a 1 día también inmediata desde las 10:00 de la víspera | `furgo:reservar:<día>:<escalón>` (escalones: antelación, 3 y 1) |
| FURGO_RECOGER | Reserva `reservada` y ya pasó la hora de recogida | decisión | inmediata | `furgo:recoger:<reserva>:<recogida>` |
| FURGO_DEVOLVER | Reserva `recogida` y ya pasó la hora de devolución | decisión | inmediata | `furgo:devolver:<reserva>:<devolución>` |
| MATERIAL_REVISAR | Algún artículo `sin_revisar`, de 0 a 3 días antes | decisión | resumen | `material:revisar:<día>` |
| COMPRA_RECORDATORIO | `recordatorio_compra` ya pasado y algo en «Comprar» | decisión | inmediata (programada por Felipe) | `compra:<día>:<recordatorio>` |
| ROPA_PREPARAR | Visitas mañana con alguna prenda sin marcar | info | resumen | `ropa:<día>:<personas>` |

## Para Preparar trabajo (encargo A)

- **«Añadir siempre para [tipo de trabajo]»** (§10.8.2): llamar a `anadirArticuloPlantilla(tipo, nombre)` de `src/features/ajustes/plantillas/datos.ts`. Devuelve `{ nombre, deshacer }`.
- **Proveedores**: se guardan en `proveedores_alquiler` con la forma de `ProveedorAlquiler`, más `direccion` y los campos comunes. Los quitados salen de esa lista y se conservan en `proveedores_alquiler_borrados`.
