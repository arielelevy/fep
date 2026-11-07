# Ola 8 · Encargo B · Plantillas y proveedores en Ajustes y alertas de preparación

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Ola 8, «Preparar trabajo: furgoneta, material y ropa» (ficha `fa4a9e72e841-ola-7-ficha.md`). Feature «Plantillas, proveedores y alertas de preparación».

Antes de empezar leí el contrato del encargo A (`src/features/preparar/CONTRATO.md`). Uso sus claves, sus tipos y sus funciones públicas sin cambiar sus archivos.

**Encargo formal (intento ecfce119…, 2026-11-07 13:23).** Llegó después de construir. Lo contrasté punto por punto:
- Leí el informe de A (`fa4a9e72e841-ola-7-a.md`, «Preparar trabajo listo para integrar»). A ya conectó «Añadir siempre para [tipo]» con mi función y no quedan pendientes suyos conmigo.
- Corregí lo único que no cumplía: «cada alerta lleva una acción directa que resuelve sin navegar». «Ya la reservé» y «Me descontaron» ahora se resuelven en Alertas.
- Tres puntos del encargo no coinciden con la especificación. Manda la especificación, y los dejo como dudas y decisiones (ver «Dudas frente al encargo»).

## Decisión de Ariel (2026-11-07)

- **Maqueta (H7)**: Preparar trabajo y la sección «Preparar trabajos» de Alertas se construyen según §10.7, §10.8 y §10.10, con el estilo de las pantallas ya maquetadas. Se ajustan cuando haya maqueta.
- El logro «coincide con la maqueta» queda **aceptado sin maqueta por decisión de Ariel (2026-11-07)**.
- Las subpantallas de Ajustes siguen H8: «Construir con el estilo de la maqueta».
- **Recogida y devolución de la furgoneta en horas de silencio** (22:00 a 08:00): el aviso sale **a su hora**. Para esos dos avisos no rigen las horas de silencio. Cambiado y probado.
- **Día ya preparado**: su tarjeta **se quita** de Alertas y la campana deja de contarla. Cambiado y probado.

## Lo hecho

### Ajustes › Plantillas de material (`src/features/ajustes/plantillas/`, §10.10.3, §8.12)

- **Tipos de trabajo**: uno por fila, con el número de artículos. Se abren en su sitio, sin otro nivel de navegación.
- **Edición**: cada artículo tiene «Quitar» y hay un campo para añadir.
  - Los repetidos se avisan («Ya está en la lista»), sin distinguir mayúsculas.
  - «Volver a las plantillas de siempre» restaura la plantilla de la especificación.
- **Punto de partida**: lo que fija §8.12, sin inventar artículos. Solo hay plantilla para `setos_poda`.
- **Dónde se guarda**: clave `plantillas_material` de `ajustes`, con la forma que lee A (`leerPlantillas()`). Lo que se añade aquí aparece en el bloque Material de Preparar trabajo (probado).
- **Para A**: `anadirArticuloPlantilla(tipo, nombre)` sirve para «Añadir siempre para [tipo]» (§10.8.2). A ya lo conectó.

### Ajustes › Plantilla de ropa (§10.10.4, §8.12)

- **Lista**: cada prenda dice cómo se cuenta: «Por persona», «Por persona, en pares» o «Una para todo el equipo».
- **Editar y añadir**: hoja inferior con nombre, plural (se propone solo y se puede corregir), «Una para todo el equipo» y «Se cuenta por pares».
- **Quitar**: siempre queda al menos una prenda.
- **Dónde se guarda**: clave `plantilla_ropa`. Preparar trabajo multiplica por las personas del día.

### Ajustes › Proveedores de alquiler (`src/features/ajustes/proveedores/`, §10.10.6, §8.14)

- **Tarjetas**: nombre, chip «Habitual», teléfono, dirección, precio por día y fianza habitual. Botones «Llamar», «Cambiar», «Hacer habitual» y «Quitar».
- **Habitual**: solo hay uno y el primero lo es. Se preselecciona en «Ya la reservé» de Preparar trabajo y da el botón «Llamar a …» (probado).
- **Validación**:
  - el teléfono se guarda en E.164;
  - importes en céntimos enteros;
  - no se repiten nombres.
- **Borrado lógico**: el proveedor quitado sale de `proveedores_alquiler`, porque A lee esa lista tal cual, y se conserva con `eliminado_en` en `proveedores_alquiler_borrados`.
- **Aviso para alquilar** (§10.10.5): 3, 4 o 5 días; por defecto, 4. Lo usa FURGO_RESERVAR.

### Alertas de preparación (`src/features/alertas/preparacion/`, §12.2)

