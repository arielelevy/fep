# Ola 6 · Frente A · Motor de semáforo y proveedor de clima

Objetivo: FERGO · Especificación funcional y de diseño de la app de gestión. Esta parte es lógica y dominio; la interfaz es del frente B.

Archivos de este frente: `src/clima/` y `tests/clima/`. Los temporales de trabajo quedan en `.temp/a/`. No toqué nada más.

## Lo hecho

### Interfaz de proveedor y proveedor simulado

- **Interfaz** (`src/clima/tipos.ts`): `ProveedorClima` con `prevision(ubicacion, dias, señal)` (horaria y diaria, hasta 16 días) y `avisos(ubicacion, desde, hasta)`. La implementación real (Open-Meteo y AEMET) se enchufa con `configurarClima(...)` sin tocar el motor (§13.2).
- **Variables por hora** (§11.1): probabilidad de lluvia, mm, código WMO, temperatura, viento medio y rachas. Las horas son locales de Madrid.
- **Proveedor simulado** (`src/clima/proveedorSimulado.ts`):
  - Datos **deterministas**: la misma ubicación, día y hora dan siempre el mismo valor.
  - Temperaturas verosímiles para Madrid según el mes.
  - Coordenadas redondeadas a 2 decimales (§11.1, §16.5).
  - Incluye el día anterior, porque la regla de césped mira las 12 h previas.
  - Admite escenarios, avisos y fallos inyectables para pruebas y demostraciones.
  - Marca `fuente: 'simulada'`, así que el semáforo lleva `simulado: true`.

### Motor del semáforo (`src/clima/semaforo.ts`, función pura `evaluarVisita`)

- **Franja de cada visita** (§11.2): de la hora de inicio a la del último minuto, y 09:00 si la visita no tiene hora. Según el tipo de trabajo se amplía:
  - césped: las 12 h previas;
  - fitosanitarios: las 6 h siguientes;
  - plantación: el día y la noche siguiente.
- **Reglas de §11.3:** las 8 filas por tipo de trabajo y las comunes (tormenta WMO 95, 96 y 99; calor de 40 y 35 °C; aviso amarillo, naranja o rojo). Con varios tipos de trabajo gana el color más restrictivo. Los umbrales están juntos en `UMBRALES`, porque la especificación los da como valores iniciales configurables (§20.8).
- **Textos de §11.4 y §17:**
  - **Estado** siempre con texto, nunca solo color: «Se puede ir», «Con cuidado», «Mejor mover», «Sin previsión» y «Previsión orientativa».
  - **Etiqueta** de 40 caracteres como máximo, por ejemplo «Se puede ir · Sol, 22°», «Lluvia a partir de las 13:00», «Viento de 12 km/h desde las 10:00» o «Mejor mover · Lluvia toda la mañana».
  - Tono neutro.
- **Consejos por reglas, sin IA:**
  - «Empieza a las HH:MM para acabar antes de la lluvia», solo si el hueco está libre y no es antes de las 07:00.
  - «Fumiga primero y deja la poda para el final».
  - «Pasa a primera hora por el calor», con la propuesta de las 08:00.
- **Sin semáforo:**
  - visita a 7 días o más: «Previsión orientativa»;
  - sin coordenadas: gris «Sin previsión» con el motivo «Falta la dirección del cliente»;
  - sin previsión: gris con su motivo («Sin conexión», «El servicio del tiempo no responde»);
  - la previsión no cubre la franja: «Aún no hay previsión para ese día».

### Caché y «Sin previsión» (`src/clima/servicio.ts`)

- **Guardado:** la previsión se guarda con su hora en `localStorage`, y si no está disponible queda en memoria.
- **Refresco:** si la previsión guardada tiene menos de 3 h se usa sin consultar. Si tiene más y hay conexión, se refresca (§11.1).
- **Sin conexión, proveedor caído o con espera de más de 8 s:** se usa la última guardada, con su motivo. Si no hay ninguna, el estado es `sin_datos` y la agenda no se rompe.
- **Consultas simultáneas** del mismo punto: se hace una sola (agrupación de §11.1).
- **Textos:** «Actualizado hace N h» si la previsión tiene más de 3 h (§14.6).
- **Franja de 14 días:** `diasPrevision` da para cada día el día abreviado, el número, el icono, la máxima y la probabilidad de lluvia, con los días 8 a 14 marcados como orientativos. Usa la ubicación de referencia, el centro de Madrid (§11.1).

### API para el frente B (`src/clima/index.ts`)

