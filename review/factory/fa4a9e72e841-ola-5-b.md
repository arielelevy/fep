# Ola 6 · Frente B · Interfaz del clima y semáforo de visitas

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Ola «Clima y semáforo de visitas» (ficha `fa4a9e72e841-ola-5-ficha.md`).
Este frente hace la interfaz: Agenda, Hoy, Detalle de visita y la ubicación del cliente. Consume el motor del frente A (`src/clima`, sin tocarlo).

> Nota: este archivo tenía el informe del frente B de la ola anterior («Pruebas de visitas y abonos»). Ese texto sigue en el historial de Git. Lo reemplacé porque el encargo pide esta ruta.

## Lo hecho

### Agenda (§10.5, maqueta p. 5)

- **Franja de 14 días** (`src/agenda/clima/FranjaClima.tsx`):
  - cada día lleva icono del tiempo, máxima y probabilidad de lluvia;
  - usa la ubicación de referencia del negocio (§11.1);
  - el tiempo llega a los lectores de pantalla por `aria-describedby` («Sol, máxima 18°, lluvia 0 %»).
- **Días 8 a 14** mantienen el estilo atenuado y el separador «ORIENTATIVO».
  - El separador lleva un botón «i» de 44 pt que muestra «Más allá de una semana la previsión es poco fiable. Úsala para planificar, no para decidir.»
  - La nota también aparece sola al elegir un día del 8 al 14.
- **Días con alguna visita «Mejor mover»** (de hoy a hoy + 6) llevan el contorno interior rojo de 2 pt.
- **Pie «Actualizado hace N h»** cuando la previsión tiene más de 3 h (§14.6).
- **Línea de semáforo** en cada tarjeta programada:
  - punto de color, estado en palabras y detalle, por ejemplo «Mejor mover · Lluvia toda la mañana»;
  - consejo en texto secundario («Consejo: …»);
  - días 8 a 14: solo «Previsión orientativa»;
  - visitas hechas y canceladas: sin semáforo.

### Hoy (§10.1.1.4)

- Las visitas programadas llevan la misma línea de semáforo.
- El botón «Hecho» no cambia.

### Detalle de visita (§10.6.3)

- **«Tiempo de la visita»** (`SemaforoDetalle.tsx`):
  - semáforo grande con estado y motivo;
  - temperatura, lluvia (% y mm) y viento (con rachas) en la franja horaria de la visita;
  - consejo;
  - «Actualizado hoy a las HH:MM», o «Actualizado hace N h» si tiene más de 3 h;
  - «Datos de prueba» si viene del proveedor simulado.
- **«Sin previsión»**: neutro, con su motivo («Falta la dirección del cliente», «Sin conexión»…), sin datos ni consejo.
- **Acciones**: Hecho, Mover, Editar, Llamar, Cómo llegar y WhatsApp siguen igual. «Cómo llegar» ya abría Google Maps en Android y Apple Maps en iPhone (`src/lib/mapas.ts`, sin cambios).

### Ubicación del cliente (§10.4.3, §13.3)

- **Geocodificación tras una interfaz** (`src/geocodificacion/`):
  - `Geocodificador` y `configurarGeocodificador(...)` para enchufar el proveedor real;
  - proveedor simulado determinista: centro del municipio conocido, desplazado hasta ±0,012° según la calle, marcado como aproximado y de prueba;
  - `geocodificar()` nunca lanza: devuelve encontrada, no encontrada, sin dirección, sin conexión, sin servicio o error, cada uno con texto neutro;
  - espera máxima de 8 s.
- **Mapa con chincheta** (`src/clientes/ubicacion/MapaChincheta.tsx`):
  - plano esquemático con los tokens, sin teselas ni red;
  - la chincheta (48 × 48) se arrastra con el dedo o se mueve con las flechas (≈ 20 m por paso);
  - muestra las coordenadas en formato es-ES.
- **Formulario Nuevo / Editar cliente** (sección «Ubicación»):
  - «Se usa para el tiempo de cada visita.»;
  - al escribir la dirección se busca (con 600 ms de espera) y aparece la chincheta, que se puede corregir;
  - si la dirección no cambia, se conservan las coordenadas y no se vuelve a buscar;
  - **sin conexión no bloquea**: «Sin conexión. Guardo el cliente y buscamos la ubicación al volver.» El cliente se guarda sin coordenadas y se reintenta al volver la conexión con el formulario abierto.
- **Ficha de cliente** (sección «Ubicación»):
  - mapa con la chincheta; al corregirla se guarda al momento con «Ubicación corregida · Deshacer» (§5.4.1);
  - con dirección y sin coordenadas: «Buscar en el mapa» (desactivado sin conexión);
  - sin dirección: texto neutro, porque el botón «Añadir dirección» ya está en las acciones rápidas;
  - Pablo (colaborador) ve la chincheta pero no la mueve.

