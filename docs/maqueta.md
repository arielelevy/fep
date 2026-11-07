# FERGO · Referencia escrita de la maqueta

| | |
|---|---|
| Fuente | `FERGO App Mockups.pdf` (raíz del repo), 5 páginas |
| Contrastada con | FERGO · Especificación funcional y de diseño, v1.0, 6 de noviembre de 2026 |
| Fecha | 6 de noviembre de 2026 |
| Uso | Fuente única para las olas de construcción. Si la maqueta contradice la especificación, **manda la especificación**. Nombres, importes y fechas de la maqueta son datos de ejemplo. |

## 0. Cómo se leyó el PDF

- Cada página es **una imagen JPEG de 1170 × 2532 px** (captura de móvil a @3x, equivalente a **390 × 844 pt**) más una capa de texto OCR sin fuente real (`Glyphless`). No hay vectores ni estilos: colores, tamaños y radios se obtienen de la imagen.
- **Colores**: muestreados por píxel en zonas planas de cada imagen (mediana de 9 × 9 px). La compresión JPEG introduce un error de ±1 a 3 por canal. Los colores de **texto** se estiman por el píxel más oscuro del trazo; el antialiasing los oscurece entre 10 y 25 puntos de distancia, así que se dan como "aproximado".
- **Medidas**: estimadas sobre la imagen (px ÷ 3 = pt). Son orientativas; en caso de duda manda la sección 6 de la especificación.
- **Tipografía**: el PDF no incluye la fuente. Visualmente es una sans geométrica compatible con Plus Jakarta Sans (sección 6.2); no se puede confirmar desde el PDF.
- El marco es de iPhone (cabecera sin barra de estado, 390 pt). La especificación declara Android/PWA como plataforma objetivo pero describe comportamientos iOS; esa contradicción es de la especificación, no de la maqueta, y no se resuelve aquí.
- La especificación cita mockups en `https://claude.ai/artifact/4wpLBYXnSPahaJNptqjSJE` con 7 pantallas (incluye "6. Alertas" y "7. Preparar trabajo"). Ese artefacto **no se pudo leer** desde esta cuenta (no existe o no está compartido). Esta referencia se basa solo en el PDF.

| Página del PDF | Pantalla | Mockup en la especificación | Sección de la especificación |
|---|---|---|---|
| p. 1 | Hoy | "1. Hoy" | 10.1 |
| p. 2 | Nuevo movimiento (Registrar) | "2. Registrar" | 10.2 |
| p. 3 | Movimientos | "3. Movimientos" | 10.3 |
| p. 4 | Ficha de cliente | "4. Clientes" | 10.4.2 |
| p. 5 | Agenda | "5. Agenda" | 10.5 |

---

## 1. Inventario de pantallas

### 1.1 Hoy · PDF p. 1

**Contenido (de arriba abajo)**

1. Cabecera: logo FERGO circular (≈ 44 pt, F verde sobre blanco), "Hola, Felipe" (≈ 22 pt, extranegrita) y fecha larga "Domingo, 11 de octubre" en texto secundario.
2. Tarjeta de resumen (fondo verde oscuro, radio ≈ 22 pt, ancho completo con margen 16 pt):
   - "En caja" y cifra grande "1.240 €" (≈ 40–44 pt, blanca).
   - Cuadrícula 2 × 2 de celdas con fondo verde más claro (`#284B33`, ver tokens): "Ganado en octubre" "+ 620 €" (cifra en lima), "Te deben" "380 €", "En fianzas" "150 €", "Aportes de papá" "2.000 €" (cifras en blanco).
3. Aviso contextual de cobro (fondo ámbar, icono reloj): "Ayer en Sra. Morales: ¿cobraste?" y botón relleno ámbar oscuro "Sí, 45 €".
4. Sección "Visitas de hoy" con contador "1 de 3 hechas" a la derecha.
5. Tres tarjetas de visita:
   - 09:00 Fam. García, "Césped y setos · Cobrado 60 €": **hecha** (tarjeta atenuada, nombre tachado, círculo lima suave con check).
   - 11:30 Chalet Las Encinas, "Piscina · Abono 90 €/mes": **próxima** (contorno lima de 2 pt y botón "Hecho" relleno en lima).
   - 16:00 Comunidad Los Pinos, "Poda de setos · 150 €": pendiente (botón "Hecho" contorneado en verde).
