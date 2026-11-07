// Pruebas de las piezas de interfaz del clima (ola 6, frente B): textos de la línea de semáforo en cada estado,
// hueco libre, datos de la franja, hora de actualización, y guardas de accesibilidad de los estilos
// (§5.6: contraste ≥ 4,5:1, zonas táctiles ≥ 44 pt, texto en rem para el 130 %, «Reducir movimiento»).
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Prevision, Semaforo } from '../../src/clima';
import { LineaSemaforoVista } from '../../src/agenda/clima/LineaSemaforo';
import { SemaforoDetalleVista } from '../../src/agenda/clima/SemaforoDetalle';
import {
  datosFranja,
  huecoLibrePara,
  textoAccesibleDia,
  textoHoraActualizacion,
  textoLinea,
  textoLineaPlano,
  TEXTO_ORIENTATIVO,
  ubicacionDe,
} from '../../src/agenda/clima/semaforoVisita';
import type { Visita } from '../../src/domain/tipos';
import { desdeMadrid } from '../../src/lib/fechas';

const base: Pick<Semaforo, 'causas' | 'calculado_en' | 'orientativo'> = { causas: [], calculado_en: '2026-11-07T09:00:00.000Z', orientativo: false };
const S: Record<string, Semaforo> = {
  verde: { ...base, nivel: 'verde', estado: 'Se puede ir', etiqueta: 'Se puede ir · Sol, 22°' },
  ambar: { ...base, nivel: 'ambar', estado: 'Con cuidado', etiqueta: 'Lluvia a partir de las 13:00', consejo: 'Empieza a las 08:00 para acabar antes de la lluvia' },
  rojo: { ...base, nivel: 'rojo', estado: 'Mejor mover', etiqueta: 'Mejor mover · Lluvia toda la mañana' },
  gris: { ...base, nivel: 'gris', estado: 'Sin previsión', etiqueta: 'Sin previsión', motivo: 'Falta la dirección del cliente' },
  orientativo: { ...base, nivel: 'gris', estado: 'Previsión orientativa', etiqueta: 'Previsión orientativa', orientativo: true },
};

describe('Línea de semáforo: estado siempre en palabras (§5.6.3, §11.4, §17)', () => {
  it('textoLinea en cada estado', () => {
    expect(textoLinea(S.verde)).toEqual({ estado: 'Se puede ir', detalle: 'Sol, 22°' });
    expect(textoLinea(S.ambar)).toEqual({ estado: 'Con cuidado', detalle: 'Lluvia a partir de las 13:00' });
    expect(textoLinea(S.rojo)).toEqual({ estado: 'Mejor mover', detalle: 'Lluvia toda la mañana' });
    expect(textoLinea(S.gris)).toEqual({ estado: 'Sin previsión', detalle: 'Falta la dirección del cliente' });
    expect(textoLinea(S.orientativo)).toEqual({ estado: 'Previsión orientativa', detalle: null });
    expect(textoLineaPlano(S.ambar)).toBe('Con cuidado · Lluvia a partir de las 13:00');
  });

  it.each([
    ['verde', 'Se puede ir', ' · Sol, 22°'],
    ['ambar', 'Con cuidado', ' · Lluvia a partir de las 13:00'],
    ['rojo', 'Mejor mover', ' · Lluvia toda la mañana'],
    ['gris', 'Sin previsión', ' · Falta la dirección del cliente'],
    ['orientativo', 'Previsión orientativa', null],
  ])('pinta %s con punto decorativo y texto «%s»', (clave, estado, detalle) => {
    const { container } = render(<LineaSemaforoVista semaforo={S[clave]} />);
    const linea = container.querySelector('.linea-semaforo')!;
    expect(linea.getAttribute('data-nivel')).toBe(clave);
    expect(screen.getByText(estado)).toBeTruthy();
    expect(linea.textContent).toBe(estado + (detalle ?? ''));
    if (!detalle) expect(linea.querySelector('.detalle')).toBeNull();
    const punto = linea.querySelector('.punto-semaforo')!;
    expect(punto.getAttribute('aria-hidden')).toBe('true');
    expect(punto.getAttribute('data-nivel')).toBe(clave);
    // Sin signos de exclamación ni culpas (§17).
    expect(linea.textContent).not.toMatch(/!/);
  });

  it('consejo opcional en texto secundario («Consejo: …», §10.5.4)', () => {
    render(<LineaSemaforoVista semaforo={S.ambar} conConsejo />);
    expect(screen.getByText('Consejo: Empieza a las 08:00 para acabar antes de la lluvia')).toBeTruthy();
  });

  it('cargando: esqueleto con texto para lectores, sin afirmar «Sin previsión»', () => {
    const { container } = render(<LineaSemaforoVista semaforo={null} />);
    expect(screen.getByText('Cargando el tiempo')).toBeTruthy();
    expect(container.textContent).not.toContain('Sin previsión');
  });
});

