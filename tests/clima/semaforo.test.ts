import { describe, expect, it } from 'vitest';
import { ESTADOS, MOTIVOS, evaluarVisita } from '../../src/clima/semaforo';
import { horasDeFranja, sumarHoras } from '../../src/clima/horas';
import type { AvisoOficial, HoraClima, Prevision, VisitaClima } from '../../src/clima/tipos';
import { claveDia, sumarDias } from '../../src/lib/fechas';

// Motor del semáforo (§11.2–§11.4): una prueba por regla de la tabla §11.3, las comunes y los criterios 14–18 de §18.

const AHORA = new Date('2026-11-07T08:00:00Z'); // sábado 7, 09:00 en Madrid
const HOY = claveDia(AHORA);
const DIA = sumarDias(HOY, 2); // lunes 9
const U = { lat: 40.42, lon: -3.7 };

/** Previsión tranquila (sol, 20°, sin viento) de ayer a hoy + 15, con cambios por hora. */
function prevision(cambios: Record<string, Partial<HoraClima>> = {}, base: Partial<HoraClima> = {}): Prevision {
  const horas: HoraClima[] = [];
  for (let d = -1; d < 16; d++) {
    for (let h = 0; h < 24; h++) {
      const hora = `${sumarDias(HOY, d)}T${String(h).padStart(2, '0')}`;
      horas.push({ hora, prob_precipitacion: 0, precipitacion: 0, codigo_wmo: 0, temperatura: 20, viento: 5, rachas: 8, ...base, ...cambios[hora] });
    }
  }
  return { ubicacion: U, horas, dias: [], actualizado_en: AHORA.toISOString(), fuente: 'prueba' };
}
/** Mismos cambios en varias horas de DIA ("09".."10"). */
const en = (horas: string[], c: Partial<HoraClima>, dia = DIA) => Object.fromEntries(horas.map((h) => [`${dia}T${h}`, c]));
const visita = (tipos: string[], extra: Partial<VisitaClima> = {}): VisitaClima => ({ fecha: DIA, hora_inicio: '09:00', duracion: 120, tipos_trabajo: tipos, ...extra });
const evaluar = (v: VisitaClima, p: Prevision | null = prevision(), avisos: AvisoOficial[] = []) => evaluarVisita({ visita: v, ubicacion: U, prevision: p, avisos, ahora: AHORA });

describe('Franja de evaluación (§11.2)', () => {
  it('cubre de la hora de inicio a la del último minuto; sin hora se toma 09:00', () => {
    expect(horasDeFranja(DIA, '09:00', 120)).toEqual([`${DIA}T09`, `${DIA}T10`]);
    expect(horasDeFranja(DIA, '09:30', 60)).toEqual([`${DIA}T09`, `${DIA}T10`]);
    expect(horasDeFranja(DIA, null, 60)).toEqual([`${DIA}T09`]);
    expect(horasDeFranja(DIA, '23:00', 120)).toEqual([`${DIA}T23`, `${sumarDias(DIA, 1)}T00`]);
    expect(sumarHoras(`${DIA}T02`, -3)).toBe(`${sumarDias(DIA, -1)}T23`);
  });
});

describe('Verde y textos (§11.4)', () => {
  it('sin nada en contra: «Se puede ir · Sol, 22°»', () => {
    const s = evaluar(visita(['corte_cesped']), prevision(en(['09', '10'], { temperatura: 21.6 })));
    expect(s).toMatchObject({ nivel: 'verde', estado: 'Se puede ir', etiqueta: 'Se puede ir · Sol, 22°', orientativo: false });
    expect(s.consejo).toBeUndefined();
  });
  it('todas las etiquetas caben en 40 caracteres', () => {
    const casos = [
      evaluar(visita(['corte_cesped']), prevision(en(['09', '10'], { prob_precipitacion: 90, precipitacion: 4 }))),
      evaluar(visita(['setos_poda']), prevision(en(['09'], { rachas: 70 }))),
      evaluar(visita(['plantacion']), prevision({}, { temperatura: -3 })),
      evaluar(visita(['piscina']), prevision(), [{ fecha: DIA, nivel: 'naranja', fenomeno: 'tormenta' }]),
      evaluar(visita(['corte_cesped']), prevision(en(['00', '01', '02', '03', '04', '05', '06', '07', '08'], { precipitacion: 0.7 }))),
    ];
    for (const s of casos) expect(s.etiqueta.length).toBeLessThanOrEqual(40);
  });
});