6. Barra inferior con "Hoy" activa.

**Acciones visibles**: Sí, 45 € · Hecho (×2) · pestañas de la barra · botón Registrar (+).

**Navegación (según especificación 10.1)**: logo → Ajustes; celdas del resumen → Informes / pendientes / Movimientos filtrado; tarjeta de visita → Detalle de visita; "Hecho" → flujo de cobro (10.1.4).

**Diferencias con la especificación (manda la especificación)**

- Falta el **botón campana** con insignia roja a la derecha de la cabecera (10.1.1.1).
- Las tarjetas de visita **no muestran la línea de semáforo** (punto de color + texto, p. ej. "Se puede ir · Sol, 22°") exigida en 10.1.1.4.
- No se ven la tarjeta de resumen semanal (10.1.2) ni la banda "Activa los avisos" (12.4); son condicionales, no faltas.

### 1.2 Nuevo movimiento (Registrar) · PDF p. 2

**Contenido**

1. Cabecera "Nuevo movimiento" y botón circular blanco de cerrar (X, ≈ 44 pt).
2. Control segmentado de 4: **Gasto** (activo, verde oscuro, texto blanco), Cobro, Aporte, Fianza, sobre fondo gris verdoso (`#E1E7DB`).
3. Etiqueta "Importe" y cifra centrada "38,50 €" (≈ 48 pt, extranegrita).
4. "Categoría" y cuadrícula 3 × 3 (botones ≈ 84 pt de alto, radio ≈ 14 pt, fondo blanco, icono de trazo verde): Gasolina (seleccionada: fondo verde oscuro, texto blanco, icono lima), Alquiler furgo, Repuestos, Plantas y abono, Piscina, Vertedero, Herramientas, Ayudante, Más.
5. Tarjeta blanca de filas: "Cliente" con "Opcional ›"; "Pago" con chips Efectivo (seleccionado, lima suave), Bizum, Tarjeta (contorno `borde`).
6. Pie: botón cuadrado contorneado de cámara (≈ 60 pt) y botón principal lima "Guardar gasto" (≈ 60 pt de alto, radio ≈ 14 pt).

**Acciones visibles**: Cerrar · cambiar tipo · elegir categoría · Más · elegir cliente · elegir medio de pago · foto · Guardar gasto.

**Navegación**: hoja modal desde el botón + de la barra (la barra inferior no se muestra, coherente con 7.1).

**Diferencias con la especificación**

- Faltan las filas **Fecha** ("Hoy" por defecto) y **Nota** en Detalles (10.2.1.5).
- Falta el chip **Transferencia** (la especificación permite que los chips se deslicen; no se ve indicio de desplazamiento).
- El botón de cámara no lleva texto "Foto del ticket" (10.2.1.6 lo nombra así; se puede resolver con `aria-label`).
- No se ven los bloques de Cobro, Aporte y Fianza (10.2.2) ni el aviso "¿Seguro que son …?" (10.2.3.6).

### 1.3 Movimientos · PDF p. 3

**Contenido**

1. Título "Movimientos" (≈ 26 pt) y selector de mes "‹ Octubre ›".
2. Dos tarjetas de mes: "Cobrado" "+ 1.420 €" (verde medio) y "Gastado" "− 800 €" (color de texto).
3. Píldoras de filtro deslizables: Todos (activa, verde oscuro), Cobros, Gastos, Aportes, Fi[anzas] (cortada por el borde). Se ve una barra de desplazamiento horizontal del navegador bajo las píldoras: es un artefacto de la captura, no un elemento de diseño.
4. Lista agrupada por día con encabezados en mayúsculas ("HOY", "AYER", "MIÉRCOLES 8"):
   - Fam. García · "Cobro · Efectivo" · "+ 60 €" (icono flecha arriba sobre lima suave).
   - Gasolina · "Gasto · Efectivo · Ticket" · "− 38,50 €" (icono surtidor sobre fondo apagado).
   - Fianza furgoneta · chip ámbar "Pendiente de devolver" · "150 €" en gris (icono candado sobre ámbar).
   - Alquiler furgoneta · "Gasto · Comunidad Los Pinos" · "− 45 €".
   - Cloro y pH · "Gasto · Chalet Las Encinas" · "− 32 €" (icono gota).
   - Aporte de papá · chip azul "No cuenta como ganancia" · "+ 500 €" en azul (icono corazón sobre azul suave).
