import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeshacerProvider } from '../components/Deshacer';
import { DatosProvider } from '../db/datos';
import { reiniciarBase } from '../db/db';
import { cancelarVisita, completarVisita, crearCliente, crearVisita, type DatosCliente, type DatosVisita } from '../db/repo';
import { claveDia, sumarDias } from '../lib/fechas';
import { ClienteFicha } from './ClienteFicha';

// Ficha de cliente (§10.4.2.7, maqueta p. 4 «ÚLTIMAS VISITAS»): la próxima y las 5 más recientes, con su estado.

const cli = (): DatosCliente => ({
  nombre: 'Chalet Las Encinas', tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Pez 3',
  municipio: 'Madrid', lat: null, lon: null, servicios: ['piscina'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
  frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 60, tipos_trabajo_habituales: ['piscina'],
  precio_habitual: 6000, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
});
const vis = (cliente_id: string, fecha: string, descripcion: string): DatosVisita => ({
  cliente_id, fecha, hora_inicio: '10:00', duracion: 60, tipos_trabajo: ['piscina'], descripcion, precio: null,
  incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0,
});

beforeEach(async () => {
  await reiniciarBase('fergo');
});

describe('Ficha de cliente · últimas visitas', () => {
  it('muestra la próxima primero, las pasadas con su estado, "Ver todas" y abre el detalle', async () => {
    const { cliente } = await crearCliente(cli());
    const hoy = claveDia(new Date());
    const proxima = (await crearVisita(vis(cliente.id, sumarDias(hoy, 3), 'Próxima'))).visita;
    for (let i = 1; i <= 6; i++) {
      const { visita } = await crearVisita(vis(cliente.id, sumarDias(hoy, -7 * i), `Pasada ${i}`));
      if (i === 1) await completarVisita(visita.id, null);
      if (i === 2) await cancelarVisita(visita.id);
    }
    const onAbrirVisita = vi.fn();
    const user = userEvent.setup();
    render(
      <DatosProvider>
        <DeshacerProvider>
          <ClienteFicha clienteId={cliente.id} onVolver={() => {}} onEditar={() => {}} onYaPago={() => {}} onTrabajoHecho={() => {}} onVerMovimientos={() => {}} onAbrirVisita={onAbrirVisita} />
        </DeshacerProvider>
      </DatosProvider>,
    );
    const seccion = await screen.findByRole('region', { name: 'Últimas visitas' });
    const filas = () => within(seccion).getAllByRole('listitem').map((li) => li.textContent);
    expect(filas()).toHaveLength(6); // la próxima + 5 recientes
    expect(filas()[0]).toContain('Próxima');
    expect(filas()[0]).toContain('Programada');
    expect(filas()[1]).toContain('Pasada 1');
    expect(filas()[1]).toContain('Hecha');
    expect(filas()[2]).toContain('Cancelada');
    await user.click(within(seccion).getByRole('button', { name: 'Ver todas' }));
    expect(filas()).toHaveLength(7);
    await user.click(within(seccion).getAllByRole('button', { name: /Próxima/ })[0]);
    expect(onAbrirVisita).toHaveBeenCalledWith(proxima.id);
  });
});