### Accesibilidad (§5.6)

- **Nunca solo color**: el estado siempre va en palabras y el punto es decorativo (`aria-hidden`). Gris y orientativo llevan contorno, no relleno.
- **Contraste ≥ 4,5:1** comprobado en las pruebas para cada par de texto y fondo nuevo.
- **Zonas táctiles nuevas**: «i» de 44 × 44 y chincheta de 48 × 48.
- **Texto en `rem`** (aguanta el 130 %) y nunca por debajo de 12 pt.
- **Movimiento**: sin animaciones ni transiciones propias. El esqueleto de carga usa el de la app, que ya respeta «Reducir movimiento».

### Tarea añadida por la coordinadora: `scripts/verificar.mjs`

- Además de lo que ya hacía, recorre cada carpeta `tests/*/`:
  - corre `tsc -p tests/<carpeta>` si tiene `tsconfig.json`;
  - corre vitest con su `vitest.config.ts`.
- Lee el informe JSON de vitest (en una carpeta temporal del sistema que se borra al terminar) y falla si alguna prueba falla o si una carpeta no tiene pruebas.
- Imprime el recuento: `tests/clima: 40 pruebas`, `tests/agenda-clima: 36 pruebas`, `tests/clientes-ubicacion: 26 pruebas`.
- La configuración de `src/` (`vite.config.ts`) no cambió.
- **Prueba negativa**: con una prueba que falla a propósito en `tests/agenda-clima/`, `verificar.mjs` salió con código 1 («✗ pruebas de tests/agenda-clima (vitest) falló»). La prueba temporal se borró.

## Archivos

**Míos (con dueño):**
- `src/agenda/clima/`: `semaforoVisita.ts`, `LineaSemaforo.tsx`, `SemaforoDetalle.tsx`, `FranjaClima.tsx`, `clima.css`.
- `src/clientes/ubicacion/`: `MapaChincheta.tsx`, `UbicacionCliente.tsx`, `ubicacion.css`.
- `src/geocodificacion/index.ts`.
- `tests/agenda-clima/` y `tests/clientes-ubicacion/`: pruebas, `vitest.config.ts` y `tsconfig.json`.
- `.temp/b/`: logs.

**Fuera de mi lista, tocados para integrar** (sin estos cambios la interfaz no se ve en las pantallas; son mínimos y ningún otro frente de esta ola es dueño de esos archivos):
- `src/screens/Agenda.tsx`: contenido del tiempo en cada día, «i» y nota, contorno rojo y línea de semáforo en la tarjeta. Sustituye el texto fijo «Sin previsión».
- `src/screens/Hoy.tsx`: línea de semáforo en las visitas programadas.
- `src/screens/VisitaDetalle.tsx`: el bloque fijo «Sin previsión / El tiempo llega en la próxima versión» pasa a `<SemaforoDetalle>`.
- `src/screens/ClienteForm.tsx`: la sección «Ubicación» usa `<UbicacionFormulario>` y las coordenadas salen de ahí. Antes se borraban si cambiaba la dirección.
- `src/screens/ClienteFicha.tsx`: sección `<UbicacionFicha>` tras las notas.
- `src/screens/agenda.test.tsx`: dos aserciones esperaban los textos fijos de antes. Ahora comprueban «Previsión orientativa» y un semáforo real con «Datos de prueba».
- `scripts/verificar.mjs`: la tarea añadida por la coordinadora.

No toqué `src/clima/`, `tests/clima/` ni `.temp/a/`. No usé Git ni levanté servidores.

