# Ola 7 · Frente A · Motor de alertas de clima

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Ola «Alertas de clima y mover visita por WhatsApp» (ficha `fa4a9e72e841-ola-6-ficha.md`).
Esta parte es lógica y datos, sin interfaz. Toda en `src/dominio/alertas/`; evidencia en `.temp/a/`. No toqué nada fuera de esas carpetas: ni la configuración, ni el esquema de la base, ni Git.

## Lo hecho

### Catálogo y niveles (`catalogo.ts`, §11 y §12.2)

- **Catálogo de clima**: CLIMA_INFO, CLIMA_DECIDIR, CLIMA_AEMET y CLIMA_MEJORA. Cada uno lleva disparador, antelación, nivel (info o decisión), sección de la pantalla, canal (resumen diario o inmediata) y acciones con su texto («Mover y avisar por WhatsApp Business», «Mantener la visita», «Ver opciones», «Vale»).
- **Semáforo siempre con texto**: verde «Se puede ir», ámbar «Con cuidado», rojo «Mejor mover».
- **Umbrales en un solo lugar**:
  - los del semáforo por tipo de trabajo (§11.3) no se duplican: son `UMBRALES` de `src/clima`, reexportados como `UMBRALES_SEMAFORO` y documentados en `REGLAS_POR_TIPO`;
  - los de las alertas (5, 2 y 4 días, ≥ 80 %, 3 días para AEMET) y los de mover están en `UMBRALES_ALERTAS`;
  - lo que la spec no fija está anotado en `src/dominio/alertas/PREGUNTAS.md`.

### Motor y deduplicación (`motor.ts`, `dedupe.ts`)

- **`recalcularAlertas`**: es pura e idempotente. Usa el motor de semáforo de `src/clima` (`evaluarVisita`) y no reimplementa reglas.
- **Claves**:
  - `clave_asunto` = familia + visita + día (`clima:<visita>:<día>`, `aemet:…`, `mejora:…`); solo hay una alerta viva por asunto;
  - `clave_dedupe` = asunto + tipo + nivel (por ejemplo `clima:v1:2026-11-09:CLIMA_DECIDIR:rojo`).
- **Cambios de nivel**: se actualiza la misma alerta (mismo id, `version` + 1). Solo vuelve a avisar si empeora o sube de escalón (INFO → DECIDIR). Si mejora (rojo → ámbar), se actualiza en silencio.
- **Mejora a verde**: la alerta se resuelve y queda una única CLIMA_MEJORA («Ya no se prevé lluvia el lunes en Fam. García. Mantén la visita.»), sin culpas ni «!».
- **Visita movida, cancelada, hecha, borrada o pasada**: su alerta se resuelve o caduca.
- **Sin alerta**: con «Sin previsión» (gris) o a 7 días o más no se crea ni se resuelve nada.
- **«Mantener la visita»**: guarda un descarte por asunto y gravedad. El asunto no vuelve salvo que empeore por encima. Un aviso oficial es otro asunto, así que sí aparece.
- **Ayudas**: `alertasActivas` (orden de la pantalla), `contarParaDecidir` (insignia, sin las informativas) y `marcarNotificadas`.
- **Trazabilidad y convenciones**: todas las alertas llevan los campos comunes de §8 (UUID, `negocio_id`, `creado_por`, `modificado_por`, `eliminado_en` y `version`), `cliente_id` y el día en Madrid.

### Aviso AEMET simulado (`aemet.ts`, `fixtures/aemet.ts`)

- **Formato tipo CAP**: `AlertaCap` con `info.parameter` de Meteoalerta (nivel, fenómeno) y área con polígono y zona.
- **`avisosDesdeCap`**:
  - asigna los avisos a la ubicación del cliente con «punto en polígono» (§11.1);
  - da un aviso por día (hora de Madrid) y fenómeno, con el nivel más alto;
  - solo cuenta viento, lluvia, tormenta, calor y nieve (§13.4);
  - ignora los verdes, los de prueba (`Test`) y las cancelaciones.
- **Proveedor**: `crearProveedorAemetSimulado(fixtures)`. En la app real `proveedorAemetPorDefecto()` devuelve `null`: no se llama a AEMET.

### Proveedor de clima en la app real

- **Producción**: `prepararClima` usa por defecto el servicio de `src/clima`, que en producción no tiene proveedor. Todo queda «Sin previsión» y no salen alertas de semáforo (decisión de Ariel). Hay una prueba que lo comprueba.
- **Datos de prueba**: las previsiones fijas viven solo en `fixtures/clima.ts`, no se exportan desde `index.ts` y solo las usan las pruebas.

### Mover la visita (`huecos.ts`, §10.7)

- **`proponerMover`**:
  - propone 3 días a partir del siguiente a la visita, dentro de la franja de 14 días;
  - cada día tiene un hueco libre a hora razonable;
  - orden: verde, después «Sin previsión» u orientativo, después ámbar; nunca rojo;
  - se queda en los días preferidos del cliente si los tiene, y completa con otros marcados `fuera_de_preferidos`;
  - el primero va como «Sugerido», con su tiempo («Sol», «40% lluvia», «Sin previsión»).
- **`horasLibres`**: la hora original primero si está libre; después las mejores.
- **`esHuecoLibre`**: sin solaparse con otra visita, contando su duración más 30 min de desplazamiento.

### Mensaje y enlace (`whatsapp.ts`, §13.1)