5. Barra Deshacer flotante (fondo casi negro, radio ≈ 14 pt): "Gasto guardado" y "Deshacer" en lima.
6. Barra inferior con "Movimientos" activa.

**Acciones visibles**: mes anterior/siguiente · filtros · toque en fila · Deshacer.

**Diferencias con la especificación**

- Falta el **icono de Informes** (gráfico de barras) a la derecha de la cabecera (10.3.1).
- No se ve la línea "Más N € en equipo" bajo Gastado (condicional).
- No se ve el gesto de deslizar para eliminar (no representable en una captura).

### 1.4 Ficha de cliente · PDF p. 4

**Contenido**

1. Enlace de vuelta "‹ Clientes" en verde medio.
2. Nombre "Chalet Las Encinas" (≈ 26 pt) y chips: "Jardín" (lima suave), "Piscina" (azul suave), "Abono 90 €/mes · cada 15 días" (blanco).
3. Tres acciones rápidas (≈ 64 pt): **Llamar** (relleno verde oscuro, texto blanco, icono lima), WhatsApp y Cómo llegar (blancas, icono verde).
4. Tarjeta de deuda ámbar: "Te debe 90 €", "Abono de septiembre · hace 11 días" y botón ámbar oscuro "Ya pagó". (11 días = ámbar, coherente con 9.4.)
5. Tarjeta "NOTAS": "Llave en el buzón. Perro suelto: avisar 10 minutos antes. No tocar el rosal del fondo."
6. Tarjeta "ESTE AÑO": Cobrado 810 €, Gastado 214 €, Te queda 596 € (verde medio).
7. "ÚLTIMAS VISITAS": "Hoy · Piscina" Programada (gris); "27 sep · Piscina y césped" Hecha (verde).
8. Barra inferior con "Clientes" activa.

**Acciones visibles**: volver · Llamar · WhatsApp · Cómo llegar · Ya pagó · editar notas.

**Navegación**: "‹ Clientes" debe volver al listado de Clientes (corrección de la especificación 7.2: en el mockup enlazaba a Hoy; el PDF no permite ver el destino).

**Diferencias con la especificación**

- Falta el botón **"Editar"** arriba a la derecha (10.4.2.1).
- Faltan el enlace **"Ver movimientos"**, **"Ver todas"** las visitas y **"Desactivar cliente"** (10.4.2.7–9).
- Solo se ven 2 visitas; la especificación pide las 5 más recientes y la próxima.
- La tarjeta de deuda debe pasar a rojo con 15 días o más (no representado).

### 1.5 Agenda · PDF p. 5

**Contenido**

1. Título "Agenda", subtítulo "Semana del 12 al 18 de octubre", botón contorneado "+ Visita" arriba a la derecha.
2. Franja de **7 días** (Lun 12 a Dom 18), cada uno con día abreviado y número. Lun 12 seleccionado (verde oscuro, punto lima). Puntos verdes bajo los días con visitas. Icono de lluvia bajo Mié 14. Dom 18 sin fondo y atenuado.
3. Banda azul suave: "Lluvia prevista el miércoles. Tienes 2 visitas." con botón azul relleno "Mover".
4. Título del día "Mañana, lunes 12".
5. Tarjetas de visita: hora y duración ("09:00 / 2 h", "12:00 / 3 h"), cliente, trabajo, línea secundaria ("↻ Cada semana · 60 €", "Trabajo puntual · 180 € + plantas"), chip ámbar "Necesita furgoneta", botón de llamada (≈ 44 pt, fondo apagado).
6. Pie con campana: "Te aviso esta noche a las 21:00 y una hora antes de cada visita."
7. Barra inferior con "Agenda" activa.

**Acciones visibles**: + Visita · elegir día · Mover · llamar · toque en visita.

**Diferencias con la especificación** (las mayores de toda la maqueta)

