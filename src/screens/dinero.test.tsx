import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { db, reiniciarBase } from '../db/db';
import {
  SinPermiso, anotarTrabajo, crearCliente, crearMovimiento, editarCliente, editarMovimiento, eliminarMovimiento,
  guardarSaldoInicial, usarComo, type DatosCliente,
} from '../db/repo';
import { formatearEuros } from '../lib/dinero';

// Ola 4 · criterios de aceptación 4, 5, 6 y 11 de §18, cobros con "Te deben" / "Ya pagó", hoja
// «¿Cobraste a …?» y permisos del colaborador (Pablo).

const valor = (id: string) => Number(screen.getByTestId(id).getAttribute('data-valor'));
const activos = () => db.movimientos.filter((m) => !m.eliminado_en).toArray();
const catId = async (clave: string) => (await db.categorias.where('clave').equals(clave).first())!.id;
const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const datosCliente = (extra: Partial<DatosCliente> = {}): DatosCliente => ({
  nombre: 'Fam. García', tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Pez 3',
  municipio: 'Madrid', lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
  frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [],
  precio_habitual: 15000, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true, ...extra,
});

async function montar() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('en-caja');
  return user;
}

async function abrirEn(user: ReturnType<typeof userEvent.setup>, tipo: 'Cobro' | 'Aporte' | 'Fianza') {
  await user.click(screen.getByRole('button', { name: 'Registrar' }));
  const hoja = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
  await user.click(within(hoja).getByRole('radio', { name: tipo }));
  return screen.getByRole('dialog', { name: 'Nuevo movimiento' });
}

beforeEach(async () => {
  await reiniciarBase('fergo');
  window.localStorage.setItem('fergo.guia.vista', '1');
  window.localStorage.removeItem('fergo.movimientos.filtro');
});

describe('Criterio 4 · aporte de 500 €', () => {
  it('"En caja" sube 500 €, "Aportes" sube 500 € y "Ganado" no cambia', async () => {
    await guardarSaldoInicial(10000, 0);
    const user = await montar();
    await waitFor(() => expect(valor('en-caja')).toBe(10000));
    const hoja = await abrirEn(user, 'Aporte');
    expect(within(hoja).getByText(/No cuenta como ganancia del negocio\./)).toBeTruthy();
    await user.type(within(hoja).getByLabelText('Importe'), '500');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar aporte' }));
    await waitFor(() => expect(valor('en-caja')).toBe(60000));
    expect(valor('aportes')).toBe(50000);
    expect(valor('ganado')).toBe(0);
    expect(screen.getByRole('status').textContent).toContain('Aporte guardado');
  });

  it('un préstamo muestra "Préstamo pendiente" y baja al devolverlo', async () => {
    const user = await montar();
    let hoja = await abrirEn(user, 'Aporte');
    await user.click(within(hoja).getByRole('radio', { name: 'Préstamo' }));
    await user.type(within(hoja).getByLabelText('Importe'), '300');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar préstamo' }));
    expect(await screen.findByText('Préstamo pendiente: 300 €')).toBeTruthy();
    expect(valor('aportes')).toBe(0); // un préstamo no es aporte de capital
    expect(valor('ganado')).toBe(0);

    hoja = await abrirEn(user, 'Aporte');
    await user.click(within(hoja).getByRole('radio', { name: 'Devolver préstamo' }));
    expect(within(hoja).getByText(/Préstamo pendiente: 300 €/)).toBeTruthy();
    await user.type(within(hoja).getByLabelText('Importe'), '100');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar devolución' }));
    expect(await screen.findByText('Préstamo pendiente: 200 €')).toBeTruthy();
    expect(valor('en-caja')).toBe(20000);
  });
});