describe('Corte de césped y desbroce (§11.3)', () => {
  it('criterio 14: 80 % y 3 mm/h en la franja → rojo con «Mejor mover»', () => {
    const s = evaluar(visita(['corte_cesped']), prevision(en(['09', '10'], { prob_precipitacion: 80, precipitacion: 3, codigo_wmo: 63 })));
    expect(s.nivel).toBe('rojo');
    expect(s.estado).toBe('Mejor mover');
    expect(s.etiqueta).toBe('Mejor mover · Lluvia toda la mañana');
  });
  it('rojo con ≥ 5 mm acumulados en las 12 h previas (césped mojado)', () => {
    const s = evaluar(visita(['desbroce']), prevision(en(['00', '01', '02', '03', '04'], { precipitacion: 1.2 })));
    expect(s.nivel).toBe('rojo');
    expect(s.causas[0]).toMatchObject({ tipo: 'cesped_mojado', valor: 6, regla: 'cesped.rojo.mojado' });
    expect(s.etiqueta).toBe('Mejor mover · Césped mojado (6 mm antes)');
  });
  it('ámbar con prob. 30–59 %, y con lluvia en parte de la franja (con consejo de empezar antes)', () => {
    expect(evaluar(visita(['corte_cesped']), prevision(en(['10'], { prob_precipitacion: 45 }))).etiqueta).toBe('Posible lluvia (45%)');
    const v = visita(['corte_cesped'], { hora_inicio: '11:00', duracion: 120 });
    const s = evaluar(v, prevision(en(['12'], { prob_precipitacion: 40, precipitacion: 0.5 })));
    expect(s).toMatchObject({ nivel: 'ambar', estado: 'Con cuidado', etiqueta: 'Lluvia a partir de las 12:00' });
    expect(s.consejo).toBe('Empieza a las 10:00 para acabar antes de la lluvia');
    expect(s.propuesta).toEqual({ hora: '10:00' });
  });
  it('el consejo de empezar antes no se da si el hueco no está libre o sería antes de las 07:00', () => {
    const p = prevision(en(['12'], { prob_precipitacion: 40, precipitacion: 0.5 }));
    const v = visita(['corte_cesped'], { hora_inicio: '11:00', duracion: 120 });
    expect(evaluarVisita({ visita: v, ubicacion: U, prevision: p, ahora: AHORA, huecoLibre: () => false }).consejo).toBeUndefined();
    const temprano = visita(['corte_cesped'], { hora_inicio: '07:00', duracion: 120 });
    expect(evaluar(temprano, prevision(en(['08'], { prob_precipitacion: 40, precipitacion: 0.5 }))).consejo).toBeUndefined();
  });
  it('58 % sin lluvia es ámbar, 60 % con 0,9 mm/h no llega a rojo', () => {
    expect(evaluar(visita(['corte_cesped']), prevision(en(['09'], { prob_precipitacion: 60, precipitacion: 0.9 }))).nivel).toBe('ambar');
    expect(evaluar(visita(['corte_cesped']), prevision(en(['09'], { prob_precipitacion: 29 }))).nivel).toBe('verde');
  });
});

describe('Setos y poda', () => {
  it('rojo con rachas ≥ 50 o viento medio ≥ 40; ámbar con rachas 30–49 o prob. ≥ 60 %', () => {
    expect(evaluar(visita(['setos_poda']), prevision(en(['10'], { rachas: 50 }))).etiqueta).toBe('Mejor mover · Rachas de 50 km/h');
    expect(evaluar(visita(['setos_poda']), prevision(en(['10'], { viento: 40, rachas: 45 }))).nivel).toBe('rojo');
    const a = evaluar(visita(['setos_poda']), prevision(en(['10'], { rachas: 30 })));
    expect(a).toMatchObject({ nivel: 'ambar', etiqueta: 'Rachas de 30 km/h desde las 10:00' });
    expect(evaluar(visita(['setos_poda']), prevision(en(['09'], { prob_precipitacion: 60 }))).nivel).toBe('ambar');
    expect(evaluar(visita(['setos_poda']), prevision(en(['09'], { prob_precipitacion: 59, rachas: 29 }))).nivel).toBe('verde');
  });
});