- La franja es de **7 días**; la especificación pide **14 días** deslizables con separador vertical **"ORIENTATIVO"** y días 8–14 atenuados con borde discontinuo (10.5.2).
- El subtítulo debe ser **"Tiempo de los próximos 14 días"**, no "Semana del …".
- Cada día debe mostrar **icono del tiempo, temperatura máxima y probabilidad de lluvia**; la maqueta solo muestra un icono de lluvia en un día.
- Faltan el **botón campana** con insignia y el botón "+" con la forma indicada (la maqueta usa "+ Visita").
- La banda de alerta en la especificación es de **fondo rojo suave**, texto tipo "Jueves 15: lluvia en Fam. García. ¿La movemos?" y botón **"Ver"** que lleva a Alertas; la maqueta usa fondo azul y botón "Mover".
- Las tarjetas **no muestran línea de semáforo** ni consejo; tampoco "+2 ayudantes" (condicional).
- No se ve el contorno rojo de 2 pt en días con visitas en rojo.
- Pie: la especificación dice "Te aviso la noche antes a las 21:00 …" y debe reflejar la configuración real.
- Dom 18 aparece atenuado sin explicación; en la especificación la atenuación es exclusiva de los días 8–14.

---

## 2. Tokens visuales

### 2.1 Colores: maqueta frente a la sección 6.1

Distancia = distancia euclídea RGB entre el valor muestreado y el token (0 = idéntico; ≤ 5 se considera coincidencia dentro del ruido JPEG).

| Token (sección 6.1) | Hex especificación | Muestreado en el PDF | Dónde | Resultado |
|---|---|---|---|---|
| verde-oscuro | `#12391F` | `#12381F` | Tarjeta resumen (p. 1), segmento activo y categoría activa (p. 2), píldora Todos (p. 3), Llamar (p. 4), día activo (p. 5) | Coincide |
| verde-medio | `#1F5A30` | `#20592C`–`#225931` (contorno); texto ≈ `#145626`–`#1D5025` | Contorno de "Hecho" (p. 1) y "+ Visita" (p. 5); cifras positivas, "‹ Clientes", "Hecha", "Te queda" | Coincide (contorno); texto aproximado |
| lima | `#B9E33A` | `#B9E23B` | Botón Registrar y "Hecho" (p. 1), "Guardar gasto" (p. 2), contorno de la próxima visita (p. 1); también "+ 620 €" sobre oscuro (p. 1), "Deshacer" (p. 3), punto del día activo (p. 5) | Coincide |
| lima-suave | `#E3F2C2` | `#E2F2C3` | Chip Efectivo (p. 2), icono de cobro (p. 3), chip Jardín (p. 4); círculo de check ≈ `#E7F3CD` (p. 1, atenuado) | Coincide |
| fondo | `#F4F6EF` | `#F5F6F0` | Fondo de todas las pantallas | Coincide |
| superficie | `#FFFFFF` | `#FFFFFF` | Tarjetas, barra inferior, botón cerrar | Coincide |
| fondo-apagado | `#EEF1EA` | `#EEF1EA` | Icono de gasto (p. 3), botón de llamada (p. 5) | Coincide |
| borde | `#DCE3D4` | `#DDE0D5`–`#DFE1DC` | Borde superior de la barra (p. 1), chips Bizum/Tarjeta (p. 2) | Aproximado (d ≈ 3–5, línea fina con antialiasing) |
| texto | `#15241A` | `#14241A` | Barra Deshacer (p. 3); texto principal ≈ `#0A150D`–`#18271B` | Coincide (relleno); texto aproximado |
| texto-2 | `#33423A` | — | No se identifica un uso claro distinto de texto y texto-3 | No verificable |
| texto-3 | `#56645A` | ≈ `#4A564C`–`#505C52` | "1 de 3 hechas", "Importe", "Opcional", encabezados de día, "Programada", pie de Agenda | Aproximado (texto) |
| ambar-fondo | `#FFF1C7` | `#FEF1C7` | Aviso de cobro (p. 1), icono y chip de fianza (p. 3), tarjeta deuda (p. 4), chip "Necesita furgoneta" (p. 5) | Coincide |
| ambar-texto | `#4D3600` | `#4D3600` | Botones "Sí, 45 €" (p. 1) y "Ya pagó" (p. 4); texto sobre ámbar ≈ `#3F2D00` | Coincide |
| ambar-punto | `#D99A00` | — | No aparece (no hay semáforo en la maqueta) | No usado |
| rojo-fondo | `#FBE3E0` | — | No aparece | No usado |
| rojo | `#C0392B` | — | No aparece (no hay insignia ni semáforo rojo) | No usado |
| rojo-texto | `#A12A1F` / `#7A1F16` | — | No aparece | No usado |
| verde-punto | `#2E8B3E` | — | No aparece (los puntos de la franja de días son verde-medio/verde-oscuro, no semáforo) | No usado |
| azul-fondo | `#DDE9F7` | `#DDE9F7` | Icono y chip de aporte (p. 3), chip Piscina (p. 4), banda de lluvia (p. 5) | Coincide |
| azul | `#1D4E89` | `#1D4E89` | Botón "Mover" (p. 5); texto azul ≈ `#123F76`–`#213D62` | Coincide |
| whatsapp-burbuja | `#DCF8C6` | — | No aparece (la burbuja vive en Alertas, sin maqueta en el PDF) | No usado |