## Pruebas

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `tests/agenda-clima/semaforoVisita.test.tsx` | 28 | Texto de la línea en cada estado (verde, ámbar, rojo, gris, orientativo y cargando), punto decorativo, consejo, sin «!». Semáforo grande con datos, consejo y hora; «Sin previsión» neutro; orientativo. Hueco libre (duración + 30 min), datos de la franja, hora de actualización, etiqueta accesible del día. Contraste ≥ 4,5:1 de 9 pares de tokens, `rem` ≥ 12 pt, zonas táctiles ≥ 44, sin animaciones. |
| `tests/agenda-clima/pantallas.test.tsx` | 8 | Agenda, Hoy y Detalle con el motor y el proveedor simulado de A (escenarios deterministas). **Criterio 14**: césped con 80 % y 3 mm/h da «Mejor mover». **15**: piscina con 1 mm/h da «Se puede ir». **16**: poda y fitosanitarios con 25 km/h dan rojo. **17**: aviso naranja da rojo (solo el semáforo; la alerta es de otra ola). Ámbar «Con cuidado», gris sin dirección, contorno rojo del día. **18**: los días 8 a 14 se ven atenuados, con «ORIENTATIVO» y el «i», y su visita muestra solo «Previsión orientativa». Franja sin servicio. Hoy con la línea y «Hecho». Detalle con datos, consejo, «Actualizado hoy a las 10:00 · Datos de prueba», acciones sin cambios, y «Sin previsión» sin dirección o con el servicio caído. |
| `tests/clientes-ubicacion/geocodificacion.test.ts` | 12 | Simulado determinista y cercano al municipio, desconocido cae en Madrid, «123» no se encuentra. Cada estado de `geocodificar()`, espera máxima, enchufe de un proveedor real, `claveDireccion`, y simulado solo en desarrollo y pruebas. |
| `tests/clientes-ubicacion/ubicacion.test.tsx` | 14 | Chincheta: conversión entre plano y coordenadas, flechas, arrastre, sólo lectura. Formulario: dirección, chincheta, corrección y guardado; sin conexión guarda sin coordenadas; no encontrada; editar sin cambiar la dirección conserva las coordenadas y no vuelve a buscar; cambiar el municipio busca la nueva. Ficha: corregir y deshacer, «Buscar en el mapa», sin conexión, sin dirección, colaborador. |

PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/agenda-clima/vitest.config.ts
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/clientes-ubicacion/vitest.config.ts
PRUEBA: node scripts/verificar.mjs

**Resultado real** (2026-11-07, sobre el árbol final de este frente, después del último cambio de código):
- `tests/agenda-clima`: código 0, 2 archivos y 36 pruebas.
- `tests/clientes-ubicacion`: código 0, 2 archivos y 26 pruebas.
- `node scripts/verificar.mjs`: código 0, en 38 s. Incluye:
  - tipos de la app;
  - suite de `src/`: 28 archivos y 315 pruebas, todas en verde (incluidas `agenda.test.tsx` y `clientes.test.tsx`);
  - `tsc` y vitest de `tests/agenda-clima` (36), `tests/clientes-ubicacion` (26) y `tests/clima` (40 de A);
  - build y PWA.
- Las tres líneas `PRUEBA:` tardan unos 50 s en total.

Logs en `.temp/b/` (`final-ac.log`, `final-cu.log`, `final-verificar.log` y `verificar-negativo.log`).

## Pendiente o fuera de este frente

- Proveedores reales de geocodificación (§13.3) y de clima (frente A). Enchufarlos o crear cuentas necesita confirmación.
- Mover visita (H4, maquetar antes), Alertas, push, Preparar trabajo y WhatsApp: otras olas.
- **Guardado rápido**: si se guarda el cliente menos de 600 ms después de escribir la dirección, queda sin coordenadas. La ficha ofrece «Buscar en el mapa». No lo cambié para no alterar el guardado inmediato de las pruebas existentes.
- **Reintento sin conexión**: un cliente guardado sin conexión no busca su ubicación solo cuando vuelve la red. Se hace desde la ficha («Buscar en el mapa»). La geocodificación automática en segundo plano sería de la ola de sincronización.
- **«Cómo llegar» con coordenadas aproximadas**: `src/lib/mapas.ts` prefiere las coordenadas a la dirección. Con el proveedor simulado (desarrollo y pruebas) puede llevar a un punto a ~1 km. En producción no pasa con la opción recomendada abajo.
- **Verificación manual en el móvil** (tamaño de texto al 130 %, VoiceOver o TalkBack, arrastre con el dedo): no la hice. No levanté servidores y en jsdom no hay maquetación. Lo cubierto son guardas estáticas de CSS y pruebas de DOM.

DECISIÓN: Mientras no haya un servicio real de mapas, ¿qué hace la app instalada en el móvil de Felipe al escribir la dirección de un cliente? | Guardar el cliente sin ubicación y avisar «El mapa no está disponible ahora» (no inventar puntos; «Cómo llegar» usa la dirección) | Usar la ubicación aproximada de prueba (el tiempo funciona, pero «Cómo llegar» puede llevar a ~1 km)

RESUMEN: La Agenda muestra el tiempo de los próximos 14 días, con los días 8 a 14 marcados como orientativos. Cada visita, en Agenda, Hoy y su detalle, dice con palabras si «se puede ir», va «con cuidado» o es «mejor moverla», con consejo y hora de actualización. Los clientes tienen un mapa con chincheta para guardar su ubicación, aunque no haya conexión. La verificación general corre ahora también las pruebas del clima (40) y de este frente (62), todas en verde.

ESTADO: Interfaz del clima y semáforo de visitas listo para integrar
