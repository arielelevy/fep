# Motor de alertas de clima: contrato para la pantalla Alertas

Ola 7, frente A. Solo lógica y datos, sin interfaz. Se importa todo desde `src/dominio/alertas` (`index.ts`).
Spec: §8.13, §10.7, §11, §12, §13.1 y §4.3.

## Qué hay

| Pieza | Para qué |
|---|---|
| `recalcularAlertas(entrada)` | Función pura. Recibe visitas, clientes, clima por cliente, estado anterior y `ahora`. Devuelve `{ estado, nuevas, actualizadas, resueltas, caducadas, pendientes_de_aviso }`. Es idempotente. |
| `alertasActivas(estado)` | Lista para la pantalla: primero «para decidir», después por fecha y hora. |
| `contarParaDecidir(estado)` | Número de la insignia de la campana. No cuenta las informativas. |
| `marcarNotificadas(estado, ids, ahora)` | Marca lo ya incluido en el resumen diario o en un aviso inmediato. |
| `proponerMover({ visita, visitas, cliente, clima?, ahora })` | `{ dias: OpcionDia[3], horas: OpcionHora[], nota_horas }`. El primer día es el «Sugerido». |
| `horasLibres(entrada, fecha)` | Horas libres de otro día, cuando se elige otro día o «Otro». |
| `esHuecoLibre(fecha, hora, duracion, visitas, excluirId?)` | Para validar «Otra» hora. |
| `mensajeMoverVisita({ fechaOriginal, fechaNueva, horaNueva, causa })` | Texto de §13.1. El motivo cambia según `alerta.causa`; con `causa: null` usa la plantilla «por otro motivo». |
| `enlaceWhatsApp(telefonoE164, texto?)` | `https://wa.me/34611566779?text=…`. Devuelve `null` si el teléfono no es E.164: entonces el botón pasa a «Mover visita» y se muestra «Añade su teléfono para avisarle». |
| `mensajeCancelarVisita`, `mensajeRecordatorioCobro(concepto, importeCentimos)` | Las otras plantillas de §13.1. |
| `almacenAlertasLocal()` / `almacenAlertasEnMemoria()` | Dónde vive el estado. El local usa la tabla `ajustes` existente (clave `alertas_clima`), sin cambiar el esquema. |
| `prepararClima(clientes, { servicio?, avisos?, ahora? })` | Junta la previsión y los avisos de cada cliente en un `Map<cliente_id, ClimaCliente>`. |
| `recalcularYGuardar(almacen, { visitas, clientes, clima, usuario, negocio, ahora? })` | Lee, recalcula y guarda. |
| `mantenerVisita(almacen, alertaId)` | «Mantener la visita». Devuelve `{ alerta, deshacer }`. |
| `moverVisitaPorAlerta(almacen, alertaId, fecha, hora)` | Mueve la visita con motivo `clima` y resuelve la alerta. Devuelve `{ visita, alerta, deshacer }`. |
| `quienSoy()` | `{ usuario, negocio, titular }`. Solo el titular decide; si no, salta `SinPermiso`. |

## `AlertaClima` (ver `tipos.ts`)

- **Campos comunes de §8**: `id` (UUID), `negocio_id`, `creado_en`, `actualizado_en`, `creado_por`, `modificado_por`, `eliminado_en` y `version`.
- **`tipo`**: `CLIMA_INFO`, `CLIMA_DECIDIR`, `CLIMA_AEMET` o `CLIMA_MEJORA`.
- **`nivel`**: `info`, `decision` o `urgente`. **`seccion`**: `para_decidir` o `para_tener_en_cuenta`. **`canal`**: `resumen_diario` o `inmediata`.
- **`clave_asunto`**: `clima:<visita>:<día>`. Una sola alerta viva por asunto.
- **`clave_dedupe`**: `clima:<visita>:<día>:<TIPO>:<nivel>`.
- **`entidad`**: `{ tipo: 'visita', id }`. También `cliente_id`, `fecha` (día afectado), `hora` y `dias_antelacion`.
- **`semaforo`** (`verde`, `ambar` o `rojo`) siempre va con **`estado_semaforo`** («Se puede ir», «Con cuidado», «Mejor mover»). Nunca solo color.
- **Textos listos para la tarjeta**:
  - `etiqueta_superior`: «MEJOR MOVER · EN 4 DÍAS»;
  - `dato_clave`: «80% lluvia» o «Amarillo por viento»;
  - `titulo`: «Jueves 15 · Fam. García»;
  - `cuerpo`: «Césped a las 09:00. Lluvia a partir de las 13:00.»;
  - `texto_resumen`, para el resumen de las 21:00.
