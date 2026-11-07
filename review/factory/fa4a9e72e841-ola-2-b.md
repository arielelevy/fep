# Ola 2 · Frente B · Pruebas de gastos y cifras (Feature 3)

Fecha: 2026-11-06. Entorno: Windows 11, Node con Vitest 3.2.4 + jsdom + fake-indexeddb (configuración de A, `src/test/setup.ts`).
Fuente de la especificación: encargo de A (copia de «FERGO · Especificación funcional y de diseño», §4.3, §5.1, §5.4, §9.1-9.3, §10.2, §10.3, §18). No hay copia de la especificación en el repo.

## Archivos creados (sólo pruebas)

Sufijo `.f3.test` para no pisar las pruebas que ya escribió A (`*.test.ts` sin sufijo). No toqué nada más de `src/`, ni `package.json`, ni la configuración.

| Archivo | Pruebas | Qué cubre | Criterios §18 |
|---|---|---|---|
| `src/lib/dinero.f3.test.ts` | 16 | Céntimos enteros; formato es-ES «1.240 €», «38,50 €», «− 120 €», detalle con «,00»; lectura del campo con coma o punto decimal; máximo 99.999,99 €; formato al escribir; ida y vuelta céntimos ↔ texto | 2, 8 (formato del importe) |
| `src/domain/cifras.f3.test.ts` | 32 | Efecto de cada tipo de §9.1 en En caja y Ganado; inversión fuera de Ganado; En caja histórica y desglose efectivo/banco; Ganado por mes natural de Madrid (bordes de cambio de hora); borrado lógico; deshacer (alta y borrado); tarjetas del mes; aportes; regla del importe atípico (media 40 €, límite exacto 5×, sin historial, borrados, edición) | 2, 3, 8 |
| `src/domain/ordenCategorias.f3.test.ts` | 8 | Ventana de 60 días (límite exacto, 60 días + 1 min, futuro); orden descendente; desempate por el orden inicial de §9.2; 8 visibles y el resto en «Más»; ocultas, eliminadas e ingresos fuera | — (§5.1.5) |
| `src/db/repo.f3.test.ts` | 15 | Sobre IndexedDB: sólo importe y categoría obligatorios; último medio de pago; céntimos guardados; En caja/Ganado al guardar y al deshacer; inversión; edición de importe, fecha y categoría con sus cifras; validación al editar; borrado lógico con deshacer; versión y `modificado_por`; atípico con datos reales | 2, 3, 8 |
| `src/screens/registroGasto.f3.test.tsx` | 21 | App completa: botón lima desde Hoy, Movimientos, Clientes y Agenda abre en Gasto con foco e `inputmode="decimal"`; guardar cierra en < 300 ms, aparece en Movimientos y bajan En caja y Ganado; Deshacer devuelve las cifras y quita el movimiento; la barra sigue a 7,9 s y se va a 8 s; «¿Seguro que son 3.850 €?» con Corregir / Sí; campos obligatorios y botón desactivado; fecha de hoy y último medio por defecto; cuadrícula por frecuencia y «Más»; borrador al cerrar la app, Seguir / Descartar, descarte al cerrar la hoja, borrado al guardar; editar y eliminar desde Movimientos con Deshacer | 1, 2, 3, 8 |

Total: 92 pruebas en 5 archivos.

## Resultados

PRUEBA: npx vitest run src/lib/dinero.f3.test.ts src/domain/cifras.f3.test.ts src/domain/ordenCategorias.f3.test.ts src/db/repo.f3.test.ts src/screens/registroGasto.f3.test.tsx
PRUEBA: npx vitest run
PRUEBA: npx tsc --noEmit -p tsconfig.json

- Mis 5 archivos: 92 pasan, 0 fallan.
- Suite completa (incluidas las de A): 149 pasan, 0 fallan. La corrí 5 veces seguidas y salió en verde las 5.
- `tsc --noEmit`: sin errores (código de salida 0).

### Fallos vistos y qué se hizo

- Mío, ya corregido: `registroGasto.f3.test.tsx` › «cerrar la hoja con datos…» falló 1 vez de 5. La prueba comprobaba el cierre de la hoja de forma síncrona. Al pulsar «Descartar», la app primero borra el borrador en IndexedDB y después cierra la hoja. Ahora la prueba espera el cierre con `waitFor`. No es un bug de A.
- De A, sin tocar: `src/App.test.tsx` › «bienvenida de 3 pasos y saldo inicial que cuenta en caja pero no en Ganado» falló 1 vez de 8 corridas de la suite completa. No pude reproducirlo después. Es posible que A estuviera editando ese archivo en ese momento. A tiene que confirmar si es intermitente.

### Riesgo de intermitencia

- Criterio 2 («la hoja se cierra en menos de 300 ms»): se mide en jsdom desde el clic hasta que la hoja desaparece. Tardó menos de 300 ms en todas las corridas. Si la máquina está muy cargada, podría pasar del límite. No lo medí en un navegador real.

## Bugs de A

No encontré ninguno: todos los criterios cubiertos pasan.

## Notas para A (sin aplicar)

- No hacen falta dependencias ni exportaciones nuevas.
- Las pruebas de interfaz dependen de estos nombres accesibles: «Registrar», «Importe», «Fecha», «Guardar gasto», «Más categorías», «Deshacer», `data-testid` `en-caja`/`ganado` con `data-valor`, y la etiqueta de cada fila «Gasolina, − 38,50 €. Editar». Si cambian, hay que ajustar las pruebas.
- Lo que dice la especificación y no se prueba aquí (fuera del alcance de B): ventana de 7 días para fechas futuras, foto del ticket, deslizar para eliminar.

RESUMEN: 92 pruebas nuevas cubren los criterios 1, 2, 3 y 8: importes en céntimos y formato español, cálculo de En caja y Ganado, y registro de gasto con deshacer, borrador, importes atípicos, edición y borrado. Todas pasan, igual que la suite completa.

ESTADO: pruebas de gastos y cifras listo para integrar
