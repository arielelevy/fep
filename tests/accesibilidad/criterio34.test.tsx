// Criterio 34 de §18 (ola 9): «Con VoiceOver se pueden registrar un gasto y marcar una visita como hecha».
// Se recorre cada flujo como lo haría un lector de pantalla: localizando los controles SOLO por su rol y su nombre
// accesible, activándolos con el teclado (Enter / Espacio) y comprobando que el resultado se anuncia (role="status").
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { db, reiniciarBase } from '../../src/db/db';
import { crearCliente, crearVisita, guardarSaldoInicial, type DatosCliente } from '../../src/db/repo';
import { claveDia } from '../../src/lib/fechas';

const CLIENTE: DatosCliente = {
  nombre: 'Sra. Morales', tipo: 'particular', telefono: null, telefono_2: null, contacto: '', direccion: 'Calle Pez 3', municipio: 'Madrid', lat: null, lon: null,
  servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null,
  duracion_habitual: 120, tipos_trabajo_habituales: [], precio_habitual: 4500, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};

/** Activa un control con el teclado, como el doble toque de VoiceOver. */
async function activar(user: ReturnType<typeof userEvent.setup>, el: HTMLElement) {
  el.focus();
  expect(document.activeElement).toBe(el);
  await user.keyboard('{Enter}');
}

beforeEach(async () => {
  await reiniciarBase('fergo');
  window.localStorage.setItem('fergo.guia.vista', '1');
  await guardarSaldoInicial(50000, 0);
});

describe('Criterio 34 · lector de pantalla', () => {
  it('registrar un gasto: botón «Registrar», importe con el foco, categoría, «Guardar gasto» y aviso «Gasto guardado»', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId('en-caja');
    await activar(user, screen.getByRole('button', { name: 'Registrar' }));
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    const importe = within(hoja).getByLabelText('Importe');
    await waitFor(() => expect(document.activeElement).toBe(importe)); // el foco llega solo al importe
    await user.keyboard('12,50');
    const categorias = within(hoja).getByRole('radiogroup', { name: 'Categoría' });
    await activar(user, within(categorias).getByRole('radio', { name: 'Gasolina (vehículo)' }));
    expect(within(categorias).getByRole('radio', { name: 'Gasolina (vehículo)' }).getAttribute('aria-checked')).toBe('true');
    await activar(user, within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    expect((await screen.findByRole('status')).textContent).toContain('Gasto guardado');
    expect((await db.movimientos.filter((m) => m.tipo === 'gasto').toArray()).map((m) => m.importe)).toEqual([1250]);
  });

  it('marcar una visita como hecha: «Hecho: cliente, hora», «¿Cobraste…?», «Sí, 45 €» y aviso «Visita completada»', async () => {
    const { cliente } = await crearCliente(CLIENTE);
    await crearVisita({
      cliente_id: cliente.id, fecha: claveDia(new Date()), hora_inicio: '23:30', duracion: 60, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: 4500,
      incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0,
    });
    const user = userEvent.setup();
    render(<App />);
    // El botón dice a qué visita se refiere (no un «Hecho» suelto).
    await activar(user, await screen.findByRole('button', { name: 'Hecho: Sra. Morales, 23:30' }));
    const hoja = await screen.findByRole('dialog', { name: /Cobraste a Sra\. Morales/ });
    await activar(user, within(hoja).getByRole('button', { name: /^Sí, 45/ }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Visita completada|Cobro/);
    await waitFor(async () => expect((await db.visitas.toArray())[0].estado).toBe('hecha'));
  });
});