describe('Criterio 5 · fianza de 150 €', () => {
  it('"En caja" baja 150 €, "En fianzas" sube 150 € y "Ganado" no cambia', async () => {
    await guardarSaldoInicial(50000, 0);
    const user = await montar();
    await waitFor(() => expect(valor('en-caja')).toBe(50000));
    const hoja = await abrirEn(user, 'Fianza');
    expect(within(hoja).getByText('No es un gasto. Te la devuelven.')).toBeTruthy();
    const guardar = within(hoja).getByRole('button', { name: 'Guardar fianza' }) as HTMLButtonElement;
    await user.type(within(hoja).getByLabelText('Importe'), '150');
    expect(guardar.disabled).toBe(true); // falta a quién
    await user.type(within(hoja).getByLabelText('¿A quién se la dejas?'), 'Alquileres Sur');
    await user.click(guardar);
    await waitFor(() => expect(valor('en-caja')).toBe(35000));
    expect(valor('fianzas')).toBe(15000);
    expect(valor('ganado')).toBe(0);
    const [f] = (await activos()).filter((m) => m.tipo === 'fianza_entregada');
    expect(f.fianza).toEqual({ entregada_a: 'Alquileres Sur', motivo: 'Furgoneta' });
  });
});

describe('Criterio 6 · fianza de 150 € devuelta con 120 €', () => {
  it('"En caja" sube 120 €, "En fianzas" baja 150 € y se crea un gasto de Movilidad de 30 €', async () => {
    await guardarSaldoInicial(50000, 0);
    await crearMovimiento({ tipo: 'fianza_entregada', importe: 15000, fecha: new Date().toISOString(), categoria_id: null, medio_pago: 'efectivo', fianza: { entregada_a: 'Alquileres Sur', motivo: 'Furgoneta' } });
    const user = await montar();
    await waitFor(() => expect(valor('en-caja')).toBe(35000));
    expect(valor('fianzas')).toBe(15000);

    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await user.click(await screen.findByRole('button', { name: /^Fianza furgoneta, 150 €/ }));
    await user.click(screen.getByRole('button', { name: 'Me la devolvieron' }));
    const dlg = screen.getByRole('dialog', { name: '¿Te devolvieron la fianza de 150 €?' });
    await user.click(within(dlg).getByRole('button', { name: 'Me descontaron algo' }));
    await user.type(within(dlg).getByLabelText('¿Cuánto te devolvieron?'), '120');
    expect(within(dlg).getByText(/Te descontaron 30 €/)).toBeTruthy();
    await user.click(within(dlg).getByRole('button', { name: 'Guardar devolución' }));
    expect(await screen.findByText('Devuelta con descuento')).toBeTruthy();

    const movs = await activos();
    const descuento = movs.find((m) => m.tipo === 'gasto');
    expect(descuento).toMatchObject({ importe: 3000, nota: 'Descuento de fianza', categoria_id: await catId('alquiler_furgoneta') });
    expect((await db.categorias.get(descuento!.categoria_id!))?.grupo).toBe('Movilidad');

    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(valor('en-caja')).toBe(35000 + 12000));
    expect(valor('fianzas')).toBe(0);
    expect(valor('ganado')).toBe(-3000);
  });

  it('"Entera" devuelve los 150 € sin gasto y se puede deshacer', async () => {
    await crearMovimiento({ tipo: 'fianza_entregada', importe: 15000, fecha: new Date().toISOString(), categoria_id: null, medio_pago: 'efectivo', fianza: { entregada_a: 'X', motivo: 'Furgoneta' } });
    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await user.click(await screen.findByRole('button', { name: /^Fianza furgoneta/ }));
    await user.click(screen.getByRole('button', { name: 'Me la devolvieron' }));
    await user.click(screen.getByRole('button', { name: 'Entera, 150 €' }));
    await waitFor(async () => expect((await activos()).filter((m) => m.tipo === 'fianza_devuelta')).toHaveLength(1));
    expect((await activos()).some((m) => m.tipo === 'gasto')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await activos()).filter((m) => m.tipo === 'fianza_devuelta')).toHaveLength(0));
  });
});

