import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeshacerProvider } from '../components/Deshacer';
import { DatosProvider, useDatos } from '../db/datos';
import { db, reiniciarBase } from '../db/db';
import { completarVisita, crearCliente, crearMovimiento, crearVisita, type DatosCliente } from '../db/repo';
import { calcularPendientes, totalPendiente } from '../domain/pendientes';
import { desdeMadrid } from '../lib/fechas';
import { ClienteFicha } from './ClienteFicha';
import { HojaHecho } from './HojaHecho';

// Ola 5 · frente B. Criterios 9 y 10 de §18 en la interfaz: hoja «¿Cobraste a …?» al pulsar «Hecho» (§10.1.4)
// y «Te debe 150 €» en la ficha del cliente (§10.4).

const AHORA = desdeMadrid(2026, 11, 7, 10);

const CLIENTE: DatosCliente = {
  nombre: 'Sra. Morales', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: '', municipio: '',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [], precio_habitual: null,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};

async function preparar() {
  const { cliente } = await crearCliente(CLIENTE);
  const { visita } = await crearVisita({
    cliente_id: cliente.id, fecha: '2026-11-07', hora_inicio: '10:00', duracion: 120, tipos_trabajo: ['setos_poda'],
    descripcion: 'Poda de setos', precio: 15000, incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0,
  });
  return { cliente, visita };
}

/** Como en Hoy: la hoja se abre con los datos ya cargados. */
function ConDatos({ children }: { children: ReactNode }) {
  return useDatos() ? <>{children}</> : null;
}

function montar(ui: ReactNode) {
  const user = userEvent.setup();
  render(
    <DatosProvider>
      <DeshacerProvider>
        <ConDatos>{ui}</ConDatos>
      </DeshacerProvider>
    </DatosProvider>,
  );
  return user;
}

const activos = <T extends { eliminado_en: string | null }>(xs: T[]) => xs.filter((x) => !x.eliminado_en);
const teDeben = async () =>
  totalPendiente(calcularPendientes(activos(await db.clientes.toArray()), activos(await db.deudas.toArray()), activos(await db.movimientos.toArray())));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Criterio 9 · «Sí, 150 €» en la hoja Hecho', () => {
  it('la visita queda hecha y se crea un cobro de 150 € con el último medio de pago usado', async () => {
    const { cliente, visita } = await preparar();
    // Último medio usado: Bizum.
    await crearMovimiento({ tipo: 'otro_ingreso', importe: 1000, fecha: new Date().toISOString(), categoria_id: null, medio_pago: 'bizum' });
    const onCerrar = vi.fn();
    const user = montar(<HojaHecho visitaId={visita.id} onCerrar={onCerrar} />);

    const hoja = await screen.findByRole('dialog', { name: '¿Cobraste a Sra. Morales?' });
    expect(within(hoja).getByRole('radio', { name: 'Bizum' }).getAttribute('aria-checked')).toBe('true');
    await user.click(within(hoja).getByRole('button', { name: /^Sí, 150\s€$/ }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect((await db.visitas.get(visita.id))!.estado).toBe('hecha');
    const cobros = activos(await db.movimientos.toArray()).filter((m) => m.tipo === 'cobro');
    expect(cobros).toHaveLength(1);
    expect(cobros[0]).toMatchObject({ importe: 15000, medio_pago: 'bizum', cliente_id: cliente.id });
    expect(await teDeben()).toBe(0);
    expect(await screen.findByText(/Visita completada/)).toBeTruthy();
  });
});

describe('Criterio 10 · «No, me paga después» en la hoja Hecho', () => {
  it('«Te deben» sube 150 € y el cliente muestra «Te debe 150 €»', async () => {
    const { visita } = await preparar();
    const onCerrar = vi.fn();
    const user = montar(<HojaHecho visitaId={visita.id} onCerrar={onCerrar} />);

    const hoja = await screen.findByRole('dialog', { name: '¿Cobraste a Sra. Morales?' });
    expect(await teDeben()).toBe(0);
    await user.click(within(hoja).getByRole('button', { name: 'No, me paga después' }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect((await db.visitas.get(visita.id))!.estado).toBe('hecha');
    expect(activos(await db.movimientos.toArray()).filter((m) => m.tipo === 'cobro')).toHaveLength(0);
    expect(await teDeben()).toBe(15000);
  });

  it('la ficha del cliente muestra «Te debe 150 €» tras «No, me paga después»', async () => {
    const { cliente, visita } = await preparar();
    await completarVisita(visita.id, null);
    montar(
      <ClienteFicha clienteId={cliente.id} onVolver={vi.fn()} onEditar={vi.fn()} onYaPago={vi.fn()} onTrabajoHecho={vi.fn()} onVerMovimientos={vi.fn()} />,
    );
    await waitFor(() => expect(document.body.textContent).toMatch(/Te debe 150\s€/));
  });

  it('«Cobré otra cantidad» deja el resto pendiente', async () => {
    const { visita } = await preparar();
    const user = montar(<HojaHecho visitaId={visita.id} onCerrar={vi.fn()} />);
    const hoja = await screen.findByRole('dialog', { name: '¿Cobraste a Sra. Morales?' });
    await user.click(within(hoja).getByRole('button', { name: 'Cobré otra cantidad' }));
    await user.type(within(hoja).getByLabelText('Cobré'), '50');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar cobro' }));
    await waitFor(async () => expect(await teDeben()).toBe(10000));
    expect((await db.visitas.get(visita.id))!.estado).toBe('hecha');
  });
});
