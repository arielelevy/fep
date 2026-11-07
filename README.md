# FERGO · App de gestión

PWA para llevar el día a día de FERGO desde el móvil: registrar gastos en 3 toques, ver lo que hay en caja y lo ganado en el mes. Los datos se guardan en el propio dispositivo (IndexedDB); todavía no hay servidor.

Estado: ola 2 (base de la app y registro de gastos). Cobros, clientes, agenda, alertas e informes llegan en olas posteriores. La app sigue siendo una PWA: el pasaje a app Android nativa está documentado, no ejecutado (ver [migración a Android](docs/migracion-android.md)).

## Qué hace hoy

- Se instala como app (manifiesto, iconos y service worker con la app y la fuente en precache).
- **Hoy**: En caja (con desglose efectivo/banco), Ganado en el mes, En fianzas y Aportes; bienvenida y saldo inicial en el primer uso.
- **Registrar gasto**: importe en céntimos, categorías ordenadas por uso en 60 días, último medio de pago, foto del ticket, borrador, confirmación de importes atípicos y «Deshacer» durante 8 s.
- **Movimientos**: lista del mes con filtros, editar y eliminar (borrado lógico) con deshacer.

## Uso

Probado con Node 26 y npm 11.

```
npm ci
npm run dev        # servidor de desarrollo
npm test           # pruebas (Vitest + jsdom + fake-indexeddb)
npm run build      # build de producción en dist/
npm run verificar  # tipos, pruebas, build y comprobación de la PWA
```

`node scripts/verificar.mjs` es la verificación completa de la ola; si falta `node_modules`, ejecuta antes `npm ci`.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/screens/` | Pantallas: Hoy, Registrar, Movimientos, Saldo inicial, Guía de instalación, marcadores |
| `src/components/` | Barra inferior, Deshacer, diálogos, cifras animadas, iconos |
| `src/domain/` | Tipos, categorías iniciales, cálculo de cifras y orden de categorías |
| `src/db/` | IndexedDB con Dexie: esquema, siembra y repositorio |
| `src/lib/` | Dinero (céntimos y formato es-ES), fechas en Madrid, imágenes, hooks |
| `src/styles/` | Tokens de diseño y estilos |
| `scripts/` | `verificar.mjs` y `generar-iconos.mjs` |
| `public/` | Iconos de la PWA |

## Documentación

- [Referencia escrita de la maqueta](docs/maqueta.md), a partir de `FERGO App Mockups.pdf`.
- [Pasaje a app Android nativa con Capacitor](docs/migracion-android.md): requisitos, pasos, compilación, recorrido de aceptación y decisiones pendientes (documentado, no ejecutado).
- Informes de cada ola en [`review/factory/`](review/factory/): ficha, informes de los frentes y QA.