describe('Criterio 11 · antigüedad de pendientes en "Te deben"', () => {
  it('a los 7 días se muestra en ámbar y a los 15 en rojo, siempre con el texto', async () => {
    const { cliente: a } = await crearCliente(datosCliente({ nombre: 'Sra. Morales' }));
    const { cliente: b } = await crearCliente(datosCliente({ nombre: 'Los Pinos' }));
    const { cliente: c } = await crearCliente(datosCliente({ nombre: 'Las Encinas' }));
    await anotarTrabajo({ cliente_id: a.id, concepto: 'Poda', precio: 4500, cobrado: 0, medio_pago: 'efectivo', fecha: diasAtras(7) });
    await anotarTrabajo({ cliente_id: b.id, concepto: 'Setos', precio: 15000, cobrado: 0, medio_pago: 'efectivo', fecha: diasAtras(15) });
    await anotarTrabajo({ cliente_id: c.id, concepto: 'Césped', precio: 6000, cobrado: 0, medio_pago: 'efectivo', fecha: diasAtras(6) });
    const user = await montar();
    await waitFor(() => expect(valor('te-deben')).toBe(25500));
    await user.click(screen.getByRole('button', { name: /Te deben/ }));
    const chip = (texto: string) => screen.getByText(texto);
    expect(chip('hace 7 días').className).toContain('ambar');
    expect(chip('hace 15 días').className).toContain('rojo');
    expect(chip('hace 6 días').className).toContain('neutro');
    // El más antiguo primero.
    const filas = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(filas[0]).toContain('Los Pinos');
  });
});