**Colores de la maqueta que no son tokens de la sección 6.1**

| Valor muestreado | Dónde | Observación |
|---|---|---|
| `#284B33` | Celdas 2 × 2 de la tarjeta de resumen (p. 1) | Equivale a blanco al ≈ 10 % sobre verde-oscuro. Falta como token (propuesta de nombre: `verde-oscuro-celda`); no se decide aquí. |
| `#E1E7DB` | Fondo del control segmentado (p. 2) | Entre `borde` y `fondo-apagado`; no coincide con ninguno. |
| ≈ `#5A645C` (sombra) | Botón Registrar (p. 1) | Coherente con la sombra `0 4px 12px rgba(18,57,31,0.25)` de 6.3; no es un color de relleno. |

**Reglas de color de la sección 6.1 comprobadas en la maqueta**

- Lima solo en acción principal y acentos sobre oscuro: se cumple (Registrar, Hecho próximo, Guardar, Deshacer, "+ 620 €", día activo).
- Aportes en azul: se cumple (p. 3).
- Fianzas en ámbar: se cumple (p. 3); el importe de la fianza va en gris, como pide 10.3.4.
- Gastos en color de texto, no rojo: se cumple ("− 800 €", "− 38,50 €").
- El rojo no aparece en ninguna pantalla de la maqueta.

### 2.2 Tipografía (estimada)

| Estilo (6.2) | Especificación | En la maqueta | Ejemplo |
|---|---|---|---|
| Cifra principal | 40–48 pt / 800 | ≈ 40–44 pt (p. 1) y ≈ 48 pt (p. 2), extranegrita | "1.240 €", "38,50 €" |
| Título de pantalla | 26 pt / 800 | ≈ 26 pt, extranegrita | "Movimientos", "Agenda", "Chalet Las Encinas" |
| Título de saludo | 22 pt / 800 | ≈ 22 pt | "Hola, Felipe" |
| Título de sección | 18 pt / 800 | ≈ 18 pt | "Visitas de hoy", "Mañana, lunes 12" |
| Título de tarjeta | 16–17 pt / 700–800 | ≈ 16–17 pt | Nombres de cliente |
| Cuerpo | 15 pt / 500–600 | ≈ 15 pt | Notas, filas |
| Secundario | 13–14 pt / 500–600 | ≈ 13–14 pt | Subtítulos de fila, fecha |
| Etiqueta de sección | 13 pt / 700, mayúsculas | ≈ 13 pt, mayúsculas, interletrado amplio | "HOY", "NOTAS", "ÚLTIMAS VISITAS" |
| Chip / insignia | 12 pt / 700 | ≈ 12–13 pt | "Pendiente de devolver" |

Familia: no incluida en el PDF; aspecto compatible con Plus Jakarta Sans. No se ve texto menor de 12 pt.

### 2.3 Espaciado, radios y sombras (estimados)

