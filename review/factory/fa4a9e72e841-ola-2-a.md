# Ola 2 · Frente A · Base de la app y registro de gastos (Features 1 y 2)

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Referencia visual: `FERGO App Mockups.pdf` y `docs/maqueta.md`. Del artefacto de mockups citado solo se usó el PDF, porque el artefacto no es accesible desde esta cuenta (ola 1).

## Lo hecho

### Feature 1 · App instalable con navegación, tema y almacenamiento local

- Proyecto React 19 + TypeScript + Vite 6 con `vite-plugin-pwa` (Workbox, `generateSW`). Archivos: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`. Las versiones están fijadas.
- Manifiesto: `display: standalone`, `theme_color #12391F`, `lang es-ES`. Iconos PNG de 192 y 512 px, uno maskable y `apple-touch-icon`, con la F de FERGO sobre fondo blanco. Los genera `scripts/generar-iconos.mjs` sin dependencias y van en `public/`. El service worker precachea la app y la fuente. Chrome ofreció «Instalar FERGO» (`beforeinstallprompt`) sobre la build de producción: los criterios de instalabilidad se cumplen.
- Fuente Plus Jakarta Sans autoalojada, pesos 400 a 800, mediante `@fontsource`. Va en el precache.
- Tokens (`src/styles/tokens.css`): los de §6.1 y dos nuevos de la maqueta, `--verde-oscuro-celda #284B33` y `--segmentado-fondo #E1E7DB`, como decidió Ariel. Se fuerza el tema claro. Las letras usan rem para respetar el tamaño de texto del sistema. Se respetan `env(safe-area-inset-*)` y «reducir movimiento». En ordenador, la app se ve centrada a 430 px.
- Barra inferior de 5 elementos con el botón lima Registrar elevado (`BarraInferior.tsx`, mockup p. 1/3). Volver a tocar la pestaña activa sube al inicio. Alertas, Ajustes e Informes son pantallas de segundo nivel con «‹ Hoy» o «‹ Movimientos». Ninguna supera los 3 niveles.
- Capa local con IndexedDB y Dexie (`src/db/db.ts`, `repo.ts`, `datos.tsx`):
  - UUID generados en el cliente, importes en céntimos enteros y borrado lógico `eliminado_en`.
  - Cada escritura guarda `creado_por`, `modificado_por` y `version`.
  - La siembra inicial crea el negocio, el usuario Felipe (titular, aportante «papá") y las 27 categorías de §9.2: 21 de gasto, de ellas 2 ocultas, y 6 de ingreso.
  - Ya existen los campos ocultos `con_iva`, `base` y `cuota_iva`.
- Pantalla Hoy (`Hoy.tsx`, mockup p. 1):
  - Logo (→ Ajustes), «Hola, Felipe», fecha larga en Madrid y campana (→ Alertas).
  - Tarjeta de resumen con En caja y Ganado en [mes], con conteo animado de 250 ms (`CifraAnimada.tsx`). Con «reducir movimiento», el conteo se desactiva.
  - Al tocar En caja se ve el desglose en efectivo y banco.
  - Celdas Te deben (0 €), En fianzas y Aportes de papá. Las dos últimas llevan a Movimientos ya filtrado.
- Primer uso: tarjeta de bienvenida con 3 pasos marcables y la hoja «Tu dinero actual». El saldo inicial se registra en efectivo y en banco: cuenta en caja y no en Ganado.
- Estados:
  - **Cargando**: esqueletos.
  - **Vacío**: «Hoy no tienes visitas» y «Aún no hay movimientos en [mes]» con «Registrar el primero».
  - **Sin conexión**: banda con «Sin conexión. Lo guardo y lo envío al volver.».
  - **Error**: «No se pudo guardar…» sin perder lo escrito. Como en esta ola no hay servidor, cubre los fallos de escritura local.
- Guía de instalación (`GuiaInstalacion.tsx`): sale al abrir la app desde el navegador sin instalar.
  - Pasos ilustrados para Android/Chrome o iPhone/Safari y botón «Instalar FERGO» cuando el navegador lo permite.
  - Aviso «Usa solo WhatsApp Business…» y salida «Seguir en el navegador» (pensada para Pablo en el ordenador).
  - Se puede volver a abrir desde Ajustes.

### Feature 2 · Registrar un gasto en 3 toques con deshacer

- Hoja Registrar (`Registrar.tsx`, mockup p. 2):
  - Control segmentado en Gasto. El importe recibe el foco al abrir, con `inputmode="decimal"`. Se formatea mientras se escribe y admite coma; el máximo es 99.999,99 €.
  - Cuadrícula 3 × 3 de categorías: las 8 más usadas en 60 días y «Más». «Más» abre la lista completa agrupada y con buscador.
  - Filas Fecha («Hoy»; acepta días anteriores y futuros hasta 7 días con «¿Es un gasto previsto?»), Cliente («Opcional»), Pago y Nota.
  - Pago muestra Efectivo, Bizum, Tarjeta y Transferencia, con el último usado preseleccionado.
  - Cámara «Foto del ticket»: comprime a JPEG de 1600 px como máximo y guarda la imagen en IndexedDB.
  - «Guardar gasto» queda desactivado hasta tener importe y categoría.
- Flujo de 3 toques: Registrar → categoría → Guardar. Guarda en local, cierra la hoja y muestra «Gasto guardado · Deshacer» durante 8 s (`Deshacer.tsx`). Las cifras de Hoy cuentan hasta el valor nuevo.
- Importe atípico: si supera 5 veces la media de la categoría, pide confirmación con «¿Seguro que son 3.850 €?» y las opciones Sí / Corregir. Sin historial en la categoría no pregunta.
- Borrador:
  - Cada cambio de un gasto nuevo se guarda en local.
  - Al volver a la app aparece «Tenías un gasto a medias de 38,50 €. ¿Seguir?».
  - Si se cierra con datos, se confirma con «¿Descartar este gasto?» (Descartar / Seguir editando).
- Movimientos (`Movimientos.tsx`, mockup p. 3):
  - Selector de mes que no pasa del mes actual, icono de Informes y tarjetas Cobrado y Gastado, con «Más N € en equipo» cuando hay inversión.
  - Filtros en píldoras; el último filtro se recuerda en el dispositivo.
  - Lista agrupada como en la maqueta: HOY, AYER, MIÉRCOLES 8.
  - Tocar una fila abre Editar, con el mismo formulario, la fecha editable y «Eliminar» en rojo. Deslizar a la izquierda muestra «Eliminar».
  - Editar y eliminar tienen deshacer de 8 s. Eliminar es un borrado lógico.
- Cobro, Aporte y Fianza en el segmentado, y las pestañas Clientes y Agenda: quedan como marcador con el estilo de la maqueta y sin lógica.

### Coordinación con el frente B

Antes del aviso de la coordinadora ya había escrito pruebas propias: `src/App.test.tsx`, `src/components/Deshacer.test.tsx`, `src/db/repo.test.ts`, `src/domain/cifras.test.ts`, `src/domain/ordenCategorias.test.ts`, `src/lib/dinero.test.ts` y `src/lib/fechas.test.ts`. Después del aviso no agregué más. B escribió las suyas como `*.f3.test.ts`, sin choque de nombres. Corrí la suite completa con las pruebas de B y todas pasan. Ninguna prueba de B necesitó cambios de código.

## Pruebas

`scripts/verificar.mjs` corre todo en orden:

1. Si falta `node_modules`, ejecuta `npm ci`, porque Factory verifica en una copia limpia.
2. Comprueba los tipos con `tsc`.
3. Corre `vitest run` sobre la suite completa: pruebas de A y de B.
4. Hace el build de producción con `vite build`.
5. Comprueba la PWA:
   - `dist/manifest.webmanifest` declara standalone, `#12391F` y los iconos de 192, 512 y maskable.
   - `dist/sw.js` precachea `index.html` y la fuente woff2.
   - `index.html` enlaza el manifiesto y registra el service worker.

PRUEBA: node scripts/verificar.mjs

Resultado al entregar: código 0. 12 archivos de prueba, **149 pruebas en verde**. Tipos limpios, build correcta y PWA verificada.

Cobertura de los criterios de §18:
- **Criterio 1**: el botón lima abre Registrar en Gasto con el foco en el importe y `inputmode="decimal"`, desde las 4 pestañas (`App.test.tsx`).
- **Criterio 2**: con importe y categoría, la hoja se cierra en menos de 300 ms medidos. El gasto aparece en Movimientos y En caja y Ganado bajan 38,50 €.
- **Criterio 3**: «Deshacer» devuelve las cifras al valor anterior y el movimiento queda borrado de forma lógica. La barra desaparece a los 8 s (`Deshacer.test.tsx`, con temporizadores simulados).
- **Criterio 8**: con 3.850 € en una categoría de media 40 € se pide confirmación. Se prueba «Corregir» y después «Sí», en la interfaz y en `cifras.test.ts`.
- **Otras pruebas**:
  - Cálculo: céntimos exactos (0,29 y 10 × 0,10 €), formato es-ES («1.240 €», «38,50 €», «− 120 €») y mes natural en Madrid en el cambio de mes y de hora.
  - Registro: inversiones fuera de Ganado, borrado lógico, deshacer de alta, edición y baja, dos campos obligatorios, valores por defecto y orden por frecuencia a 60 días con «Más».
  - Estados y flujos: borrador al reabrir y al guardar, registro en día anterior, edición de fecha, saldo inicial, bienvenida, banda sin conexión, error de guardado y guía de instalación.

Comprobación visual: capturas reales a 390 × 844 con Chrome sin interfaz sobre la build de producción (Hoy, Registrar, Movimientos y la guía). Revelaron dos defectos, ya corregidos: un desbordamiento horizontal en la cabecera de Movimientos y un borde rojo que asomaba del botón Eliminar oculto. Las capturas quedaron fuera del repo.

Entorno: Windows 11, Node 26.13.0 y npm 11.20.0. Node 26 deja indefinido el `localStorage` de jsdom; `src/test/setup.ts` pone uno en memoria solo en las pruebas.

## Pendiente

- **Sin medir en un dispositivo real**: la instalación en Android y en iPhone, los 10 segundos de punta a punta, VoiceOver o TalkBack y el texto al 130 %. Las pruebas cubren el comportamiento y el foco, pero no la ergonomía real.
- **Sin auditoría automática** de contraste ni de zonas táctiles: los criterios 32 y 33 son de otra ola. Los colores son los tokens de §6.1 y las zonas táctiles miden al menos 44 px por CSS, pero no se pasó un auditor.
- **Funcionamiento sin conexión**: el service worker precachea todo y los datos viven en IndexedDB. No se probó cortando la red en un navegador real; solo se verificó el precache en `dist/sw.js` y la banda simulada.
- **Foto del ticket**: se guarda en local con `subida: false`. La subida en segundo plano llega con el backend, en otra ola.
- Celda «Te deben» fija en 0 € y sección de visitas vacía: cobros y agenda son de otras olas. El aviso contextual y el resumen semanal del domingo dependen de cobros y no se construyeron.
- «En fianzas» y «Aportes» ya se calculan a partir de los movimientos. Cuando exista la entidad Fianza, «En fianzas» debe pasar a calcularse por el estado de cada fianza.
- `contador_uso_60d` existe en el modelo, pero el orden de la cuadrícula se calcula siempre desde los movimientos de los últimos 60 días. Así no puede desincronizarse y cumple «incrementa el contador» de forma derivada.
- No hay inicio de sesión: el dispositivo trabaja como Felipe, titular. El usuario de Pablo llega con el backend.
- Pantallas de marcador sin lógica: Alertas, Ajustes (solo enlaza la guía), Informes, Clientes y Agenda.
- No se usó Git. `dist/` y `dev-dist/` se añadieron a `.gitignore`. No quedan temporales en el repo; el perfil de Chrome y las capturas están en el scratchpad de la sesión.

## Decisiones para Ariel

DECISIÓN: La 4.ª casilla de la cuadrícula de gastos dice «Plantas y abono» en la maqueta, pero la especificación separa «Plantas, semillas y césped» y «Sustrato y abono». ¿Qué categoría ocupa esa casilla? | Plantas, semillas y césped, con el rótulo «Plantas y abono» de la maqueta (lo construido) | La misma categoría con el rótulo «Plantas» | Fusionar las dos categorías en «Plantas y abono»
DECISIÓN: El icono de Informes que pide la especificación no cabe junto al título y el selector de mes de la maqueta a 375–430 px. ¿Cómo queda la cabecera de Movimientos? | Selector de mes en una segunda fila a lo ancho (lo construido) | Quitar el icono y llegar a Informes desde la tarjeta Gastado
DECISIÓN: Los pasos «Añade tu primer cliente» y «Activa los avisos» de la bienvenida todavía no tienen pantalla. ¿Qué hacemos mientras tanto? | Que se puedan marcar a mano y se completen solos cuando lleguen esas olas (lo construido) | Ocultarlos hasta que existan

RESUMEN: La app FERGO ya se instala como PWA y funciona en el móvil con datos guardados en el propio teléfono. Muestra la pantalla Hoy con En caja y Ganado, registra un gasto en 3 toques con deshacer de 8 segundos y lista los movimientos del mes para editarlos o borrarlos. Las pruebas propias y las del frente B pasan.

ESTADO: Base de la app y registro de gastos listo para integrar
