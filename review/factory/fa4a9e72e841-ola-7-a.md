# Ola 8 · Encargo A · Preparar trabajo: furgoneta, material y ropa

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Ola «Preparar trabajo: furgoneta, material y ropa» (ficha `fa4a9e72e841-ola-7-ficha.md`).

## Decisión de Ariel (2026-11-07)

- **Construir sin maqueta.** «Preparar trabajo» (H7, que en la ola 1 era «Maquetar antes») se construye ahora según §10.8, con el estilo de las pantallas ya maquetadas. Se ajusta cuando haya maqueta.
- **Logro «coincide con la maqueta»**: aceptado sin maqueta por decisión de Ariel.
- **Por qué hizo falta**: el enlace de la maqueta (`https://claude.ai/artifact/4wpLBYXnSPahaJNptqjSJE`) no se puede abrir desde esta cuenta, y el PDF de la ola 1 no trae «7. Preparar trabajo». El código cita «maqueta 7. Preparar trabajo» como referencia de la pantalla.

## Lo hecho (todo en `src/features/preparar/`)

### Pantalla `PrepararTrabajo.tsx` (§10.8)

- **Cabecera**: «‹» vuelve a la pantalla de origen. Debajo, «PREPARAR · EN 4 DÍAS» en verde (o «HOY», «MAÑANA»), el título «Miércoles 11 · Urb. El Olivar» (o «· 2 trabajos») y el detalle «Setos y poda y césped · 08:30 · Tú y 2 ayudantes».
- **Varias visitas**: se listan debajo y cada una abre su detalle.
- **Progreso**: «1 de 3 listo», con barra (`progressbar`) y leyenda en palabras. Solo cuentan los bloques que aplican.
- **Otros estados**: banda «Sin conexión», esqueleto mientras carga y vacío «Este día no tienes visitas.».

### Bloque Furgoneta (`BloqueFurgoneta.tsx`, §10.8.1)

- **Cuándo aparece**: solo si alguna visita necesita furgoneta.
- **Estados**, siempre en palabras: «Sin reservar» (ámbar), «Reservada» (lima suave), «Recogida» y «Devuelta».
- **«Ya la reservé»**: abre una hoja con proveedor, recogida (la tarde anterior a las 19:00), devolución (el día del trabajo a las 20:00), precio y fianza prevista.
  - Precarga el proveedor habitual si existe en Ajustes, y entonces también «Llamar a …».
  - Al guardar la reserva no se mueve dinero.
- **Registro doble**: «¿Ya recogiste la furgoneta?» → «Registrar los dos», con el medio de pago elegido. En una sola transacción se crean:
  - el gasto de alquiler, categoría «Alquiler de furgoneta», imputado a partes iguales a los clientes de las visitas (§9.5). Es un gasto por cliente y la suma cuadra al céntimo;
  - la fianza entregada, que va aparte: resta de caja, suma a «En fianzas» y no cuenta en «Ganado».
- **Devolución**: «Entera», «Me descontaron algo» (importe devuelto) o «Aún no». Usa `devolverFianza`, ya construida: el descuento va como gasto «Descuento de fianza» en «Alquiler de furgoneta».
- **También**: «Cambiar la reserva» y «Anular la reserva» (borrado lógico).

### Bloque Material (`BloqueMaterial.tsx`, §10.8.2)

- **Lista**: une las plantillas de los tipos de trabajo del día, sin repetir. Cada artículo tiene «Lo tengo» (lima suave) y «Comprar» (ámbar oscuro relleno). Tocar otra vez el botón activo lo deja sin revisar.
- **Añadir**: «+ Añadir otra cosa» añade un artículo a esta preparación. Debajo hay una casilla «Añadir siempre para [tipo]» por cada tipo de trabajo del día. Si se marca, el artículo también se guarda en la plantilla de ese tipo con `anadirArticuloPlantilla` (función del encargo B, src/features/ajustes/plantillas/datos.ts, que solo leí) y aparece en los próximos días con ese trabajo. Lo que ya estaba en la plantilla no se repite. «Deshacer» quita el artículo de la lista y de la plantilla.
- **Caja ámbar «Lista de compra»**:
  - «Recordarme» queda guardado. Por defecto es mañana a las 18:00, siempre antes del trabajo; si no cabe, dentro de 2 horas o la víspera a las 18:00.
  - Opciones rápidas: «Esta tarde», «Mañana 18:00», «Mañana 09:00», «Elegir» y «No recordarme».