| Elemento | Especificación (6.3) | En la maqueta |
|---|---|---|
| Margen lateral | 16 pt | ≈ 16 pt en todas las pantallas |
| Tarjeta de resumen | radio 22 pt | ≈ 22 pt |
| Tarjetas | 16–18 pt | ≈ 16 pt |
| Botones | 12–14 pt | ≈ 12–14 pt |
| Chips | 8 pt | ≈ 8 pt |
| Píldoras de filtro | 20 pt | Totalmente redondeadas (≈ 20 pt) |
| Botón Registrar | circular | Circular, ≈ 60 pt de diámetro, sobresale ≈ 16 pt del borde superior de la barra (la especificación dice "elevado 26 pt"; ambigüedad de medida, manda la especificación) |
| Sombras | solo botón Registrar y barra Deshacer | Sombra visible bajo el botón Registrar; el resto plano |
| Barra inferior | 84 pt, borde superior `#DCE3D4` | ≈ 84 pt, borde fino ≈ `#DDE0D5` |
| Zonas táctiles | ≥ 44 pt | Hecho ≈ 44 pt, acciones de ficha ≈ 64 pt, categorías ≈ 84 pt, Guardar ≈ 60 pt, días ≈ 48 pt de ancho |
| Franja izquierda en alertas | 4 pt | No aparece (no hay tarjetas de alerta) |

### 2.4 Iconografía

Iconos de trazo redondeado (estilo Lucide) en todas las pantallas: sol, flechas, personas, calendario, más (barra); surtidor, furgoneta, llave, brote, gota, papelera, tijeras, persona, puntos (categorías); flecha arriba, candado, corazón (movimientos); teléfono, burbuja de WhatsApp, chincheta (ficha); nube con lluvia, recurrencia, campana (agenda); reloj (aviso), check (visita hecha), cámara, X. Sin emojis.

---

## 3. Inventario de componentes

