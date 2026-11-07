# Ola 2: Base de la app y registro de gastos

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión

Ficha escrita por Factory desde el registro de progreso de la ola (propuesta sin Markdown).

## Alcance

Primer corte vertical usable: instalar la PWA, abrir Hoy y registrar un gasto con deshacer y cifras, guardando local. Es el núcleo del uso diario.

## Por qué

Primer corte vertical usable: instalar la PWA, abrir Hoy y registrar un gasto con deshacer y cifras, guardando local. Es el núcleo del uso diario.

## Logros

- App instalable con navegación, tema y almacenamiento local
- Registrar un gasto en 3 toques con deshacer
- Pruebas de gastos y cifras

## Feature: App instalable con navegación, tema y almacenamiento local

- Proyecto React+TS+Vite con PWA, fuente autoalojada y barra inferior
- Capa de datos local con IndexedDB, UUID, borrado lógico y céntimos
- Saldo inicial y pantalla Hoy con En caja y Ganado

## Feature: Registrar un gasto en 3 toques con deshacer

- Hoja Registrar tipo Gasto con importe, categorías por frecuencia y borrador
- Categorías iniciales, barra Deshacer 8 s y confirmación de importes atípicos
- Listado de Movimientos por mes con editar y eliminar

## Feature: Pruebas de gastos y cifras

- Cubrir criterios 1, 2, 3 y 8
- Pruebas de cálculo de En caja y Ganado
