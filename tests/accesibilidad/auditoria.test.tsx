// Auditoría de accesibilidad (ola 9; §5.6, criterios 32 y 33 de §18) sobre las pantallas principales con todo el CSS
// del proyecto cargado. Ver tests/accesibilidad/auditor.ts para cómo se mide cada regla en jsdom.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { CifraAnimada } from '../../src/components/CifraAnimada';
import { reiniciarBase } from '../../src/db/db';
import { crearCliente, crearVisita, guardarSaldoInicial, type DatosCliente } from '../../src/db/repo';
import { claveDia } from '../../src/lib/fechas';
import { auditar, cargarCss, contraste, CSS, paresCss, TOKENS, type Defecto } from './auditor';

const BASE: DatosCliente = {
  nombre: 'Urb. El Olivar', tipo: 'comunidad', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Olivo 1', municipio: 'Madrid',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [], precio_habitual: 6000,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};

const pestana = (nombre: string) => within(screen.getByRole('navigation')).getByRole('button', { name: nombre });
const informe = (d: Defecto[]) => d.map((x) => `${x.regla}: ${x.elemento} — ${x.detalle}`).join('\n');

beforeEach(async () => {
  await reiniciarBase('fergo');
  window.localStorage.setItem('fergo.guia.vista', '1');
  cargarCss();
});
afterEach(() => vi.restoreAllMocks());

async function conDatos() {
  await guardarSaldoInicial(50000, 0);
  const { cliente } = await crearCliente(BASE);
  await crearVisita({
    cliente_id: cliente.id, fecha: claveDia(new Date()), hora_inicio: '23:00', duracion: 60, tipos_trabajo: ['setos_poda'], descripcion: '', precio: 6000,
    incluida_en_abono: false, requiere_vehiculo: true, ayudantes: 1,
  });
  return cliente;
}

describe('Criterio 32 · zonas táctiles de 44 × 44, nombre accesible y orden de foco en las pantallas principales', () => {
  it('Hoy, Registrar, Movimientos, Clientes, ficha, Agenda, detalle de visita, Preparar trabajo, Alertas, Ajustes, Avisos, Instalación, Informes y Exportar', async () => {
    await conDatos();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId('en-caja');
    const defectos: Record<string, Defecto[]> = {};
    const anotar = (pantalla: string) => {
      defectos[pantalla] = auditar();
    };
    anotar('Hoy');

    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    anotar('Registrar');
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    await user.click(pestana('Movimientos'));
    await screen.findByRole('heading', { name: 'Movimientos' });
    anotar('Movimientos');

    await user.click(pestana('Clientes'));
    await user.click(await screen.findByText('Urb. El Olivar'));
    await screen.findByRole('heading', { name: 'Urb. El Olivar' });
    anotar('Ficha de cliente');

    await user.click(pestana('Agenda'));
    await screen.findByRole('heading', { name: 'Agenda' });
    anotar('Agenda');

    await user.click(pestana('Hoy'));
    await user.click(await screen.findByText('Urb. El Olivar'));
    await user.click(await screen.findByRole('button', { name: /Preparación/ }));
    await screen.findByText(/^PREPARAR/);
    anotar('Preparar trabajo');

    await user.click(pestana('Hoy'));
    await user.click(await screen.findByRole('button', { name: 'Alertas' }));
    await screen.findByRole('heading', { name: 'Alertas' });
    anotar('Alertas');

    await user.click(pestana('Hoy'));
    await user.click(await screen.findByRole('button', { name: 'Ajustes' }));
    await screen.findByRole('heading', { name: 'Ajustes' });
    anotar('Ajustes');
    await user.click(screen.getByRole('button', { name: 'Avisos y horarios' }));
    await screen.findByRole('radiogroup', { name: 'Recordatorio' });
    anotar('Avisos y horarios');
    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    await user.click(await screen.findByRole('button', { name: 'Instalación y avisos' }));
    await screen.findByRole('heading', { name: 'Instalación y avisos' });
    anotar('Instalación y avisos');
    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    await user.click(await screen.findByRole('button', { name: 'Exportar datos' }));
    await screen.findByRole('heading', { name: 'Exportar datos' });
    anotar('Exportar datos');

    await user.click(pestana('Movimientos'));
    await user.click(await screen.findByRole('button', { name: 'Informes' }));
    await screen.findByRole('heading', { name: 'Informes' });
    anotar('Informes');

    const todos = Object.entries(defectos).flatMap(([p, d]) => d.map((x) => ({ ...x, elemento: `[${p}] ${x.elemento}` })));
    expect(informe(todos)).toBe('');
  }, 30_000);
});

describe('El auditor detecta defectos (control de la propia auditoría)', () => {
  it('marca botón sin nombre, zona pequeña, tabindex positivo y punto de color sin texto', () => {
    document.body.innerHTML = `
      <button type="button" style="min-height:20px;min-width:20px"><svg aria-hidden="true"></svg></button>
      <button type="button" tabindex="2" style="min-height:48px;min-width:48px">Vale</button>
      <div><span class="punto-semaforo"></span></div>`;
    const reglas = auditar().map((d) => d.regla).sort();
    expect(reglas).toEqual(['foco', 'nombre', 'solo-color', 'tactil-alto', 'tactil-ancho']);
    document.body.innerHTML = '';
  });
});

describe('Criterio 33 · contraste mínimo 4,5:1 (3:1 en texto grande)', () => {
  it('todos los pares color/fondo declarados en el CSS', () => {
    const malos = paresCss().filter((p) => p.ratio < p.minimo);
    expect(malos.map((p) => `${p.archivo} ${p.selector}: ${p.texto} sobre ${p.fondo} = ${p.ratio.toFixed(2)}`).join('\n')).toBe('');
    expect(paresCss().length).toBeGreaterThan(20);
  });

  it('los pares de tokens que usa la interfaz (§6.1)', () => {
    const t = TOKENS;
    const pares: [string, string, string][] = [
      ['texto', 'fondo', 'texto principal sobre el fondo'],
      ['texto', 'superficie', 'texto principal en tarjetas'],
      ['texto-2', 'superficie', 'texto secundario fuerte'],
      ['texto-3', 'superficie', 'texto secundario en tarjetas'],
      ['texto-3', 'fondo', 'texto secundario sobre el fondo'],
      ['texto-3', 'fondo-apagado', 'texto secundario en cajas grises'],
      ['verde-medio', 'superficie', 'enlaces e importes positivos'],
      ['verde-oscuro', 'lima', 'acción principal'],
      ['verde-oscuro', 'lima-suave', 'chips «Lo tengo», «Reservada»'],
      ['ambar-texto', 'ambar-fondo', 'avisos ámbar'],
      ['rojo-texto-fuerte', 'rojo-fondo', 'alertas que piden decisión'],
      ['rojo-texto', 'superficie', 'texto rojo en tarjetas'],
      ['azul', 'azul-fondo', 'aportes y ropa'],
      ['lima', 'verde-oscuro', 'acentos sobre la tarjeta de resumen'],
      ['lima', 'verde-oscuro-celda', 'cifras en las celdas del resumen'],
      ['texto', 'whatsapp-burbuja', 'mensaje al cliente'],
      ['texto', 'segmentado-fondo', 'control segmentado'],
    ];
    const malos = pares
      .map(([c, f, uso]) => ({ uso, r: contraste(t[`--${c}`], t[`--${f}`]) }))
      .filter((x) => x.r < 4.5)
      .map((x) => `${x.uso}: ${x.r.toFixed(2)}`);
    expect(malos.join('\n')).toBe('');
    expect(contraste('#ffffff', t['--verde-oscuro'])).toBeGreaterThan(4.5);
    expect(contraste('#ffffff', t['--rojo'])).toBeGreaterThan(4.5); // insignia de la campana
  });
});

describe('§5.6.5 y §5.6.6 · texto del sistema y «Reducir movimiento»', () => {
  it('los tamaños de letra van en rem (escalan con el texto del sistema hasta 130 % y más) y no se bloquea el zoom', () => {
    const enPx = CSS.flatMap((c) => [...c.texto.matchAll(/font-size:\s*[\d.]+px/g)].map((m) => `${c.archivo}: ${m[0]}`));
    expect(enPx).toEqual([]);
    const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
    expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?!\d)/);
  });

  it('con «Reducir movimiento» se desactivan animaciones y transiciones, y las cifras cambian sin animar', () => {
    const app = CSS.find((c) => c.archivo === 'src/styles/app.css')!.texto;
    expect(app).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*animation-duration: 0\.01ms !important;[\s\S]*transition-duration: 0\.01ms !important;/);
    window.matchMedia = vi.fn((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const formato = (v: number) => `${v} €`;
    const { rerender } = render(<CifraAnimada valor={100} formato={formato} testId="cifra" />);
    rerender(<CifraAnimada valor={250} formato={formato} testId="cifra" />);
    // Sin pasos intermedios: el valor final al momento (la cifra va repetida para lectores de pantalla).
    expect(within(document.body).getByTestId('cifra').textContent).toBe('250 €250 €');
    expect(raf).not.toHaveBeenCalled();
  });
});