- **`useSemaforoVisita(visita, ubicacion, huecoLibre?)`:** devuelve `{ semaforo, cargando, actualizado }`. Pinta al instante con lo guardado y refresca en segundo plano.
- **`usePrevision14Dias(ubicacion?)`:** devuelve `{ dias, cargando, estado, motivo, actualizado }`.
- **Funciones y tipos:** `usePrevision`, `evaluarVisita`, `configurarClima`, `crearServicioClima` y `crearProveedorSimulado`, con todos los tipos exportados.
- Le pasé las firmas al frente B.
- **Proveedor por defecto:** el simulado **solo** en desarrollo, en pruebas o si se activa a mano (`localStorage fergo.clima.simulado = 1`). En el build de producción no hay proveedor y todo sale «Sin previsión», en vez de mostrar un tiempo inventado (ver la decisión de abajo).

## Supuestos (la especificación no los fija; documentados también en `semaforo.ts`)

- **S1.** Hay lluvia en una hora si la precipitación es de al menos 0,1 mm.
- **S2.** «Prob. ≥ X % con ≥ Y mm/h» se cumple en una misma hora de la franja.
- **S3.** La probabilidad de lluvia de una franja es la máxima de sus horas.
- **S4.** Las 12 h previas (césped mojado) se aplican a toda la fila «Corte de césped, desbroce».
- **S5.** En plantación, «la noche siguiente» llega hasta las 08:00 del día siguiente.
- **S6.** «≥ 10 mm en el día» se suma sobre las 24 horas del día de la visita.
- **S7.** Los umbrales de viento usan el viento medio; las rachas, solo donde la tabla las nombra.
- **S8.** «Más de 7 días vista» significa del día hoy + 7 en adelante: los días 8 a 14 de la franja.
- **S9.** El consejo «Empieza a las …» solo se da desde las 07:00.
- **S10.** En las etiquetas, el ámbar se nombra «Con cuidado», tomado del encabezado «se puede, con matiz» de §11.3.
- **S11.** Las horas de la previsión son locales de Madrid, tal como las devuelve Open-Meteo con `timezone=Europe/Madrid` (§13.2).

## Pruebas

- **`tests/clima/semaforo.test.ts` (27):**
  - franja de evaluación;
  - una prueba por regla de cada fila de §11.3, con sus límites, y las comunes;
  - criterios 14 a 18 de §18 (el 17 solo en el semáforo; la alerta es de otra ola);
  - consejos y etiquetas de 40 caracteres como máximo;
  - visita orientativa, sin coordenadas, sin previsión y sin datos para ese día.
- **`tests/clima/servicio.test.tsx` (13):**
  - proveedor simulado: determinista, redondeo, 16 días, escenarios, avisos y fallo;
  - caché: menos de 3 h, refresco pasadas 3 h, sin conexión, proveedor caído y lento, sin proveedor, consulta única y localStorage;
  - «Actualizado hace …» y franja de 14 días;
  - hooks `useSemaforoVisita` y `usePrevision14Dias`.
- **Configuración propia:** `tests/clima/vitest.config.ts`, porque `vite.config.ts` no es de este frente y solo incluye `src/**`. Lleva también un `tsconfig.json` para comprobar los tipos de las pruebas.

PRUEBA: node node_modules/vitest/vitest.mjs run --config tests/clima/vitest.config.ts
PRUEBA: node node_modules/typescript/bin/tsc -p tests/clima
PRUEBA: node scripts/verificar.mjs

**Resultado real:**
- Pruebas del clima: código 0, 2 archivos y 40 pruebas.
- `tsc -p tests/clima`: código 0.
- `node scripts/verificar.mjs`: código 0. Tipos de toda la app, 28 archivos y 315 pruebas de la suite previa, build y PWA. No se rompió nada.

## Pendiente (fuera de este frente)

- Proveedor real (Open-Meteo, con licencia comercial por verificar, §13.2) y avisos AEMET reales, con la asignación de zonas.
- Refresco en servidor cada 3 h y cada 12 h (§11.1). En el cliente se refresca al abrir si la previsión tiene más de 3 h.
- Interfaz: Agenda, Hoy y Detalle muestran el semáforo (frente B).
- Alertas de clima (`CLIMA_INFO`, `CLIMA_DECIDIR`, `CLIMA_AEMET`), en la ola de alertas.
- Las coordenadas de los clientes dependen de la geocodificación (frente B). Sin coordenadas, el semáforo dice «Falta la dirección del cliente».

DECISIÓN: Mientras no esté el proveedor real del tiempo, ¿qué muestra la app instalada en el móvil de Felipe? | «Sin previsión» en todas las visitas (no inventar el tiempo) | Datos simulados marcados como «de prueba»

RESUMEN: Ya existe el motor que decide si una visita «se puede ir», va «con cuidado» o es «mejor moverla» según el tiempo y el tipo de trabajo, con sus textos y consejos, más un proveedor del tiempo simulado y la caché. El proveedor real se podrá enchufar sin cambiar el motor. Hay 40 pruebas nuevas, todas en verde, y la suite anterior sigue en verde.

ESTADO: Motor de semáforo y proveedor de clima listo para integrar