describe('Cobros: "¿Cobraste a …?", "Te deben" y "Ya pagó" (§9.4, §10.1.4)', () => {
  it('"No, me paga después" sube "Te deben"; "Ya pagó" abre Cobro precargado y lo salda', async () => {
    const { cliente } = await crearCliente(datosCliente());
    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Clientes' }));
    await user.click(await screen.findByText('Fam. García'));
    await user.click(await screen.findByRole('button', { name: 'Trabajo hecho' }));
    const hoja = screen.getByRole('dialog', { name: '¿Cobraste a Fam. García?' });
    expect(within(hoja).getByRole('button', { name: 'Sí, 150 €' })).toBeTruthy(); // precio habitual precargado
    await user.click(within(hoja).getByRole('button', { name: 'No, me paga después' }));
    await waitFor(async () => expect(await db.deudas.count()).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(valor('te-deben')).toBe(15000));
    await user.click(screen.getByRole('button', { name: /Te deben/ }));
    await user.click(screen.getByRole('button', { name: `Ya pagó: Fam. García, ${formatearEuros(15000)}` }));
    const registrar = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    expect(within(registrar).getByRole('radio', { name: 'Cobro' }).getAttribute('aria-checked')).toBe('true');
    expect((within(registrar).getByLabelText('Importe') as HTMLInputElement).value).toBe('150');
    await user.click(within(registrar).getByRole('button', { name: 'Guardar cobro' }));
    await waitFor(async () => expect((await activos()).filter((m) => m.tipo === 'cobro')).toHaveLength(1));
    const [cobro] = (await activos()).filter((m) => m.tipo === 'cobro');
    expect(cobro).toMatchObject({ cliente_id: cliente.id, importe: 15000 });
    expect(cobro.saldos).toEqual([{ clave: expect.stringMatching(/^deuda:/), importe: 15000 }]);
    expect(await screen.findByText('Todo cobrado')).toBeTruthy();
  });

  it('"Sí, 150 €" crea el cobro con el último medio de pago y "Cobré otra cantidad" deja el resto pendiente', async () => {
    const { cliente } = await crearCliente(datosCliente());
    await crearMovimiento({ tipo: 'aporte', importe: 100, fecha: new Date().toISOString(), categoria_id: null, medio_pago: 'bizum' });
    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Clientes' }));
    await user.click(await screen.findByText('Fam. García'));
    await user.click(await screen.findByRole('button', { name: 'Trabajo hecho' }));
    let hoja = screen.getByRole('dialog', { name: '¿Cobraste a Fam. García?' });
    expect(within(hoja).getByRole('radio', { name: 'Bizum' }).getAttribute('aria-checked')).toBe('true');
    await user.click(within(hoja).getByRole('button', { name: 'Sí, 150 €' }));
    await waitFor(async () => expect((await activos()).filter((m) => m.tipo === 'cobro')).toHaveLength(1));
    expect((await activos()).find((m) => m.tipo === 'cobro')).toMatchObject({ importe: 15000, medio_pago: 'bizum', cliente_id: cliente.id });

    await user.click(await screen.findByRole('button', { name: 'Trabajo hecho' }));
    hoja = screen.getByRole('dialog', { name: '¿Cobraste a Fam. García?' });
    await user.click(within(hoja).getByRole('button', { name: 'Cobré otra cantidad' }));
    await user.type(within(hoja).getByLabelText('Cobré'), '100');
    expect(within(hoja).getByText('Quedan 50 € pendientes.')).toBeTruthy();
    await user.click(within(hoja).getByRole('button', { name: 'Guardar cobro' }));
    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(valor('te-deben')).toBe(5000));
    expect(valor('ganado')).toBe(25000);
  });

  it('cliente de abono: el cobro "Abono [mes]" salda la cuota vencida', async () => {
    const { cliente } = await crearCliente(datosCliente({ nombre: 'Chalet Las Encinas', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 1 }));
    await db.clientes.update(cliente.id, { creado_en: diasAtras(40) });
    const user = await montar();
    await waitFor(() => expect(valor('te-deben')).toBeGreaterThanOrEqual(9000));
    const debe = valor('te-deben');
    const hoja = await abrirEn(user, 'Cobro');
    await user.click(within(hoja).getByRole('button', { name: /Cliente/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Elegir cliente' })).getByRole('button', { name: /Chalet Las Encinas/ }));
    expect(within(hoja).getByRole('radio', { name: /^Abono / }).getAttribute('aria-checked')).toBe('true');
    expect(parseInt((within(hoja).getByLabelText('Importe') as HTMLInputElement).value.replace('.', ''), 10) * 100).toBe(debe);
    await user.click(within(hoja).getByRole('button', { name: 'Guardar cobro' }));
    await waitFor(() => expect(valor('te-deben')).toBe(0));
    const [cobro] = (await activos()).filter((m) => m.tipo === 'cobro');
    expect(cobro.periodo_abono).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('Gasto imputado a un cliente (§9.5)', () => {
  it('el gasto con cliente cuenta en su margen', async () => {
    const { cliente } = await crearCliente(datosCliente({ nombre: 'Chalet Las Encinas' }));
    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    const hoja = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    await user.keyboard('32');
    await user.click(within(hoja).getByRole('radio', { name: 'Productos de piscina' }));
    await user.click(within(hoja).getByRole('button', { name: /Cliente/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Elegir cliente' })).getByRole('button', { name: /Chalet Las Encinas/ }));
    await user.click(within(hoja).getByRole('button', { name: 'Guardar gasto' }));
    await waitFor(async () => expect((await activos()).find((m) => m.tipo === 'gasto')?.cliente_id).toBe(cliente.id));
  });
});

describe('Permisos del colaborador (Pablo, §3)', () => {
  it('en la capa de datos: no crea ni edita gastos, cobros ni fianzas; sí aportes y préstamos', async () => {
    const fecha = new Date().toISOString();
    const { movimiento: gasto } = await crearMovimiento({ tipo: 'gasto', importe: 1000, fecha, categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    const { cliente } = await crearCliente(datosCliente());
    await usarComo('colaborador');

    await expect(crearMovimiento({ tipo: 'gasto', importe: 1000, fecha, categoria_id: await catId('gasolina'), medio_pago: 'efectivo' })).rejects.toBeInstanceOf(SinPermiso);
    await expect(crearMovimiento({ tipo: 'cobro', importe: 1000, fecha, categoria_id: null, medio_pago: 'efectivo', cliente_id: cliente.id })).rejects.toBeInstanceOf(SinPermiso);
    await expect(crearMovimiento({ tipo: 'fianza_entregada', importe: 1000, fecha, categoria_id: null, medio_pago: 'efectivo' })).rejects.toBeInstanceOf(SinPermiso);
    await expect(editarMovimiento(gasto.id, { importe: 2000 })).rejects.toBeInstanceOf(SinPermiso);
    await expect(eliminarMovimiento(gasto.id)).rejects.toBeInstanceOf(SinPermiso);
    await expect(crearCliente(datosCliente({ nombre: 'Otro' }))).rejects.toBeInstanceOf(SinPermiso);
    await expect(editarCliente(cliente.id, { notas: 'x' })).rejects.toBeInstanceOf(SinPermiso);
    await expect(anotarTrabajo({ cliente_id: cliente.id, concepto: 'x', precio: 100, cobrado: 0, medio_pago: 'efectivo' })).rejects.toBeInstanceOf(SinPermiso);

    const { movimiento: aporte } = await crearMovimiento({ tipo: 'aporte', importe: 50000, fecha, categoria_id: null, medio_pago: 'transferencia' });
    const { movimiento: prestamo } = await crearMovimiento({ tipo: 'prestamo', importe: 30000, fecha, categoria_id: null, medio_pago: 'transferencia' });
    await crearMovimiento({ tipo: 'devolucion_prestamo', importe: 10000, fecha, categoria_id: null, medio_pago: 'transferencia', prestamo_id: prestamo.id });
    const { movimiento: editado } = await editarMovimiento(aporte.id, { importe: 60000 });
    const pablo = await db.usuarios.where('rol').equals('colaborador').first();
    expect(editado).toMatchObject({ importe: 60000, modificado_por: pablo!.id });
    expect(aporte.creado_por).toBe(pablo!.id);
    expect((await db.movimientos.get(gasto.id))?.importe).toBe(1000);
  });

  it('en la interfaz: Registrar abre en Aporte y no deja elegir Gasto, Cobro ni Fianza', async () => {
    await crearMovimiento({ tipo: 'gasto', importe: 3850, fecha: new Date().toISOString(), categoria_id: await catId('gasolina'), medio_pago: 'efectivo' });
    await usarComo('colaborador');
    const user = await montar();
    expect(screen.getByRole('heading', { name: 'Hola, Pablo' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Para empezar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    const hoja = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    const tipos = () => within(screen.getByRole('radiogroup', { name: 'Tipo de movimiento' }));
    await waitFor(() => expect(tipos().getByRole('radio', { name: 'Aporte' }).getAttribute('aria-checked')).toBe('true'));
    for (const t of ['Gasto', 'Cobro', 'Fianza']) expect((tipos().getByRole('radio', { name: t }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(hoja).getByLabelText('Importe'), '200');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar aporte' }));
    await waitFor(() => expect(valor('aportes')).toBe(20000));

    // Un gasto de Felipe: Pablo lo ve, pero no puede cambiarlo.
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    await user.click(await screen.findByRole('button', { name: /^Gasolina/ }));
    expect(screen.getByText('Solo Felipe puede cambiar este movimiento.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
  });

  it('desde Ajustes se cambia quién usa el móvil', async () => {
    const user = await montar();
    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    await user.click(screen.getByRole('radio', { name: 'Pablo' }));
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Hoy' }));
    expect(await screen.findByRole('heading', { name: 'Hola, Pablo' })).toBeTruthy();
  });
});
