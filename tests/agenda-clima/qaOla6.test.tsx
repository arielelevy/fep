// QA de la ola 6: el Detalle sólo muestra «Tiempo de la visita» para visitas programadas (como Agenda y Hoy).
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { almacenEnMemoria, configurarClima, crearProveedorSimulado, crearServicioClima } from '../../src/clima';
import { DeshacerProvider } from '../../src/components/Deshacer';
import { DatosProvider } from '../../src/db/datos';
import { reiniciarBase } from '../../src/db/db';
import { cancelarVisita, crearCliente, crearVisita, type DatosCliente } from '../../src/db/repo';
import { desdeMadrid } from '../../src/lib/fechas';
import { VisitaDetalle } from '../../src/screens/VisitaDetalle';

const BASE: DatosCliente = {
  nombre: 'Fam. García', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: 'Calle Mayor 3', municipio: 'Madrid',
  lat: 40.36, lon: -3.7, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
  frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [],
  precio_habitual: null, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(desdeMadrid(2026, 11, 7, 10));
  await reiniciarBase('fergo');
  configurarClima(crearServicioClima({ proveedor: crearProveedorSimulado(), almacen: almacenEnMemoria(), enLinea: () => true }));
});
afterEach(() => {
  configurarClima(null);
  vi.useRealTimers();
});

const detalle = (id: string) =>
  render(
    <DatosProvider>
      <DeshacerProvider>
        <VisitaDetalle visitaId={id} etiquetaVolver="Agenda" onVolver={vi.fn()} onEditar={vi.fn()} onHecho={vi.fn()} onAbrirCliente={vi.fn()} />
      </DeshacerProvider>
    </DatosProvider>,
  );

describe('Detalle de visita cancelada', () => {
  it('no muestra «Tiempo de la visita»', async () => {
    const c = (await crearCliente(BASE)).cliente;
    const v = (
      await crearVisita({
        cliente_id: c.id, fecha: '2026-11-09', hora_inicio: '09:00', duracion: 120, tipos_trabajo: ['setos_poda'], descripcion: 'Poda',
        precio: 15000, incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0,
      })
    ).visita;
    await cancelarVisita(v.id);
    detalle(v.id);
    expect(await screen.findByText('Poda')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Tiempo de la visita' })).toBeNull();
  });
});