describe('Semáforo grande del detalle (§10.6.3)', () => {
  it('estado, motivo, datos de la franja, consejo y hora de actualización', () => {
    render(
      <SemaforoDetalleVista
        semaforo={{ ...S.ambar, actualizado_en: desdeMadrid(2026, 11, 7, 9, 15).toISOString(), simulado: true }}
        datos={{ tempMin: 14, tempMax: 18, probLluvia: 45, lluvia: 1.2, viento: 12, rachas: 25 }}
        antiguedad={null}
        ahora={desdeMadrid(2026, 11, 7, 10)}
      />,
    );
    const r = screen.getByRole('region', { name: 'Tiempo de la visita' });
    expect(r.getAttribute('data-nivel')).toBe('ambar');
    expect(screen.getByText('Con cuidado')).toBeTruthy();
    expect(screen.getByText('Lluvia a partir de las 13:00')).toBeTruthy();
    expect(screen.getByText('14° a 18°')).toBeTruthy();
    expect(screen.getByText('45 % · 1,2 mm')).toBeTruthy();
    expect(screen.getByText('12 km/h · rachas 25')).toBeTruthy();
    expect(screen.getByText('Consejo: Empieza a las 08:00 para acabar antes de la lluvia')).toBeTruthy();
    expect(screen.getByText('Actualizado hoy a las 09:15 · Datos de prueba')).toBeTruthy();
  });

  it('«Sin previsión» neutro: motivo, sin datos ni consejo; más de 3 h muestra «Actualizado hace …»', () => {
    render(<SemaforoDetalleVista semaforo={{ ...S.gris, motivo: 'Sin conexión' }} datos={{ tempMin: 1, tempMax: 2, probLluvia: 0, lluvia: 0, viento: 0, rachas: 0 }} antiguedad="Actualizado hace 5 h" />);
    expect(screen.getByText('Sin previsión')).toBeTruthy();
    expect(screen.getByText('Sin conexión')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Tiempo durante la visita' })).toBeNull();
    expect(screen.getByText('Actualizado hace 5 h')).toBeTruthy();
    expect(screen.getByRole('region').textContent).not.toMatch(/!|error/i);
  });

  it('orientativo: sin semáforo, con la explicación de §10.5.2', () => {
    render(<SemaforoDetalleVista semaforo={S.orientativo} datos={null} antiguedad={null} />);
    expect(screen.getByText('Previsión orientativa')).toBeTruthy();
    expect(screen.getByText(TEXTO_ORIENTATIVO)).toBeTruthy();
  });
});

describe('Ayudas', () => {
  const v = (id: string, hora: string | null, duracion = 120, fecha = '2026-11-09', estado: Visita['estado'] = 'programada') =>
    ({ id, fecha, hora_inicio: hora, duracion, estado, eliminado_en: null }) as unknown as Visita;

  it('ubicacionDe: null sin coordenadas', () => {
    expect(ubicacionDe({ lat: 40.4, lon: -3.7 })).toEqual({ lat: 40.4, lon: -3.7 });
    expect(ubicacionDe({ lat: null, lon: -3.7 })).toBeNull();
    expect(ubicacionDe(undefined)).toBeNull();
  });

  it('huecoLibrePara: cuenta la duración de las otras visitas más 30 min de desplazamiento (§10.7)', () => {
    const yo = v('a', '12:00');
    const libre = huecoLibrePara(yo, [yo, v('b', '09:00', 120), v('c', '16:00', 60, '2026-11-09', 'cancelada'), v('d', '08:00', 60, '2026-11-10')]);
    expect(libre('11:30', '13:30')).toBe(true); // b acaba 11:00 + 30
    expect(libre('11:00', '13:00')).toBe(false);
    expect(libre('07:00', '08:30')).toBe(true); // b empieza 09:00 − 30
    expect(libre('07:00', '08:31')).toBe(false);
    expect(libre('16:00', '17:00')).toBe(true); // c está cancelada; d es de otro día
  });

  it('datosFranja: sólo las horas de la visita', () => {
    const horas = ['08', '09', '10', '11'].map((h, i) => ({
      hora: `2026-11-09T${h}`, prob_precipitacion: [90, 20, 40, 95][i], precipitacion: [5, 0, 0.4, 9][i], codigo_wmo: 0, temperatura: [5, 10, 12.4, 20][i], viento: [30, 8, 11, 40][i], rachas: [50, 15, 22, 60][i],
    }));
    const p = { ubicacion: { lat: 0, lon: 0 }, horas, dias: [], actualizado_en: '', fuente: 'simulada' } as Prevision;
    expect(datosFranja(p, { fecha: '2026-11-09', hora_inicio: '09:00', duracion: 120 })).toEqual({ tempMin: 10, tempMax: 12, probLluvia: 40, lluvia: 0.4, viento: 11, rachas: 22 });
    expect(datosFranja(p, { fecha: '2026-11-10', hora_inicio: '09:00', duracion: 60 })).toBeNull();
    expect(datosFranja(null, { fecha: '2026-11-09', hora_inicio: null, duracion: 60 })).toBeNull();
  });

  it('textoHoraActualizacion en hora de Madrid', () => {
    const ahora = desdeMadrid(2026, 11, 7, 10);
    expect(textoHoraActualizacion(desdeMadrid(2026, 11, 7, 8, 5).toISOString(), ahora)).toBe('Actualizado hoy a las 08:05');
    expect(textoHoraActualizacion(desdeMadrid(2026, 11, 6, 21).toISOString(), ahora)).toBe('Actualizado ayer a las 21:00');
    expect(textoHoraActualizacion(desdeMadrid(2026, 11, 3, 9).toISOString(), ahora)).toBe('Actualizado el 3/11 a las 09:00');
    expect(textoHoraActualizacion(undefined, ahora)).toBeNull();
  });

  it('textoAccesibleDia', () => {
    expect(textoAccesibleDia({ fecha: '2026-11-07', diaCorto: 'Sáb', numero: 7, icono: 'lluvia', max: 14.4, probLluvia: 60, orientativo: false })).toBe('Lluvia, máxima 14°, lluvia 60 %');
    expect(textoAccesibleDia(undefined)).toBe('sin previsión');
  });
});

// ---------- Guardas de accesibilidad en los estilos ----------

const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
const tokens = Object.fromEntries([...leer('src/styles/tokens.css').matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));

function luminancia(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe('Accesibilidad de los estilos del clima (§5.6)', () => {
  const css = leer('src/agenda/clima/clima.css') + leer('src/clientes/ubicacion/ubicacion.css');

  it.each([
    ['texto-2', 'superficie'], // estado de la línea
    ['texto-3', 'superficie'], // detalle de la línea
    ['texto-3', 'fondo'], // días 8–14 atenuados (fondo transparente sobre la pantalla)
    ['texto-3', 'fondo-apagado'], // nota orientativa, datos de la franja, pie del mapa
    ['texto-2', 'fondo-apagado'],
    ['azul', 'superficie'], // % de lluvia de la franja
    ['verde-oscuro', 'lima-suave'], // consejo verde
    ['ambar-texto', 'ambar-fondo'], // consejo ámbar/rojo
  ])('contraste de %s sobre %s ≥ 4,5:1', (texto, fondo) => {
    expect(contraste(tokens[texto], tokens[fondo])).toBeGreaterThanOrEqual(4.5);
  });

  it('texto blanco del día seleccionado sobre verde oscuro ≥ 4,5:1', () => {
    expect(contraste('#ffffff', tokens['verde-oscuro'])).toBeGreaterThanOrEqual(4.5);
  });

  it('tamaños de letra en rem (respeta el texto del sistema hasta 130 %) y nada por debajo de 12 pt', () => {
    const tamanos = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(tamanos.length).toBeGreaterThan(5);
    for (const t of tamanos) {
      expect(t).toMatch(/rem$/);
      expect(parseFloat(t) * 16).toBeGreaterThanOrEqual(12);
    }
  });

  it('zonas táctiles nuevas de 44 × 44 pt como mínimo', () => {
    const regla = (sel: string) => css.slice(css.indexOf(sel)).split('}')[0];
    expect(regla('.franja-separador .info-orientativo {')).toMatch(/width: 44px[\s\S]*min-height: 44px/);
    expect(regla('.mapa-chincheta .chincheta {')).toMatch(/width: 48px[\s\S]*height: 48px/);
  });

  it('sin animaciones ni transiciones propias («Reducir movimiento», §5.6.6)', () => {
    expect(css).not.toMatch(/animation|transition/);
  });
});