- **`causa`**: lluvia, viento, tormenta, calor, helada, nieve o `null`. Va a `mensajeMoverVisita`.
- **`aviso`**: el `AvisoOficial`, si lo hay.
- **`accion_principal`** y **`accion_secundaria`**: `{ id, texto }`. Por ejemplo `mover`, «Mover y avisar por WhatsApp Business», o `mantener`, «Mantener la visita».
- **`estado`**: `activa`, `resuelta`, `descartada` o `caducada`. También `notificada_en` y `resuelta_en`.

## Reglas (§12.2)

- **CLIMA_INFO**: visita en ámbar o rojo a 5 días o menos.
- **CLIMA_DECIDIR**: visita en rojo a 2 días o menos, o a 4 días si la lluvia es ≥ 80 %.
- **CLIMA_AEMET**: aviso oficial en la zona y fecha, hasta 3 días antes. Inmediata.
- **CLIMA_MEJORA**: una alerta activa pasa a verde. La alerta anterior se resuelve y queda un único «Ya no se prevé lluvia. Mantén la visita.».
- **Sin alerta**: a 7 días o más (orientativo) o con «Sin previsión» no se crea ni se resuelve nada.
- **Visita movida, cancelada, hecha o pasada**: su alerta se cierra.

## Deduplicación

- Recalcular N veces con lo mismo no crea nada.
- Si cambia el nivel o el tipo, se actualiza la misma alerta (mismo `id`, `version` + 1). Solo vuelve a avisar (`notificada_en = null`) si empeora o sube de escalón. Si mejora, se actualiza sin avisar.
- **«Mantener la visita»** guarda un descarte por asunto con su gravedad. Ese asunto no vuelve salvo que empeore por encima. Un aviso oficial es otro asunto, así que sí aparece.

## Flujo típico en la pantalla

```ts
import { alertasActivas, almacenAlertasLocal, contarParaDecidir, enlaceWhatsApp, mensajeMoverVisita, moverVisitaPorAlerta,
  prepararClima, proponerMover, quienSoy, recalcularYGuardar } from '../../dominio/alertas';

const almacen = almacenAlertasLocal();
const yo = await quienSoy();
const clima = await prepararClima(clientes);                       // app real: «Sin previsión» → sin alertas de semáforo
const r = await recalcularYGuardar(almacen, { visitas, clientes, clima, ...yo });
const lista = alertasActivas(r.estado); const insignia = contarParaDecidir(r.estado);

const p = proponerMover({ visita, visitas, cliente, clima: clima.get(cliente.id), ahora: new Date() });
const texto = mensajeMoverVisita({ fechaOriginal: alerta.fecha, fechaNueva: p.dias[0].fecha, horaNueva: p.dias[0].hora, causa: alerta.causa });
const url = enlaceWhatsApp(cliente.telefono, textoEditado ?? texto);   // null → «Mover visita» sin avisar
const { deshacer } = await moverVisitaPorAlerta(almacen, alerta.id, fecha, hora);  // luego window.open(url) si hay
```

## Datos simulados

- **Clima de prueba** (`fixtures/clima.ts`) y **avisos AEMET en formato tipo CAP** (`fixtures/aemet.ts`): solo los importan las pruebas. No se exportan desde `index.ts`.
- **AEMET en la app real**: `proveedorAemetPorDefecto()` devuelve `null` y no se llama a AEMET.
- **Clima en la app real**: la previsión sale del servicio de `src/clima`. En producción no tiene proveedor y todo queda «Sin previsión».