describe('Fitosanitarios', () => {
  it('rojo con viento ≥ 20 o prob. ≥ 50 % en la franja o las 6 h siguientes', () => {
    expect(evaluar(visita(['fitosanitarios']), prevision(en(['09'], { viento: 20 }))).nivel).toBe('rojo');
    const lava = evaluar(visita(['fitosanitarios']), prevision(en(['16'], { prob_precipitacion: 55 }))); // 10:59 + 6 h
    expect(lava).toMatchObject({ nivel: 'rojo', etiqueta: 'Mejor mover · Lluvia desde las 16:00' });
    expect(evaluar(visita(['fitosanitarios']), prevision(en(['17'], { prob_precipitacion: 55 }))).nivel).toBe('verde'); // fuera de las 6 h
  });
  it('ámbar con viento 12–19 o temperatura > 30 °C', () => {
    expect(evaluar(visita(['fitosanitarios']), prevision(en(['10'], { viento: 12 }))).etiqueta).toBe('Viento de 12 km/h desde las 10:00');
    expect(evaluar(visita(['fitosanitarios']), prevision(en(['10'], { temperatura: 31 }))).nivel).toBe('ambar');
    expect(evaluar(visita(['fitosanitarios']), prevision(en(['10'], { viento: 11, temperatura: 30 }))).nivel).toBe('verde');
  });
});

describe('Plantación', () => {
  it('rojo con mínima ≤ 0 °C el día o la noche siguiente (helada)', () => {
    const s = evaluar(visita(['plantacion']), prevision({ [`${sumarDias(DIA, 1)}T05`]: { temperatura: -1 } }));
    expect(s).toMatchObject({ nivel: 'rojo', etiqueta: 'Mejor mover · Helada (-1°)' });
    // A las 09:00 del día siguiente ya no es «la noche siguiente».
    expect(evaluar(visita(['plantacion']), prevision({ [`${sumarDias(DIA, 1)}T09`]: { temperatura: -1 } })).nivel).toBe('verde');
  });
  it('ámbar con ≥ 10 mm en el día', () => {
    const s = evaluar(visita(['plantacion']), prevision(en(['16', '17', '18', '19', '20'], { precipitacion: 2 })));
    expect(s).toMatchObject({ nivel: 'ambar', etiqueta: 'Lluvia en el día (10 mm)' });
  });
});

describe('Abonado, riego, piscina y resto', () => {
  it('abonado: rojo con ≥ 70 % y ≥ 5 mm/h; ámbar con 40–69 %', () => {
    expect(evaluar(visita(['abonado']), prevision(en(['09'], { prob_precipitacion: 70, precipitacion: 5 }))).nivel).toBe('rojo');
    expect(evaluar(visita(['abonado']), prevision(en(['09'], { prob_precipitacion: 70, precipitacion: 4.9 }))).nivel).toBe('ambar');
    expect(evaluar(visita(['abonado']), prevision(en(['09'], { prob_precipitacion: 39 }))).nivel).toBe('verde');
  });
  it('riego: rojo con tormenta; ámbar con prob. ≥ 60 %', () => {
    expect(evaluar(visita(['riego']), prevision(en(['10'], { codigo_wmo: 95 }))).etiqueta).toBe('Mejor mover · Tormenta a las 10:00');
    expect(evaluar(visita(['riego']), prevision(en(['10'], { prob_precipitacion: 60 }))).nivel).toBe('ambar');
  });
  it('criterio 15: piscina con lluvia ligera (1 mm/h) → verde; con ≥ 2,5 mm/h → ámbar', () => {
    expect(evaluar(visita(['piscina']), prevision(en(['09', '10'], { prob_precipitacion: 90, precipitacion: 1, codigo_wmo: 61 }))).nivel).toBe('verde');
    expect(evaluar(visita(['piscina']), prevision(en(['10'], { prob_precipitacion: 90, precipitacion: 2.5 }))).nivel).toBe('ambar');
  });
  it('piscina: rojo con tormenta o aviso naranja o rojo', () => {
    expect(evaluar(visita(['piscina']), prevision(en(['09'], { codigo_wmo: 96 }))).nivel).toBe('rojo');
    expect(evaluar(visita(['piscina']), prevision(), [{ fecha: DIA, nivel: 'rojo', fenomeno: 'lluvia' }]).nivel).toBe('rojo');
  });
  it('limpieza general y otro: rojo con ≥ 70 % y ≥ 2 mm/h; ámbar con 40–69 %', () => {
    expect(evaluar(visita(['limpieza_general']), prevision(en(['09'], { prob_precipitacion: 75, precipitacion: 2 }))).nivel).toBe('rojo');
    expect(evaluar(visita(['otro']), prevision(en(['09'], { prob_precipitacion: 69 }))).nivel).toBe('ambar');
    expect(evaluar(visita([]), prevision(en(['09'], { prob_precipitacion: 40 }))).nivel).toBe('ambar');
  });
});

