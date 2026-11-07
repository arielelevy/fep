# Ola 7 · Frente B · Pantalla Alertas, mover visita por WhatsApp y pruebas de alertas de clima

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Ola «Alertas de clima y mover visita por WhatsApp» (ficha `fa4a9e72e841-ola-6-ficha.md`).
Antes de empezar leí el informe del frente A (`fa4a9e72e841-ola-6-a.md`, «listo para integrar») y su `CONTRATO.md`. Uso el motor de `src/dominio/alertas` sin cambiarlo.

## Decisiones de Ariel (2026-11-07)

1. **Maqueta**: se acepta la pantalla Alertas y Mover visita como está, construida según §10.7 con el estilo de la maqueta. Cuando haya maqueta, se ajusta en una ola corta. El enlace de la maqueta devuelve «artifact not found» desde esta cuenta, y el PDF no trae «6. Alertas».
2. **Semáforo rojo y aviso oficial a la vez**: una sola tarjeta con los dos motivos, y la campana cuenta 1. Hecho, con prueba.
3. **«Otro» día al mover**: calendario con el semáforo de cada día. Antes era un selector de fecha simple; ahora es un calendario, con prueba.

## Lo hecho

### Pantalla Alertas (`src/pantallas/alertas/Alertas.tsx`, §10.7)

- **Cabecera**: «‹ Agenda» (o la pestaña de origen), «Alertas» y «Tiempo y preparación de los próximos días».
- **PARA DECIDIR**:
  - tarjeta con franja de 4 pt;
  - clima que pide decisión: fondo rojo suave y franja roja; aviso oficial AEMET: fondo y franja ámbar;
  - el nivel siempre va también en palabras: «MEJOR MOVER · EN 2 DÍAS», «AVISO AEMET · EN 2 DÍAS» y el dato clave («70% lluvia», «Naranja por lluvia»).
- **PARA TENER EN CUENTA**: filas con punto de color, estado en palabras y botón «Ver» (abre la visita) o «Vale» (en las mejoras).
- **Secciones vacías**: no se muestran. «Preparar trabajos» y «Cobros y fianzas» llegan con sus olas.
- **Vacío**: «Todo en orden. No hay nada que decidir esta semana.»
- **Pie**: campana y «Un solo aviso al día, a las 21:00, con todo junto.»

### Mover la visita (`src/componentes/alertas/TarjetaDecidir.tsx`)

- **¿A qué día?**: radio con los 3 días que propone el motor. El primero va como «Sugerido», con su tiempo. Al final, «Otro».
- **«Otro»**: abre un **calendario** de mañana a 13 días vista.
  - Cada día muestra el semáforo de la visita ese día (`evaluarVisita` con los mismos tipos de trabajo, hora y duración): punto de color y estado en palabras («Se puede ir», «Con cuidado», «Mejor mover», «Sin previsión», «Previsión orientativa»).
  - No se pueden elegir el día de la visita («Día de la visita») ni los días sin hueco libre. Los días en rojo siguen mostrando «Mejor mover».
- **¿A qué hora?**: horas libres de ese día que da el motor (la original primero) y «Otra», con selector validado con `esHuecoLibre`. Lleva el texto «Solo se ofrecen huecos libres en tu agenda.»
- **Mensaje**: burbuja #DCF8C6 editable. Se reescribe al cambiar día u hora. Si se edita a mano, se mantiene y aparece «Mensaje editado · Restaurar».
- **«Mover y avisar por WhatsApp Business»**:
  1. mueve la visita (`moverVisitaPorAlerta`: motivo clima y `reprogramada_desde`) y resuelve la alerta;
  2. abre `https://wa.me/<teléfono>?text=<mensaje>`. No se envía nada ni se usa ninguna API;
  3. muestra la barra «Visita movida al viernes 13, 09:00 · Deshacer» durante 8 s.
- **Debajo**: «Mover sin avisar» y «Mantener la visita» (descarta con la clave del motor y muestra «Mantienes la visita del jueves 12 · Deshacer»).
- **Cliente sin teléfono**: el botón pasa a «Mover visita» y aparece «Añade su teléfono para avisarle.»
- **Pablo (colaborador)**: ve las alertas sin botones de decisión.
- **Una tarjeta, dos motivos**: si una visita tiene a la vez la alerta del semáforo (CLIMA_DECIDIR) y la del aviso oficial (CLIMA_AEMET), se ve una sola tarjeta.
  - Manda el aviso, y debajo va el motivo de la previsión con su estado («Mejor mover: Lluvia…»).
  - El texto del motor ya nombra el aviso en las dos alertas. Por eso el segundo motivo se calcula con el semáforo de la visita sin avisos.
  - Mover o mantener vale para las dos alertas.

### Campana con insignia (`src/componentes/alertas/CampanaAlertas.tsx`)

- **Insignia**: círculo rojo con el número de decisiones pendientes, una por visita. Las informativas no cuentan y con 0 desaparece.
- **Accesibilidad**: el nombre accesible sigue siendo «Alertas» y el número se lee como descripción («1 para decidir»).
- **Dónde está**: en Hoy y en Agenda.

### Estado (`src/componentes/alertas/useAlertasClima.ts`)

- **Lectura**: lee el estado guardado por el motor (tabla `ajustes`, clave `alertas_clima`) de forma reactiva.
- **Recálculo**: recalcula al abrir y cuando cambian las visitas o los clientes.
- **Cola**: recalcular, mover, mantener y sus «Deshacer» pasan por una cola, para que la campana y la pantalla no pisen el estado.
- **App instalada**: sin proveedor del tiempo todo queda «Sin previsión» y no salen alertas. El clima simulado solo lo enchufan las pruebas.