- **Al comprar**: «Comprado» abre «¿Registrar el gasto?» con importe, categoría deducida del artículo (se puede cambiar) y pago. El gasto queda ligado al artículo.

### Bloque Ropa (`BloqueRopa.tsx`, §10.8.3)

- **Título**: «Ropa para N personas», con N = 1 + máximo de ayudantes del día. Debajo, «Te lo recuerdo el martes 10 a las 21:00».
- **Lista**: casillas en 2 columnas, con fila entera de 44 pt. Ejemplos: «Polos FERGO (3)», «Guantes (3 pares)» y «Agua y protector», que no se multiplica.
- **Personas**: la cantidad cambia sola si cambian los ayudantes de la visita.

### Datos y reglas

- **Dónde se guarda**: en la tabla `ajustes` existente (`preparaciones` y `reservas_vehiculo`), sin cambiar el esquema.
- **Trazabilidad**: UUID creado en el móvil, `creado_por`, `modificado_por`, `version` y borrado lógico.
- **Sin conexión**: funciona igual.
- **Deshacer 8 s**: en reservar, cambiar o anular la reserva, el registro doble, la devolución, añadir un artículo, el recordatorio, «Comprado» y el gasto. Marcar «Lo tengo», «Comprar» o una prenda se deshace tocando otra vez.
- **Pablo**: ve la preparación sin poder cambiarla. Las escrituras también lo comprueban.
- **Plantillas y proveedores** (`plantillas.ts`): son del encargo B y todavía no existen. Se leen de `ajustes` si B los guarda; si no, se usa lo que fija §8.12 sin inventar nada: material solo para setos y poda (el ejemplo de la especificación) y la plantilla de ropa por defecto.
- **Contrato para B**: `src/features/preparar/CONTRATO.md` (claves, tipos y funciones para las alertas FURGO, MATERIAL y ROPA).

### Accesibilidad

- Zonas táctiles de 44 pt como mínimo y botones principales de 56 pt.
- `aria-label` en los botones que solo tienen icono.
- Estados siempre en palabras; contraste de los tokens de §6.1.
- Sin animaciones propias.
- Textos cortos, sin regañar y sin jerga contable.

### Archivos fuera de mis carpetas (mínimos; los declaro)

- **`src/App.tsx`**: ruta `{ preparar: fecha }` hacia la pantalla.
- **`src/screens/VisitaDetalle.tsx`**: prop opcional `onPreparar` y el resumen «Preparación · Furgo · Material · Ropa · 1 de 3 listo» (§10.6.4) que abre la pantalla.
- **No toqué** las carpetas del encargo B, el esquema, la configuración ni Git.

## Pruebas

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `src/features/preparar/logica.test.ts` | 13 | Ropa por personas y cantidades; material sin duplicar, con estado guardado y extras, sin inventar; categoría deducida; recordatorio por defecto y opciones; reparto en céntimos; días de alquiler; estado del bloque; cabecera; progreso; cuándo hay preparación. |
| `tests/preparar/preparar.test.tsx` | 12 | Los 3 bloques y la cabecera (a). Registro doble: 2 gastos de 45 € a cada cliente y fianza de 150 €; en Hoy, «En fianzas» 150 €, «En caja» −240 € y «Ganado» −90 €; en Movimientos, «Pendiente de devolver»; Deshacer; devolución con descuento de 30 € (b). «Lo tengo» / «Comprar», recordatorio guardado y cambiado, «Comprado» → gasto en «Gasolina de mezcla» y añadir con Deshacer (c). «Añadir siempre para césped»: queda en la plantilla de césped, sale otro día con césped, no se repite lo que ya estaba y Deshacer lo quita. Ropa de 3 a 1 persona (d). Sin conexión y Pablo (e). Navegación Detalle de visita → Preparar trabajo. |

PRUEBA: node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
PRUEBA: node node_modules/typescript/bin/tsc -p tests/preparar
PRUEBA: node node_modules/vitest/vitest.mjs run src/features/preparar
PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/preparar/vitest.config.ts
PRUEBA: node scripts/verificar.mjs

**Resultado real** (2026-11-07, sobre el árbol final, todo con código 0):
- `tsc` del proyecto y de `tests/preparar`: sin errores.
- Lógica: 13 de 13.
- Pantalla: 12 de 12.
- `verificar.mjs`:
  - suite de `src/`: 380;
  - `tests/agenda-clima`: 37;
  - `tests/alertas`: 14;
  - `tests/clientes-ubicacion`: 29;
  - `tests/clima`: 42;
  - `tests/preparacion` (encargo B): 35;
  - `tests/preparar`: 12;
  - build y PWA.