describe('Reglas comunes (§11.3)', () => {
  it('tormenta (WMO 95, 96, 99) en la franja → rojo para cualquier tipo', () => {
    for (const codigo of [95, 96, 99]) expect(evaluar(visita(['piscina']), prevision(en(['10'], { codigo_wmo: codigo }))).nivel).toBe('rojo');
  });
  it('calor: ≥ 40 °C rojo; ≥ 35 °C ámbar con consejo de pasar a primera hora (08:00)', () => {
    const rojo = evaluar(visita(['piscina']), prevision(en(['10'], { temperatura: 40 })));
    expect(rojo).toMatchObject({ nivel: 'rojo', etiqueta: 'Mejor mover · 40° de calor', consejo: 'Pasa a primera hora por el calor', propuesta: { hora: '08:00' } });
    const ambar = evaluar(visita(['corte_cesped']), prevision(en(['10'], { temperatura: 35.2 })));
    expect(ambar).toMatchObject({ nivel: 'ambar', etiqueta: 'Calor de 35°', consejo: 'Pasa a primera hora por el calor' });
  });
  it('criterio 17: aviso AEMET naranja en la zona y fecha → rojo; amarillo → al menos ámbar; otro día no cuenta', () => {
    const naranja = evaluar(visita(['corte_cesped']), prevision(), [{ fecha: DIA, nivel: 'naranja', fenomeno: 'viento' }]);
    expect(naranja).toMatchObject({ nivel: 'rojo', etiqueta: 'Mejor mover · Aviso naranja por viento' });
    expect(evaluar(visita(['corte_cesped']), prevision(), [{ fecha: DIA, nivel: 'amarillo', fenomeno: 'calor' }])).toMatchObject({ nivel: 'ambar', etiqueta: 'Aviso amarillo por calor' });
    expect(evaluar(visita(['corte_cesped']), prevision(), [{ fecha: sumarDias(DIA, 1), nivel: 'rojo', fenomeno: 'lluvia' }]).nivel).toBe('verde');
  });
  it('criterio 16: poda y fitosanitarios con viento de 25 km/h → rojo (gana el más restrictivo)', () => {
    const s = evaluar(visita(['setos_poda', 'fitosanitarios']), prevision(en(['09', '10'], { viento: 25, rachas: 28 })));
    expect(s.nivel).toBe('rojo');
    expect(s.causas.map((c) => c.regla)).toEqual(['fitosanitarios.rojo.viento']);
  });
  it('viento a la tarde con fitosanitarios y poda: «Fumiga primero y deja la poda para el final»', () => {
    const v = visita(['setos_poda', 'fitosanitarios'], { hora_inicio: '14:00', duracion: 240 });
    const s = evaluar(v, prevision({ ...en(['14', '15'], { viento: 6 }), ...en(['16', '17'], { viento: 15, rachas: 20 }) }));
    expect(s).toMatchObject({ nivel: 'ambar', consejo: 'Fumiga primero y deja la poda para el final' });
  });
});

describe('Sin semáforo (§11.3)', () => {
  it('criterio 18: a más de 7 días vista no se calcula: «Previsión orientativa»', () => {
    const lejos = evaluarVisita({ visita: visita(['corte_cesped'], { fecha: sumarDias(HOY, 7) }), ubicacion: U, prevision: prevision(), ahora: AHORA });
    expect(lejos).toMatchObject({ nivel: 'gris', estado: ESTADOS.orientativo, etiqueta: 'Previsión orientativa', orientativo: true, causas: [] });
    const dia7 = evaluarVisita({ visita: visita(['corte_cesped'], { fecha: sumarDias(HOY, 6) }), ubicacion: U, prevision: prevision(), ahora: AHORA });
    expect(dia7.orientativo).toBe(false);
  });
  it('sin coordenadas: gris «Sin previsión» con «Falta la dirección del cliente»', () => {
    const s = evaluarVisita({ visita: visita(['piscina']), ubicacion: null, prevision: prevision(), ahora: AHORA });
    expect(s).toMatchObject({ nivel: 'gris', estado: 'Sin previsión', etiqueta: 'Sin previsión', motivo: MOTIVOS.sinUbicacion });
  });
  it('sin previsión (sin conexión o proveedor caído): gris con el motivo recibido', () => {
    expect(evaluarVisita({ visita: visita(['piscina']), ubicacion: U, prevision: null, ahora: AHORA }).motivo).toBe('Sin conexión');
    expect(evaluarVisita({ visita: visita(['piscina']), ubicacion: U, prevision: null, ahora: AHORA, motivoSinPrevision: 'El servicio del tiempo no responde' }).motivo).toBe('El servicio del tiempo no responde');
  });
  it('previsión que no cubre la franja: gris «Aún no hay previsión para ese día»', () => {
    const corta = prevision();
    corta.horas = corta.horas.filter((h) => h.hora < `${DIA}T10`);
    expect(evaluar(visita(['piscina']), corta)).toMatchObject({ nivel: 'gris', motivo: MOTIVOS.sinDatosDia });
  });
});