- **Motor**: función pura `calcularAlertasPreparacion`. Calcula FURGO_RESERVAR, FURGO_RECOGER, FURGO_DEVOLVER, MATERIAL_REVISAR, COMPRA_RECORDATORIO y ROPA_PREPARAR, con nivel, canal, clave de aviso y escalones. Las reglas están en su `CONTRATO.md`.
- **Planificador** (`planificador.ts`): decide qué avisos tocan y una sola vez por clave.
  - Respeta las horas de silencio (22:00 a 08:00), salvo el recordatorio de compra (lo programa Felipe) y la recogida y la devolución de la furgoneta (salen a su hora, decisión de Ariel).
  - Da las líneas del resumen de las 21:00.
  - No envía nada: el proceso del servidor no existe todavía (ver «Pendiente»).
- **Estado**: lo ya avisado y lo pospuesto, en la clave `alertas_preparacion`.

### Pantalla Alertas, sección «PREPARAR TRABAJOS» (§10.7)

- **Alquiler pendiente** (franja roja): «ALQUILA LA FURGONETA · EN 4 DÍAS», «Miércoles 11 · Sra. Morales» y «Plantación. Aún no la tienes reservada.».
  - «Ya la reservé» abre aquí mismo el formulario de reserva (§10.7 → §10.8.1), con los mismos campos y valores por defecto que el de Preparar trabajo. Guarda con `guardarReserva` de A (`HojaReservaAlerta.tsx`).
  - Si el proveedor habitual tiene teléfono, aparece «Llamar a …».
- **Recoger la furgoneta** (franja ámbar): «¿Ya recogiste la furgoneta? Registra pago y fianza.». **«Registrar los dos»** crea, con un solo botón, el gasto de alquiler imputado al cliente y la fianza entregada (`registrarRecogida` de A).
- **Devolver la furgoneta**: «¿Te devolvieron la fianza de 150 €?».
  - «Entera» registra la devolución.
  - «Me descontaron» pide en la misma tarjeta cuánto devolvieron. La diferencia queda como gasto «Descuento de fianza» (§9.6.3).
  - «Aún no» la aparta hasta mañana a las 10:00.
- **Compra**: «Compra para el miércoles: gasolina de mezcla y sacos de restos.».
  - «Ya lo compré» pasa a «Comprado» lo que estaba en «Comprar».
  - «Posponer 2 h» mueve el recordatorio.
- **Tarjeta del día** (franja verde): «EN 3 DÍAS · 1 DE 3 LISTO», el título y chips («Furgo reservada» o «Reservar furgo», «Comprar 2 cosas» o «Revisar material», «Ropa para 3»). Al tocarla se abre Preparar trabajo.
  - Aparece desde 4 días antes (§10.8.4).
  - Cuando el día ya está todo preparado, se quita (decisión de Ariel).
  - Al volver de Preparar trabajo, «‹ Alertas» regresa a Alertas.
- **Ropa de mañana sin tarjeta propia** (abono normal): una fila con «Ver lista».
- **Comportamiento común**:
  - Toda acción deja «… · Deshacer» durante 8 s.
  - Pablo ve la sección sin botones de registro.
  - «Todo en orden» solo aparece si tampoco hay nada de preparación.
- **Campana** (`CampanaAlertas`): suma las alertas de preparación con acción (alquilar, recoger, devolver y comprar).

### Archivos compartidos que toqué (fuera de mis carpetas, cambios mínimos)

- `src/App.tsx`:
  - rutas `{ ajuste: 'material' | 'ropa' | 'proveedores' }` y filas en Ajustes;
  - `onPreparar` en Alertas;
  - en la ruta de A, `{ preparar, desde: 'alertas' }`, solo para que «‹ Alertas» vuelva a Alertas.
- `src/pantallas/alertas/Alertas.tsx`: prop `onPreparar` opcional, la sección y la condición del vacío.
- `src/componentes/alertas/CampanaAlertas.tsx`: suma de la insignia.

No toqué ningún archivo de `src/features/preparar/` ni de `tests/preparar/`.

## Pruebas

- `tests/preparacion/criterios.test.tsx`: criterios 24 a 27, con 12 pruebas. El 24 recorre de punta a punta «Ya la reservé» desde Alertas: la reserva queda guardada y la tarjeta pasa a «Furgo reservada».
- `tests/preparacion/motor.test.tsx`: 13 pruebas. Una es el descuento de fianza desde Alertas (120 € devueltos y gasto de 30 €) y 3 para las decisiones de Ariel (devolución en horas de silencio, los demás avisos inmediatos siguen esperando, tarjeta que se quita y campana a 0).
- `tests/preparacion/ajustes.test.tsx`: 11 pruebas.
- Supuestos de las pruebas: `tests/preparacion/SUPUESTOS.md`.