| # | Componente | Página(s) | Variantes / estados vistos | Notas para construir |
|---|---|---|---|---|
| C1 | **Barra inferior con botón +** | p. 1, 3, 4, 5 | Pestaña activa (verde oscuro, negrita) e inactivas (texto-3); botón Registrar circular lima elevado con sombra | Oculta en Registrar (p. 2), como pide 7.1 |
| C2 | Cabecera con saludo y logo | p. 1 | — | Falta la campana (C26) |
| C3 | **Tarjeta de resumen** | p. 1 | Cifra principal + 4 celdas | Celdas con `#284B33`, cifra Ganado en lima |
| C4 | Celda de resumen | p. 1 | Valor blanco / valor lima con "+" | Tocable (10.1.1.2) |
| C5 | **Aviso de cobro** (aviso contextual) | p. 1 | Ámbar con icono reloj y botón relleno ámbar oscuro | Máximo uno en Hoy |
| C6 | Encabezado de sección con contador | p. 1, 5 | "Visitas de hoy · 1 de 3 hechas", "Mañana, lunes 12" | — |
| C7 | Tarjeta de visita (Hoy) | p. 1 | Hecha (atenuada, tachada, check), próxima (contorno lima 2 pt), pendiente | Falta la línea de semáforo (C27) |
| C8 | **Botón Hecho** | p. 1 | Relleno lima (próxima), contorneado verde medio (resto), sustituido por círculo con check (hecha) | ≈ 44 pt de alto |
| C9 | Cabecera de hoja modal con cerrar | p. 2 | Botón X circular blanco | — |
| C10 | Control segmentado de tipo | p. 2 | Gasto activo; Cobro, Aporte, Fianza | Fondo `#E1E7DB` (no es token) |
| C11 | Importe grande | p. 2 | — | `inputmode="decimal"` (10.2.1.3) |
| C12 | Cuadrícula de categorías | p. 2 | Seleccionada (verde oscuro, icono lima) / normal (blanca) / "Más" | 3 × 3, ≈ 84 pt |
| C13 | Tarjeta de filas de detalle | p. 2 | Fila con valor y chevron ("Opcional ›"), fila con chips | Faltan filas Fecha y Nota |
| C14 | Chips de medio de pago | p. 2 | Seleccionado (lima suave, sin borde) / no seleccionado (borde) | Falta Transferencia |
| C15 | Botón de cámara (foto del ticket) | p. 2 | Contorneado verde | Estado con miniatura no representado |
| C16 | Botón principal lima de pie | p. 2 | "Guardar gasto" | Estado desactivado no representado |
| C17 | Selector de mes | p. 3 | "‹ Octubre ›" | Bloqueo más allá del mes actual no representado |
| C18 | Tarjetas de mes (Cobrado / Gastado) | p. 3 | Positivo en verde medio, negativo en texto | — |
| C19 | **Chips / píldoras de filtro** | p. 3 | Activa (verde oscuro) / inactiva (blanca con borde) | Deslizables |
| C20 | Encabezado de grupo por día | p. 3 | "HOY", "AYER", "MIÉRCOLES 8" | Etiqueta de sección |
| C21 | Fila de movimiento | p. 3 | Cobro (lima suave + flecha), gasto (apagado + icono de categoría), fianza (ámbar + candado), aporte (azul + corazón) | Icono 40 pt en cuadrado redondeado |
| C22 | Chip de estado | p. 3 | Ámbar "Pendiente de devolver", azul "No cuenta como ganancia" | 12 pt |
| C23 | **Barra Deshacer** | p. 3 | "Gasto guardado · Deshacer" | Fondo texto `#14241A`, acción lima, con sombra; 8 s |
| C24 | Enlace de vuelta | p. 4 | "‹ Clientes" | — |
| C25 | Chips de servicio y modalidad | p. 4 | Jardín (lima suave), Piscina (azul suave), modalidad (blanco) | — |
| C28 | Acciones rápidas | p. 4 | Llamar (relleno), WhatsApp y Cómo llegar (blancas) | Estado desactivado "Añadir teléfono" no representado |
| C29 | Tarjeta de deuda con "Ya pagó" | p. 4 | Ámbar | Variante roja no representada |
| C30 | Tarjeta de notas | p. 4 | — | Edición en línea no representada |
| C31 | Tarjeta de métricas "Este año" | p. 4 | 3 columnas | — |
| C32 | Lista de visitas con estado | p. 4 | Programada (gris), Hecha (verde) | Falta "Cancelada" |
| C33 | Botón contorneado de cabecera | p. 5 | "+ Visita" | La especificación pide "+" y campana |
| C34 | Franja de días | p. 5 | Activo (verde oscuro + punto lima), normal (blanco + punto verde), con icono de lluvia, atenuado (Dom) | Ver diferencias: 14 días, ORIENTATIVO, tiempo por día |
| C35 | **Aviso de lluvia** (banda) | p. 5 | Azul suave con botón azul "Mover" | La especificación pide fondo rojo suave y botón "Ver" |
| C36 | Tarjeta de visita (Agenda) | p. 5 | Hora/duración, recurrencia, chip "Necesita furgoneta", botón de llamada | Falta línea de semáforo y consejo |
| C37 | Pie informativo con campana | p. 5 | — | Debe reflejar la configuración real |

**Componentes de la especificación que no aparecen en la maqueta**

| Componente | Sección de la especificación |
|---|---|
| C26 · Botón campana con insignia roja | 10.1.1.1, 10.5.1 |
| C27 · Línea de semáforo (punto + texto) y semáforo grande | 10.1.1.4, 10.5.4, 10.6.3, 11.4 |
| Tarjeta de alerta con franja izquierda de 4 pt (roja, ámbar, verde) | 6.3, 10.7 |
| Grupo de opciones de día y hora (radio) | 10.7 |
| Burbuja de mensaje WhatsApp (`whatsapp-burbuja`) con "Mensaje editado · Restaurar" | 10.7 |
| Hoja inferior "¿Cobraste a …?" | 10.1.4 |
| Barra de progreso y bloques (Furgoneta, Material, Ropa) | 10.8 |
| Botones dobles "Lo tengo" / "Comprar" y caja "Lista de compra" | 10.8.2 |
| Checklist de ropa en 2 columnas | 10.8.3 |
| Banda "Sin conexión" | 10 (estados comunes) |
| Esqueletos de carga | 10 (estados comunes) |
| Tarjeta de bienvenida con 3 pasos | 10.1.3 |
| Tarjeta de resumen semanal | 10.1.2 |
| Buscador y filas del listado de clientes | 10.4.1 |
| Formulario con secciones plegables y mapa con chincheta | 10.4.3 |
| Diálogo de confirmación ("¿Descartar este gasto?", "¿Seguro que son …?") | 10.2.1, 10.2.3 |
| Gráficos de barras de Informes | 10.9 |

