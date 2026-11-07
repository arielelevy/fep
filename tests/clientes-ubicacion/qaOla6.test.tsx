// QA de la ola 6: correcciones del /code-review en la ubicación del cliente.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapaChincheta } from '../../src/clientes/ubicacion/MapaChincheta';
import { UbicacionFormulario } from '../../src/clientes/ubicacion/UbicacionCliente';
import { DeshacerProvider } from '../../src/components/Deshacer';
import { DatosProvider } from '../../src/db/datos';
import { reiniciarBase } from '../../src/db/db';
import { crearCliente, type DatosCliente } from '../../src/db/repo';
import { configurarGeocodificador } from '../../src/geocodificacion';
import { ClienteForm } from '../../src/screens/ClienteForm';

const BASE: DatosCliente = {
  nombre: 'Fam. García', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: 'Calle Mayor 3', municipio: 'Madrid',
  lat: 40.41, lon: -3.7, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
  frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [],
  precio_habitual: null, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};
const chincheta = () => screen.getByRole('button', { name: /^Chincheta del cliente en / });

beforeEach(async () => {
  await reiniciarBase('fergo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  configurarGeocodificador(undefined);
});
afterEach(() => configurarGeocodificador(undefined));

describe('UbicacionFormulario', () => {
  it('escribir y deshacer la dirección antes de la búsqueda conserva las coordenadas guardadas', async () => {
    const inicial = { lat: 40.41, lon: -3.7 };
    const onCambio = vi.fn();
    const props = { inicial, onCambio, retardoMs: 50 };
    const { rerender } = render(<UbicacionFormulario direccion="Calle Mayor 3" municipio="Madrid" {...props} />);
    expect(chincheta()).toBeTruthy();
    rerender(<UbicacionFormulario direccion="Calle Mayor 3x" municipio="Madrid" {...props} />);
    rerender(<UbicacionFormulario direccion="Calle Mayor 3" municipio="Madrid" {...props} />);
    await act(() => new Promise((r) => setTimeout(r, 120)));
    expect(screen.queryByText('Buscando la dirección…')).toBeNull();
    expect(chincheta()).toBeTruthy();
    expect(onCambio).toHaveBeenLastCalledWith(inicial);
  });
});

describe('MapaChincheta', () => {
  it('un toque sin arrastrar no guarda otro punto aunque el redondeo lo cambie', () => {
    const onMover = vi.fn();
    const centro = { lat: 40.4, lon: -3.7 };
    // 7 decimales (geocodificador real): el redondeo a 5 daría otro punto si se guardara al soltar.
    render(<MapaChincheta centro={centro} punto={{ lat: 40.4000123, lon: -3.7000123 }} editable onMover={onMover} />);
    const pin = chincheta();
    fireEvent(pin, new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    fireEvent(pin, new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }));
    expect(onMover).not.toHaveBeenCalled();
  });
});

describe('ClienteForm · Editar', () => {
  it('cerrar tras corregir la chincheta pide confirmación en vez de perder la corrección', async () => {
    const c = (await crearCliente(BASE)).cliente;
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    render(
      <DatosProvider>
        <DeshacerProvider>
          <ClienteForm cliente={c} onCerrar={onCerrar} />
        </DeshacerProvider>
      </DatosProvider>,
    );
    fireEvent.keyDown(await waitFor(() => chincheta()), { key: 'ArrowUp' });
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByText('¿Descartar los cambios?')).toBeTruthy();
  });
});