Resultados (2026-11-07):

- **tsc del proyecto y de `tests/preparacion`**: sin errores.
- **vitest de `tests/preparacion`**: 36 de 36 tras el encargo formal, con 5 corridas seguidas sin fallos.
- **Tras las decisiones de Ariel**: 35 de 35.
- **Antes de las decisiones**: 32 de 32. Lo corrí 10 veces seguidas, sin fallos, después de corregir dos carreras de las propias pruebas: escrituras que acababan después de la prueba y un botón que aún estaba desactivado.
- **`node scripts/verificar.mjs`**: «OK: verificación completa». Incluye tsc, los archivos de `src`, todas las carpetas `tests/*/` (también `tests/preparar` de A, con 12 de 12), el build y la PWA. Última corrida (tras el encargo formal): código 0 en 95 s, con 380 pruebas de `src` y `tests/preparacion` 36 de 36.

PRUEBA: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
PRUEBA: node node_modules/typescript/bin/tsc -p tests/preparacion
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/preparacion/vitest.config.ts
PRUEBA: node scripts/verificar.mjs

La verificación completa tarda entre 92 y 105 s en esta máquina (medido el 2026-11-07).

## Dudas frente al encargo (manda la especificación)

1. **Ropa «por tipo de trabajo»**: el encargo pide plantillas de ropa por tipo de trabajo. §8.12 define una sola plantilla de ropa por persona, y §10.8.3 la multiplica por las personas del día. Construí lo de la especificación.
2. **Proveedores «dónde comprar el material»**: el encargo los nombra como ejemplo. §8.14 y §10.10.6 solo definen proveedores de alquiler. Construí solo esos.
3. **«No levantes un segundo mecanismo de alertas»**:
   - Las alertas de preparación se muestran en la misma pantalla Alertas, con la misma campana, las mismas tarjetas y el mismo «Deshacer».
   - El cálculo es aparte (`src/features/alertas/preparacion`) porque el motor de la ola 7 (`src/dominio/alertas`) está hecho para el clima: semáforo, visita y causa. Además, no es de mis carpetas.
   - Lo propio es solo el registro de lo avisado y lo pospuesto (clave `alertas_preparacion`).
4. **MATERIAL**: el encargo dice «ítems en Comprar sin resolver»; §12.2 dice MATERIAL_REVISAR, «material sin revisar». Están las dos cosas: MATERIAL_REVISAR (sin revisar, 3 días antes, en el resumen) y COMPRA_RECORDATORIO (lo que está en «Comprar», a la hora elegida), más el chip «Comprar N cosas» en la tarjeta del día.
5. **«Ligadas al clima»**: §12.2 no liga estas alertas al clima, y el clima sigue en «Sin previsión». No las ligué.

## Pendiente

- **Avisos push reales y resumen de las 21:00 en el servidor** (`supabase/functions/alertas-preparacion/`): no los creé. No hay servidor ni cuentas, y crearlos necesita autorización. La regla está lista y probada en `planificador.ts`.
- **Sincronización con el servidor**: todo se guarda en el móvil, con UUID, borrado lógico y `creado_por`/`modificado_por`, igual que el resto de la app. Aún no hay servidor con el que sincronizar.
- **«Revisar» y «Ver lista»** (§12.2): llevan a Preparar trabajo, que es donde se revisa el material y la ropa.
- **Ajuste a la maqueta** de Preparar trabajo, Alertas y Ajustes, cuando exista.

Las dos preguntas anteriores ya las decidió Ariel (ver arriba). Por las dudas frente al encargo quedan estas:

DECISIÓN: ¿La ropa sigue con una sola plantilla por persona, como dice la especificación, o pasa a una plantilla por tipo de trabajo? | Una sola plantilla por persona (especificación, lo construido) | Plantilla de ropa por tipo de trabajo
DECISIÓN: ¿Además de los proveedores de alquiler, se guardan proveedores de material (dónde comprar)? | Solo proveedores de alquiler (especificación, lo construido) | Añadir también proveedores de material
DECISIÓN: ¿El cálculo de las alertas de preparación se une al motor de alertas de clima? | Dejarlo como está: misma pantalla, campana y tarjetas, con cálculo propio | Unirlo al motor de clima en una ola corta

RESUMEN: Felipe puede editar en Ajustes las plantillas de material y ropa y sus proveedores de alquiler. En Alertas ve qué preparar cada día y le avisamos de alquilar, recoger y devolver la furgoneta (recogida y devolución a su hora, aunque sea de noche), de comprar el material y de preparar la ropa. Recogida y fianza se registran con un solo botón.

ESTADO: Plantillas, proveedores y alertas de preparación listo para integrar
