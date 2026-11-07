# Preparar trabajo: contrato de datos (ola 8, encargo A)

Este contrato es para el encargo B (plantillas y proveedores en Ajustes; alertas FURGO, MATERIAL y ROPA). Todo se guarda en local, en la tabla `ajustes` existente, sin cambiar el esquema. Los tipos están en `modelo.ts`; las funciones que escriben, en `operaciones.ts`; la lógica pura, en `logica.ts`.

## Lo que escribe este encargo (B lo lee)

| Clave en `ajustes` | Valor | Para qué le sirve a B |
|---|---|---|
| `preparaciones` | `Record<fecha AAAA-MM-DD, Preparacion>` | MATERIAL_REVISAR (artículos `sin_revisar`), COMPRA_RECORDATORIO (`recordatorio_compra`, hora local de Madrid «AAAA-MM-DDTHH:MM») y ROPA_PREPARAR (`ropa_marcada`). |
| `reservas_vehiculo` | `ReservaVehiculo[]` | FURGO_RESERVAR (no hay reserva viva para un día con `requiere_vehiculo`), FURGO_RECOGER (`recogida`) y FURGO_DEVOLVER (`devolucion`, `fianza_id`). Usa `reservaDelDia(reservas, fecha)`. |

- **Campos comunes**: `Preparacion` y `ReservaVehiculo` llevan los campos comunes de §8 (`id` UUID, `negocio_id`, `creado_por`, `modificado_por`, `version` y `eliminado_en`).
- **Reserva anulada**: queda con `estado: 'cancelada'` y `eliminado_en`.
- **Estado de la reserva**: `reservada` → `recogida` → `devuelta`.
  - `recogida` se pone al pulsar «Registrar los dos». Guarda `gasto_ids` (un gasto de alquiler por cliente) y `fianza_id`, que es el movimiento `fianza_entregada`.
  - `devuelta` se pone al registrar la devolución con `devolverFianza`.
- **Lógica reutilizable**: `visitasDelDia`, `necesitaPreparacion` (§10.8.4), `personas` (1 + ayudantes), `listaMaterial`, `listaRopa`, `bloques` y `textoProgreso`, para que el resumen y las tarjetas de Alertas usen la misma regla.

## Lo que este encargo lee de B (provisional, en `plantillas.ts`)

Lee estas claves de `ajustes`. Si no hay nada, usa lo que fija la especificación (§8.12) y no inventa nada:

| Clave | Forma esperada | Si no existe |
|---|---|---|
| `plantillas_material` | `Partial<Record<TipoTrabajo, string[]>>` | Solo `setos_poda`: cuchillas cortasetos, gasolina de mezcla, sacos de restos y lona. |
| `plantilla_ropa` | `PrendaPlantilla[]` (`clave`, `singular`, `plural`, `unidad?`, `porEquipo?`) | La plantilla de §8.12. |
| `proveedores_alquiler` | `{ id, nombre, telefono, precio_dia, fianza_habitual, habitual? }[]` (importes en céntimos) | Ninguno: el nombre se escribe en la reserva. |

Si B guarda con otras claves o con otra forma, basta con adaptar `leerPlantillas()` en `plantillas.ts`. Es el único punto de lectura.

## Navegación

- **Ruta**: `App.tsx` tiene `{ preparar: fecha }` y abre `PrepararTrabajo`.
- **Desde Alertas**: la tarjeta de preparación de B puede abrirla. Hace falta que la pantalla Alertas reciba un `onPreparar(fecha)`.
- **Desde el Detalle de visita**: ya se abre con «Preparación» (§10.6.4).
