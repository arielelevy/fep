# Ola 1 · Frente A · Leer la maqueta existente (FERGO App Mockups.pdf)

## Lo hecho

- Creado `docs/maqueta.md`: referencia escrita de las 5 páginas de `FERGO App Mockups.pdf`, contrastada con la especificación v1.0 (6 de noviembre de 2026).
  - Sección 0: cómo se leyó el PDF. Cada página es una imagen JPEG de 1170 × 2532 px (390 × 844 pt) con capa OCR; no hay vectores ni fuente embebida.
  - Sección 1: inventario de las 5 pantallas, con página del PDF (p. 1 Hoy, p. 2 Nuevo movimiento, p. 3 Movimientos, p. 4 Ficha de cliente, p. 5 Agenda). Por pantalla: contenido, acciones, navegación y diferencias con la especificación.
  - Sección 2: tokens. Los colores se muestrearon por píxel. 12 de los 22 valores de la sección 6.1 coinciden dentro del ruido JPEG. Rojo, ámbar-punto, verde-punto y whatsapp-burbuja no se usan en la maqueta. Hay 2 colores que no son tokens: `#284B33` (celdas del resumen) y `#E1E7DB` (fondo del control segmentado). Tipografía, radios y sombras son estimaciones sobre la imagen.
  - Sección 3: 35 componentes de la maqueta, con su página, y la lista de componentes de la especificación que no tienen maqueta.
  - Sección 4: huecos con casillas para Ariel, sin elegir por él. Son 8 pantallas pedidas (H1–H8), 3 pantallas adicionales detectadas (H9–H11) y 6 estados (E1–E6). Se suman las diferencias de las pantallas maquetadas, donde manda la especificación.
- No se tocó nada más del repo. No se usó Git. Los archivos auxiliares (extracción de imágenes y muestreo de colores) quedaron en el scratchpad de la sesión, fuera del repo.

## Pruebas

Comprobación del documento: cita las 5 páginas del PDF, transcribe los 23 hex de la sección 6 (22 tokens; rojo-texto tiene 2 valores), nombra los componentes pedidos y todos los huecos y estados del encargo.

PRUEBA: python -I -S -c "import sys;t=open('docs/maqueta.md',encoding='utf-8').read();req=['PDF p. %d'%i for i in range(1,6)]+['#'+h for h in '12391F 1F5A30 B9E33A E3F2C2 F4F6EF FFFFFF EEF1EA DCE3D4 15241A 33423A 56645A FFF1C7 4D3600 D99A00 FBE3E0 C0392B A12A1F 7A1F16 2E8B3E DDE9F7 1D4E89 DCF8C6'.split()]+['Barra inferior con botón +','Tarjeta de resumen','Aviso de cobro','Chips / píldoras de filtro','Botón Hecho','Barra Deshacer','Aviso de lluvia','Listado de Clientes','Formulario Nuevo / Editar cliente','Detalle de visita','Mover visita','Hoja Hecho / cobro','| Alertas |','Preparar trabajo','Ajustes','Cargando','Vacío','Sin conexión','Error de servidor','Primer uso','Borrador'];miss=[r for r in req if r not in t];print('faltan:',miss);sys.exit(1 if miss else 0)"

Resultado al entregar: `faltan: []`, código 0. El oráculo de Factory, `.temp/factory-oraculo/informe_estado.py`, corrió sobre este informe y dio OK.

Revisión manual de los colores: los 23 hex de la tabla 2.1 se compararon uno por uno con la sección 6.1 de la especificación y coinciden.

## Pendiente

- Decisiones de Ariel por cada hueco. Están abajo y como casillas en `docs/maqueta.md` §4.
- No se pudo leer el artefacto de mockups citado en la especificación (`https://claude.ai/artifact/4wpLBYXnSPahaJNptqjSJE`): no existe o no está compartido con esta cuenta. Según la especificación, incluye "6. Alertas" y "7. Preparar trabajo". Si Ariel lo comparte, podría cubrir H6 y H7.
- Hay una contradicción en el encargo. El cuerpo dice que esta ola **no** es de Penpot. La línea final genérica dice "Esta ola es de maquetado en Penpot". Se siguió el cuerpo y la ficha, así que no se usó Penpot y no hay enlace ni recorrido navegable.
- La especificación declara Android/PWA como plataforma objetivo, pero describe Safari, iOS y VoiceOver, y la maqueta usa marco de iPhone. Queda anotado; no le toca a esta ola resolverlo.

## Decisiones para Ariel

La primera opción de cada línea es una recomendación, no una elección. Criterio: si la pantalla se arma con componentes ya maquetados, se recomienda construirla. Si trae componentes nuevos y complejos, se recomienda maquetarla antes.

DECISIÓN: H1 · Listado de Clientes (10.4.1): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: H2 · Formulario Nuevo / Editar cliente (10.4.3, incluye mapa con chincheta): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: H3 · Detalle de visita (10.6, semáforo grande y acciones): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: H4 · Mover visita (elección de día y hora, 10.7): ¿construir con el estilo de la maqueta o maquetar antes? | Maquetar antes | Construir con el estilo de la maqueta
DECISIÓN: H5 · Hoja Hecho / cobro "¿Cobraste a …?" (10.1.4): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: H6 · Alertas (10.7, tarjetas con franja, radio de día y hora, burbuja WhatsApp): ¿construir con el estilo de la maqueta o maquetar antes? | Maquetar antes | Construir con el estilo de la maqueta | Esperar el artefacto de mockups original
DECISIÓN: H7 · Preparar trabajo (10.8, bloques Furgoneta, Material y Ropa): ¿construir con el estilo de la maqueta o maquetar antes? | Maquetar antes | Construir con el estilo de la maqueta | Esperar el artefacto de mockups original
DECISIÓN: H8 · Ajustes y subpantallas (10.10): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: H9 · Informes (10.9, gráficos de barras): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: H10 · Nueva visita (7.2): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: H11 · Guía de instalación y permiso de avisos (4.1, 12.4): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: E1 · Estado Cargando (esqueletos): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: E2 · Estados Vacío (Hoy, Movimientos, Agenda, Alertas, Clientes): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: E3 · Estado Sin conexión (banda): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: E4 · Estado Error de servidor: ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: E5 · Estado Primer uso (bienvenida de 3 pasos y saldo inicial): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: E6 · Estado Borrador ("Tenías un gasto a medias …"): ¿construir con el estilo de la maqueta o maquetar antes? | Construir con el estilo de la maqueta | Maquetar antes
DECISIÓN: Colores de la maqueta que no son tokens (#284B33 en las celdas del resumen y #E1E7DB en el control segmentado): ¿qué hacer? | Añadirlos como tokens nuevos | Sustituirlos por tokens existentes de la sección 6.1

RESUMEN: Se escribió docs/maqueta.md, la referencia de las 5 pantallas del PDF de la maqueta. Recoge sus colores, tipografía y componentes, contrastados con la especificación. También lista 17 huecos (11 pantallas y 6 estados sin maqueta) para que Ariel decida si se construyen con el estilo de la maqueta o se maquetan antes.

ESTADO: Referencia de la maqueta listo para integrar