### Accesibilidad y movimiento

- Zonas táctiles de 44 pt como mínimo (los días del calendario, 52 pt) y botón principal de 56 pt.
- `aria-label` en la campana y en cada día del calendario («Sáb 14: Se puede ir»).
- Radios reales.
- Sin animaciones propias: respeta «Reducir movimiento».
- Sin emojis, sin «!» y sin mensajes de culpa.

### Archivos fuera de mis carpetas (cambios mínimos; los declaro)

- **`src/App.tsx`**: la ruta `alertas` usa la pantalla nueva. Es el registro mínimo de la ruta.
- **`src/screens/Hoy.tsx` y `src/screens/Agenda.tsx`**: el botón de la campana pasa a `<CampanaAlertas>` (3 líneas por archivo). Lo necesita el logro 3.
- **No toqué** `src/dominio/alertas/` (frente A), ni el esquema, ni la configuración compartida, ni Git.

## Logros

1. **La pantalla Alertas coincide con la maqueta**: aceptado sin maqueta por decisión de Ariel (2026-11-07). Tiene secciones, propuesta, calendario, mensaje editable y los dos botones.
2. **Mover y avisar actualiza la visita y arma el enlace wa.me; Mantener descarta sin duplicar**: sí, con pruebas.
3. **La campana muestra la insignia correcta**: sí, con pruebas.
4. **Pasan las pruebas de los criterios 17 y 19 a 23**: sí.

## Pruebas

En `tests/alertas/criterios.test.tsx`, con su `vitest.config.ts` y `tsconfig.json`. Son de punta a punta con datos simulados: clima y AEMET simulados → motor → pantalla y campana → base local. Supuestos: `tests/alertas/SUPUESTOS.md`.

| Criterio | Prueba |
|---|---|
| 17 | Aviso AEMET naranja en la zona: la visita queda en rojo, se genera CLIMA_AEMET y se ve una sola tarjeta ámbar. Con «Ver opciones» y mover, no queda ninguna alerta activa de esa visita. |
| 19 | En rojo a 5 días: sale en «Para tener en cuenta» y en el resumen de las 21:00 una sola vez. |
| 20 | Sigue en rojo a 2 días: pasa a «Para decidir» (misma alerta, sube de escalón) con 3 días + «Otro» y horas + «Otra». |
| 21 | Otro día y otra hora reescriben el mensaje. Editado a mano no se pisa; «Restaurar» vuelve al automático. |
| 22 | Mover y avisar: visita movida (motivo clima y `reprogramada_desde`), alerta resuelta, enlace `wa.me/34611566779` con el texto de la burbuja y Deshacer. Sin teléfono: «Mover visita», sin WhatsApp. |
| 23 | Mantener: descartada, no vuelve en 3 recálculos ni en el resumen. Con un aviso oficial nuevo sí avisa. Deshacer la devuelve. |
| Decisión 3 | Calendario: 13 días con color y estado en palabras, el día de la visita bloqueado, un día de lluvia en «Mejor mover» y los de más de 7 días «Previsión orientativa». Al elegir el sábado 14, las horas y el mensaje cambian. |
| Decisión 2 | Semáforo rojo y aviso a la vez: una tarjeta con «Aviso naranja por viento» y «Mejor mover: Lluvia…», y la campana marca 1. |
| Campana | 0 con solo informativas; 1 con una decisión, dicha en palabras; vuelve a 0 al mantener. |
| App real | Sin proveedor del tiempo: ninguna alerta, estado vacío y pie. |

PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/alertas/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run src/dominio/alertas
PRUEBA: node node_modules/typescript/bin/tsc -p .
PRUEBA: node node_modules/typescript/bin/tsc -p tests/alertas
PRUEBA: node scripts/verificar.mjs

**Resultado real** (2026-11-07, sobre el árbol final, después del último cambio):
- `tests/alertas`: código 0, 14 de 14.
- Motor de A (`src/dominio/alertas`): código 0, 52 de 52.
- `tsc -p .` y `tsc -p tests/alertas`: código 0.
- `verificar.mjs`: código 0. Incluye:
  - suite de `src/`: 367 de 367;
  - `tests/agenda-clima`: 37;
  - `tests/alertas`: 14;
  - `tests/clientes-ubicacion`: 29;
  - `tests/clima`: 42;
  - build y PWA.

Los logs están en `.temp/b/` (`final-alertas.log`, `final-motor.log`, `final-tsc.log`, `final-tsc-tests.log` y `final-verificar-ola7.log`).

Nota: el encargo citaba `vitest run tests/alertas`. Con `vite.config.ts`, que solo incluye `src/**`, ese comando no encuentra archivos. Por eso declaro la forma con `--config`, como las otras carpetas `tests/*/`.

## Pendiente

- **Revisión visual a 375 y 430 px**: no la hice. El navegador integrado no abre un servidor local levantado desde la sesión. Queda para la ola corta de ajuste a la maqueta.
- **Fuera de alcance**: el resumen de las 21:00 y los push reales (servidor), la banda de alerta de la Agenda (§10.5.3), las secciones «Preparar trabajos» y «Cobros y fianzas», y la acción «Pasar a las 09:00» del aviso AEMET (usa «Ver opciones» del motor).

RESUMEN: Ya está la pantalla Alertas. Felipe ve qué visitas conviene mover por el tiempo y elige día y hora libres: tres días propuestos o un calendario que muestra el tiempo de cada día. Revisa el mensaje y en un toque mueve la visita y abre WhatsApp Business con el texto, o la mantiene. La campana de Hoy y Agenda marca cuántas decisiones quedan. Todas las pruebas pasan.

ESTADO: Pantalla Alertas listo para integrar