---

## 4. Huecos de la maqueta frente a la especificación

Cada hueco necesita una decisión de Ariel: **construir siguiendo el estilo de la maqueta** (con los tokens y componentes de las secciones 2 y 3) o **maquetarlo antes** de construir. Este documento no elige: marcar una casilla por fila.

### 4.1 Pantallas sin maqueta

| # | Hueco | Especificación | Construir con el estilo de la maqueta | Maquetar antes | Notas de Ariel |
|---|---|---|---|---|---|
| H1 | Listado de Clientes | 10.4.1 | [ ] | [ ] | |
| H2 | Formulario Nuevo / Editar cliente | 10.4.3 | [ ] | [ ] | |
| H3 | Detalle de visita | 10.6 | [ ] | [ ] | |
| H4 | Mover visita (elección de día y hora) | 7.2, 10.7 | [ ] | [ ] | |
| H5 | Hoja Hecho / cobro ("¿Cobraste a …?") | 10.1.4 | [ ] | [ ] | |
| H6 | Alertas | 10.7 | [ ] | [ ] | |
| H7 | Preparar trabajo | 10.8 | [ ] | [ ] | |
| H8 | Ajustes (y sus subpantallas) | 10.10 | [ ] | [ ] | |

Otras pantallas de la especificación sin maqueta, detectadas al contrastar (no estaban en el encargo; se listan para que no se pierdan):

| # | Hueco | Especificación | Construir con el estilo de la maqueta | Maquetar antes | Notas de Ariel |
|---|---|---|---|---|---|
| H9 | Informes | 10.9 | [ ] | [ ] | |
| H10 | Nueva visita | 7.2 | [ ] | [ ] | |
| H11 | Guía de instalación y permiso de avisos | 4.1, 12.4 | [ ] | [ ] | |

### 4.2 Estados sin maqueta

| # | Estado | Especificación | Construir con el estilo de la maqueta | Maquetar antes | Notas de Ariel |
|---|---|---|---|---|---|
| E1 | Cargando (esqueletos) | 10, estados comunes | [ ] | [ ] | |
| E2 | Vacío (Hoy sin visitas, Movimientos, día de Agenda, Alertas, Clientes) | 10.1.1.5, 10.3.6, 10.5.5, 10.7.4 | [ ] | [ ] | |
| E3 | Sin conexión (banda) | 10, 14 | [ ] | [ ] | |
| E4 | Error de servidor | 10, estados comunes | [ ] | [ ] | |
| E5 | Primer uso (bienvenida y saldo inicial) | 10.1.3, 9.3 | [ ] | [ ] | |
| E6 | Borrador ("Tenías un gasto a medias …") | 5.1.6 | [ ] | [ ] | |

### 4.3 Diferencias en pantallas maquetadas

No requieren decisión: **manda la especificación**. Están detalladas en la sección 1 de cada pantalla. Resumen para las olas de construcción:

| Pantalla | Qué construir distinto de la maqueta |
|---|---|
| Hoy (p. 1) | Añadir campana con insignia; añadir línea de semáforo en cada visita |
| Registrar (p. 2) | Añadir filas Fecha y Nota; añadir chip Transferencia; `aria-label` "Foto del ticket" en la cámara |
| Movimientos (p. 3) | Añadir icono de Informes en la cabecera |
| Ficha de cliente (p. 4) | Añadir "Editar", "Ver movimientos", "Ver todas", "Desactivar cliente"; 5 visitas + próxima; "‹ Clientes" vuelve al listado |
| Agenda (p. 5) | Franja de 14 días con "ORIENTATIVO", tiempo por día; subtítulo "Tiempo de los próximos 14 días"; campana; banda de alerta roja suave con "Ver"; línea de semáforo y consejo en visitas |
| Tokens | Decidir en construcción cómo nombrar `#284B33` y `#E1E7DB` (no son tokens de 6.1) o sustituirlos por tokens existentes |
