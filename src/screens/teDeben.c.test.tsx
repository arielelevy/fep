import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeshacerProvider } from '../components/Deshacer';
import { DatosProvider } from '../db/datos';
import { reiniciarBase } from '../db/db';
import { anotarTrabajo, crearCliente, type DatosCliente } from '../db/repo';
import { Clientes } from './Clientes';
import { TeDeben } from './TeDeben';

// Hallazgo 2 del revisor de la ola 4 (frente C, ola 5): al 130 % el nombre del cliente se cortaba con «…» en
// Te deben y en el listado de Clientes. Ahora pasa a dos líneas. jsdom no aplica las hojas de estilo: se
// comprueba que el nombre completo está en el DOM con la clase que lo deja partir, y la regla CSS.

const NOMBRE = 'Comunidad de Propietarios Los Pinos del Monte';
const BASE: DatosCliente = {
  nombre: NOMBRE, tipo: 'comunidad', telefono: null, telefono_2: null, contacto: '', direccion: '', municipio: '', lat: null, lon: null,
  servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null, dias_preferidos: [],
  hora_preferida: null, duracion_habitual: 60, tipos_trabajo_habituales: [], precio_habitual: null, requiere_vehiculo_por_defecto: false,
  ayudantes_por_defecto: 0, notas: '', activo: true,
};

const reglas = (archivo: string, selector: string) => {
  const css = readFileSync(archivo, 'utf8');
  const i = css.indexOf(selector);
  expect(i).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf('}', i));
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
  await reiniciarBase('fergo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Te deben · el nombre no se corta', () => {
  it('muestra el nombre completo con la clase que lo pasa a dos líneas', async () => {
    const { cliente } = await crearCliente(BASE);
    await anotarTrabajo({ cliente_id: cliente.id, concepto: 'Poda de setos', precio: 15000, cobrado: 0, medio_pago: 'efectivo' });
    render(
      <DatosProvider>
        <DeshacerProvider>
          <TeDeben etiquetaVolver="Hoy" onVolver={vi.fn()} onYaPago={vi.fn()} />
        </DeshacerProvider>
      </DatosProvider>,
    );
    const nombre = await screen.findByText(NOMBRE);
    expect(nombre.className).toContain('nombre-pendiente');
    const regla = reglas('src/styles/clientes.css', '.fila-pendiente .nombre-pendiente');
    const bloque = readFileSync('src/styles/clientes.css', 'utf8').slice(readFileSync('src/styles/clientes.css', 'utf8').indexOf(regla));
    expect(bloque.slice(0, bloque.indexOf('}'))).toMatch(/white-space: normal/);
  });
});

describe('Clientes · el nombre no se corta (clientes.css)', () => {
  it('la regla del nombre del listado ya no usa nowrap ni «…» y parte palabras largas', async () => {
    const regla = reglas('src/styles/clientes.css', '.fila-cliente .nombre {');
    expect(regla).not.toMatch(/nowrap|ellipsis/);
    expect(regla).toMatch(/overflow-wrap: anywhere/);
    await crearCliente(BASE);
    render(
      <DatosProvider>
        <DeshacerProvider>
          <Clientes onAbrir={vi.fn()} onNuevo={vi.fn()} />
        </DeshacerProvider>
      </DatosProvider>,
    );
    expect(await screen.findByText(NOMBRE)).toBeTruthy();
  });
});
