# Umbrales que la especificación no fija

Están como constantes en `UMBRALES_ALERTAS` (`catalogo.ts`), en un solo lugar. Los del semáforo por tipo de trabajo (§11.3) están en `UMBRALES` de `src/clima`.

1. **Hora razonable al proponer mover** (§10.7): supuse que la visita empiece entre las 08:00 y las 18:00 y acabe como tarde a las 20:00, con huecos cada 30 min. ¿Le sirve a Felipe?
2. **Hasta cuándo buscar días** para mover: supuse dentro de la franja de 14 días. Desde el día 8 la previsión es orientativa y esos días van detrás de los verdes.
3. **Orden de los días propuestos**: verde, después «Sin previsión» u orientativo, y después ámbar; nunca rojo. La spec dice «verde (o ámbar si no hay verdes)». Como la app real aún no tiene previsión, puse «Sin previsión» antes que ámbar.
4. **Horas ofrecidas por día**: supuse 4, más «Otra».
5. **Antelación de CLIMA_INFO**: la spec dice «5 días antes». Lo tomé como «a 5 días o menos», así que una visita que pasa a ámbar a 3 días también avisa una vez.
6. **Aviso AEMET y semáforo**: un aviso amarillo pone la alerta en ámbar, salvo que el semáforo ya sea rojo. Naranja o rojo la ponen en rojo.
7. **Nivel «urgente»**: el catálogo de clima de §12.2 no lo usa. Queda para FURGO_RESERVAR a 1 día, de otra ola.