Los logs están en `.temp/a/o8-final-*.log`.

## Añadido después del informe de B (2026-11-07)

- **«Añadir siempre para [tipo]»** conectado con `anadirArticuloPlantilla`, la función que dejó B. Tiene una prueba propia. No cambié ningún archivo de B.
- **Verificación repetida** con `node scripts/verificar.mjs` sobre el árbol final: código 0.

## Reintento: la verificación de Factory falló (2026-11-07, 12:48)

**Qué falló.** `node scripts/verificar.mjs` salió con 1 (log `.temp/factory-verification/f31526d85e11c3b44779a206.log`). Las 380 pruebas de `src/` pasaron, pero vitest atrapó un error sin capturar (`DatabaseClosedError`) mientras corría `src/screens/registroGasto.f3.test.tsx`, y por eso salió con 1.

**Diagnóstico.**
- **Frecuencia**: lo reproduje en 1 de cada 4 a 6 corridas de la suite completa, solo bajo carga. Corriendo ese archivo solo, no apareció en 8 corridas.
- **No viene de las alertas**: con una configuración temporal (`.temp/a/diag/`) anulé el hook de alertas de preparación (B) y el de clima de la campana. El error siguió apareciendo (2 de 8).
- **Causa**: Node avisaba «Promise rejection was handled asynchronously»: una promesa rechazada que alguien atiende tarde. Estaba en dos archivos de olas anteriores:
  - la cola del borrador de `src/screens/Registrar.tsx` guardaba la escritura rechazada (base cerrada entre pruebas) sin atenderla hasta la siguiente pulsación;
  - `src/App.tsx` leía el borrador sin `.catch`.
- **Otras dos fallas intermitentes** salieron al repetir. Las dos ya existían: la vi antes de cualquier cambio en las corridas de diagnóstico.
  - `registroGasto.f3.test.tsx:277`: el aviso «Tenías un gasto a medias…» salía antes de que cargaran los datos, y con «Seguir» Registrar se abría sin categorías. Es un fallo de la App: con Pablo el aviso también asomaba un instante.
  - `clientes.test.tsx:446`: la prueba leía la barra «Deshacer» antes de que apareciera.

**Arreglos (mínimos, fuera de mis carpetas; los declaro):**
- **`src/screens/Registrar.tsx`**: la cola del borrador atiende cada error y quien espera la escritura recibe el error igual que antes. El guardado en cada pulsación y la lectura de la foto del ticket registran el error en lugar de dejarlo suelto.
- **`src/App.tsx`**: la lectura del borrador atiende su error, y el aviso «Tenías un gasto a medias…» espera a que carguen los datos.
- **`src/screens/clientes.test.tsx`**: la línea 446 espera la barra «Deshacer» (`findByRole` en vez de `getByRole`).

**Resultado.**
- Suite de `src/` repetida 8 veces tras los arreglos: 8 de 8 en verde, sin errores sueltos (antes, 4 de 8 con error).
- `node scripts/verificar.mjs` 3 veces seguidas: 3 de 3 con código 0.
- Logs: `.temp/a/o8-fix2-*.log` y `.temp/a/o8-final-verificar-r*.log`.

## Pendiente

- **Revisión visual a 375 y 430 px**: no la hice. El navegador integrado no abre un servidor local levantado desde la sesión. Queda para el ajuste a la maqueta.
- **Con el encargo B**:
  - que sus plantillas y proveedores usen las claves de `CONTRATO.md` (o adaptar `leerPlantillas()`);
  - que la tarjeta «Preparar trabajos» de Alertas abra esta pantalla;
  - las notificaciones de recogida, devolución, compra y ropa.
- **Propuesta de una sola reserva**: no está hecha la de §10.8.1 cuando hay furgoneta en días consecutivos («¿Una sola reserva de 2 días?»).
- **Alquiler repartido**: se registra como un gasto por cliente, porque el movimiento tiene un solo cliente. Si se prefiere un único gasto con varias imputaciones, haría falta el campo `imputaciones` de §8.6 en el esquema.

RESUMEN: Ya está la pantalla Preparar trabajo. Felipe deja listo el día antes de salir: reserva la furgoneta y, al recogerla, anota en un toque el alquiler y la fianza; marca el material que tiene o tiene que comprar, con recordatorio y gasto; y revisa la ropa según cuántos van. Funciona sin conexión, con deshacer, y todas las pruebas pasan.

ESTADO: Preparar trabajo listo para integrar