- **Plantillas**: mover por clima (el motivo cambia según la causa: lluvia, viento, tormenta, calor, helada o nieve), mover por otro motivo, cancelar y recordatorio de cobro (importe en céntimos, «90 €»).
- **`enlaceWhatsApp(E.164, texto)`**: devuelve `https://wa.me/34611566779?text=<codificado>`, o `null` si el teléfono no es E.164. No se envía nada.

### Operaciones (`operaciones.ts`)

- **Almacenes**: `almacenAlertasLocal()` usa la tabla `ajustes` ya existente (clave `alertas_clima`), sin cambiar el esquema de la base, y funciona sin conexión. También hay `almacenAlertasEnMemoria()`.
- **Funciones**: `prepararClima`, `recalcularYGuardar`, `quienSoy`.
- **`mantenerVisita`** y **`moverVisitaPorAlerta`**:
  - el mover usa `moverVisita` del repo con motivo `clima`;
  - las dos devuelven «Deshacer», que también restaura `reprogramada_desde`;
  - solo el titular puede usarlas; Pablo recibe `SinPermiso`.

### Contrato para B

`src/dominio/alertas/CONTRATO.md` explica qué importar, los campos de `AlertaClima`, las reglas, la deduplicación y un flujo de ejemplo de la pantalla.

## Pruebas (en la misma carpeta, dentro de la suite de `src/`)

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `motor.test.ts` | 16 | Niveles y textos: DECIDIR a 2 días, a 4 días con ≥ 80 %, INFO con 70 % o a 5 días, ámbar en INFO, el más restrictivo con poda y fitosanitarios. Casos sin alerta: verde, 6 días, orientativo, sin previsión, hechas y canceladas. Deduplicación: recalcular 3 veces, empeora y vuelve a avisar, mejora en silencio, escalón INFO → DECIDIR con el mismo id, mejora a verde única y su caducidad, descartes, movida, cancelada y pasada. AEMET: naranja, amarillo que sube a naranja con el mismo id, desaparición, más de 3 días. Orden e insignia. |
| `huecos.test.ts` | 11 | `esHuecoLibre` con margen de 30 min y sus bordes. Sin previsión: 3 días con la hora original. Con previsión: verde primero, nunca rojo, orientativos detrás. Días llenos y horas que chocan. Días preferidos. Hora razonable. |
| `whatsapp.test.ts` | 13 | Plantillas exactas de §13.1 con cada causa. Codificación del enlace (comas, «¿», &, #, + y saltos). Chat sin texto. 7 teléfonos no válidos dan `null`. |
| `aemet.test.ts` | 5 | Polígono, días que cubre el aviso, fenómenos que cuentan e ignorados, el nivel más alto, proveedor simulado y que no hay proveedor real. |
| `operaciones.test.ts` | 7 | Con IndexedDB: se guarda en `ajustes` con trazabilidad y sin duplicar; en la app real sin proveedor no salen alertas; un aviso AEMET simulado vía `prepararClima` da su alerta. Mantener + recalcular + deshacer. Colaborador sin permiso. Mover con motivo clima + recalcular + deshacer (visita y alerta como estaban). Alerta inexistente. |

PRUEBA: node node_modules/vitest/vitest.mjs run src/dominio/alertas
PRUEBA: node node_modules/typescript/bin/tsc -p .
PRUEBA: node scripts/verificar.mjs

**Resultado real** (2026-11-07, sobre el árbol final, después del último cambio):
- `vitest run src/dominio/alertas`: código 0, 5 archivos y 52 pruebas, en 10 s.
- `tsc -p .`: código 0.
- `node scripts/verificar.mjs`: código 0, en 57 s. Incluye:
  - tipos;
  - suite de `src/`: 33 archivos y 367 pruebas, incluidas mis 52;
  - `tests/agenda-clima` (37), `tests/clientes-ubicacion` (29) y `tests/clima` (42);
  - build y PWA.

Los logs están en `.temp/a/` (`final-alertas.log`, `final-tsc.log` y `final-verificar.log`). Otros frentes estaban editando `src/clima` y `src/agenda/clima` a la vez; estos resultados son del árbol en el momento de correrlos.

## Pendiente o fuera de este frente

- **Pantalla Alertas, campana, mensaje editable y abrir WhatsApp**, y las pruebas de aceptación de los criterios 17 y 19 a 23: frente B.
- **Fuera de alcance**: el cálculo en servidor cada 5 minutos, el resumen diario y los push reales, las horas de silencio, AEMET real con asignación de zonas por polígonos oficiales y Open-Meteo real.
- **Alertas no clima** (furgoneta, material, cobros…): otras olas. El catálogo y los almacenes están pensados para crecer.
- **Riesgo fuera de mi carpeta, no lo toqué**: en la app instalada, el clima simulado de `src/clima` se puede activar a mano con `localStorage fergo.clima.simulado = 1`. Si alguien lo activa, el motor generaría alertas con tiempo inventado. El código de este frente no lo activa.

DECISIÓN: Al proponer otro día para una visita, ¿qué va antes cuando no hay días con buen tiempo? | Días «Sin previsión» antes que días «Con cuidado» (hoy la app no tiene previsión) | Días «Con cuidado» antes que «Sin previsión» (como dice la especificación)

RESUMEN: Hay un motor que avisa cuando el tiempo amenaza una visita: aviso suave a 5 días y propuesta de decidir a 2 días, avisos oficiales simulados y aviso cuando el tiempo mejora. Nunca repite un aviso y respeta «Mantener la visita». También propone 3 días y horas libres para moverla y arma el mensaje y el enlace de WhatsApp sin enviar nada. Las 52 pruebas nuevas y toda la suite están en verde.

ESTADO: Motor de alertas de clima listo para integrar
