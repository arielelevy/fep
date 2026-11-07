// Informes y exportación (ola 9, Feature 2; spec §10.9 y §15): la pantalla se pinta con los datos de la base local
// (las cinco tarjetas, con valores en texto y sin rojo en meses negativos), el selector de mes del gasto por categoría,
// el estado vacío, y «Exportar a Excel» / CSV comparten o descargan archivos válidos. Base local falsa (IndexedDB).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeshacerProvider } from '../../src/components/Deshacer';
import { DatosProvider } from '../../src/db/datos';
import { db, reiniciarBase } from '../../src/db/db';
import { crearCliente, crearMovimiento, type DatosCliente } from '../../src/db/repo';
import type { TipoMovimiento } from '../../src/domain/tipos';
import { leerZip } from '../../src/features/informes/ejemplo.test-util';
import { ExportarDatos } from '../../src/features/informes/ExportarDatos';
import { Informes } from '../../src/features/informes/Informes';
import { desdeMadrid } from '../../src/lib/fechas';

const AHORA = desdeMadrid(2026, 11, 7, 10); // sábado 7 de noviembre de 2026, 10:00 en Madrid

const BASE: DatosCliente = {
  nombre: 'Fam. García', tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Olivo 1', municipio: 'Madrid',
  lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
  dias_preferidos: [], hora_preferida: null, duracion_habitual: 60, tipos_trabajo_habituales: [], precio_habitual: null,
  requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
};

const catId = async (clave: string) => (await db.categorias.where('clave').equals(clave).first())!.id;
const fecha = (a: number, m: number, d: number) => desdeMadrid(a, m, d, 12).toISOString();
const texto = (el: Element | null | undefined) => el?.textContent ?? '';
const tarjeta = (id: string) => document.querySelector(`[data-tarjeta="${id}"]`) as HTMLElement;

async function mov(tipo: TipoMovimiento, importe: number, f: string, extra: { categoria?: string; cliente_id?: string; nota?: string } = {}) {
  return (
    await crearMovimiento({
      tipo, importe, fecha: f, categoria_id: extra.categoria ? await catId(extra.categoria) : null, medio_pago: 'efectivo',
      cliente_id: extra.cliente_id ?? null, nota: extra.nota,
    })
  ).movimiento;
}

/** Noviembre: cobro de 200 € a García, alquiler de 90 € imputado a Morales. Octubre: gasolina 120 € (mes en negativo). */
async function escena() {
  const garcia = (await crearCliente(BASE)).cliente;
  const morales = (await crearCliente({ ...BASE, nombre: 'Sra. Morales', modalidad: 'abono', cuota_abono: 9000, dia_cobro_abono: 5 })).cliente;
  await mov('cobro', 20000, fecha(2026, 11, 2), { cliente_id: garcia.id });
  await mov('gasto', 9000, fecha(2026, 11, 3), { categoria: 'alquiler_furgoneta', cliente_id: morales.id, nota: 'Furgo; día 3' });
  await mov('gasto', 3850, fecha(2026, 11, 4), { categoria: 'gasolina' });
  await mov('gasto', 12000, fecha(2026, 10, 10), { categoria: 'gasolina' });
  await mov('aporte', 50000, fecha(2026, 11, 1));
  const borrado = await mov('cobro', 99900, fecha(2026, 11, 5), { cliente_id: garcia.id });
  await db.movimientos.update(borrado.id, { eliminado_en: new Date().toISOString() });
  return { garcia, morales };
}

function montar(ui: ReactNode) {
  const user = userEvent.setup();
  return { user, ...render(<DatosProvider><DeshacerProvider>{ui}</DeshacerProvider></DatosProvider>) };
}

/** Bytes de un File (jsdom no siempre trae Blob.arrayBuffer). */
function bytes(f: Blob): Promise<Uint8Array> {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => mal(r.error);
    r.readAsArrayBuffer(f);
  });
}

const crearUrl = vi.fn((_: Blob) => 'blob:fergo');
const revocarUrl = vi.fn();

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  crearUrl.mockClear();
  revocarUrl.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { value: crearUrl, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revocarUrl, configurable: true, writable: true });
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true, writable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
});
afterEach(() => vi.useRealTimers());

describe('Informes (§10.9)', () => {
  it('pinta las cinco tarjetas con los datos, valores en texto y meses negativos sin rojo', async () => {
    await escena();
    const onVolver = vi.fn();
    const { user } = montar(<Informes etiquetaVolver="Movimientos" onVolver={onVolver} />);
    expect(await screen.findByRole('heading', { name: 'Informes', level: 1 })).toBeTruthy();

    // 1) Ganado por mes: noviembre 200 − 90 − 38,50 = 71,50 €; octubre − 120 € (sin rojo).
    await waitFor(() => expect(texto(screen.getByTestId('ganado-actual'))).toContain('71,50 €'));
    const ganado = tarjeta('ganado');
    expect(ganado.querySelectorAll('.barra-fila')).toHaveLength(12);
    const octubre = ganado.querySelector('[data-clave="2026-10"]')!;
    expect(texto(octubre)).toContain('Oct 26');
    expect(texto(octubre.querySelector('.barra-valor'))).toBe('− 120 €');
    expect(octubre.querySelector('.barra-relleno')!.className).toContain('negativa');
    expect(octubre.innerHTML).not.toMatch(/rojo/);
    expect(octubre.querySelector('.barra-pista')!.getAttribute('aria-hidden')).toBe('true');

    // 2) Gasto por categoría de noviembre, de mayor a menor; con el selector se pasa a octubre.
    const gasto = tarjeta('gasto');
    expect(texto(within(gasto).getByTestId('gasto-total'))).toContain('128,50 €');
    const filas = [...gasto.querySelectorAll('.barra-fila')].map((li) => [texto(li.querySelector('.barra-etiqueta')), texto(li.querySelector('.barra-valor'))]);
    expect(filas).toEqual([['Alquiler de furgoneta', '90 €'], ['Gasolina (vehículo)', '38,50 €']]);
    expect(within(gasto).getByRole('button', { name: 'Mes siguiente' }).hasAttribute('disabled')).toBe(true);
    await user.click(within(gasto).getByRole('button', { name: 'Mes anterior' }));
    expect(texto(gasto.querySelector('.mes'))).toBe('Octubre 2026');
    expect(texto(within(gasto).getByTestId('gasto-total'))).toContain('120 €');
    await user.click(within(gasto).getByRole('button', { name: 'Mes anterior' }));
    expect(texto(gasto)).toContain('No hay gastos en septiembre.');

    // 3) Margen por cliente: García 200 €, Morales − 90 €.
    const margen = [...tarjeta('margen').querySelectorAll('.fila-margen')].map((li) => [texto(li.querySelector('.margen-nombre')).split('Cobrado')[0], texto(li.querySelector('.margen-valor'))]);
    expect(margen).toEqual([['Fam. García', '200 €'], ['Sra. Morales', '− 90 €']]);

    // 4) Alquiler de furgoneta: 90 € en 3, 6 y 12 meses; media 30 €, 15 € y 7,50 €.
    const alquiler = tarjeta('alquiler');
    expect(texto(alquiler.querySelector('[data-meses="3"]'))).toBe('Últimos 3 meses90 € · 30 €/mes');
    expect(texto(alquiler.querySelector('[data-meses="12"]'))).toContain('7,50 €/mes');
    expect(texto(within(alquiler).getByTestId('alquiler-media'))).toContain('7,50 €');

    // 5) Crecimiento: 200 € en el año (sin el aporte ni el borrado), media 200/11, 2 clientes, 1 de abono.
    const crec = tarjeta('crecimiento');
    expect(texto(within(crec).getByTestId('ingresos-anio'))).toContain('200 €');
    expect(texto(within(crec).getByTestId('media-mensual'))).toBe('18,18 €');
    expect(texto(within(crec).getByTestId('clientes-activos'))).toBe('2');
    expect(texto(within(crec).getByTestId('clientes-abono'))).toBe('1');

    // 6) Exportar a Excel y volver.
    expect(screen.getByRole('button', { name: 'Exportar a Excel' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Movimientos' }));
    expect(onVolver).toHaveBeenCalled();
  });

  it('sin datos: estado vacío amable', async () => {
    montar(<Informes etiquetaVolver="Movimientos" onVolver={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Informes', level: 1 });
    await waitFor(() => expect(tarjeta('ganado')).toBeTruthy());
    expect(texto(tarjeta('ganado'))).toContain('Cuando registres cobros y gastos');
    expect(texto(tarjeta('margen'))).toContain('Cuando cobres a tus clientes');
    expect(texto(tarjeta('gasto'))).toContain('No hay gastos en noviembre.');
    expect(texto(screen.getByTestId('ganado-actual'))).toContain('0 €');
  });
});

describe('Exportar datos (§15)', () => {
  it('por defecto el año en curso; «Exportar a Excel» descarga un .xlsx con las 5 hojas', async () => {
    await escena();
    const clics = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user } = montar(<ExportarDatos />);
    const desde = (await screen.findByLabelText('Desde')) as HTMLInputElement;
    expect(desde.value).toBe('2026-01-01');
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('2026-12-31');
    const boton = screen.getByRole('button', { name: 'Exportar a Excel' });
    await waitFor(() => expect(boton.hasAttribute('disabled')).toBe(false));
    await user.click(boton);

    await waitFor(() => expect(crearUrl).toHaveBeenCalledTimes(1));
    expect(clics).toHaveBeenCalledTimes(1);
    const archivo = crearUrl.mock.calls[0][0] as File;
    expect(archivo.name).toBe('fergo-2026-01-01-a-2026-12-31.xlsx');
    const zip = leerZip(await bytes(archivo));
    for (let i = 1; i <= 5; i++) expect(zip.has(`xl/worksheets/sheet${i}.xml`)).toBe(true);
    const s1 = zip.get('xl/worksheets/sheet1.xml')!;
    expect(s1).toContain('<v>200.00</v>');
    expect(s1).toContain('<v>-90.00</v>');
    expect(s1).toContain('Furgo; día 3');
    expect(s1).not.toContain('999.00'); // borrado lógico fuera
    expect(zip.get('xl/worksheets/sheet2.xml')).toContain('Sra. Morales');
    expect(await screen.findByText('Listo. Archivo descargado.')).toBeTruthy();
    clics.mockRestore();
  });

  it('con hoja de compartir que admite archivos usa navigator.share', async () => {
    await escena();
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true, writable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    const { user } = montar(<ExportarDatos />);
    const boton = await screen.findByRole('button', { name: 'Exportar a Excel' });
    await waitFor(() => expect(boton.hasAttribute('disabled')).toBe(false));
    await user.click(boton);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].name.endsWith('.xlsx')).toBe(true);
    expect(crearUrl).not.toHaveBeenCalled();
    expect(await screen.findByText('Listo. Archivo compartido.')).toBeTruthy();
  });

  it('CSV: un archivo por hoja, es-ES, y el rango filtra', async () => {
    await escena();
    const clics = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user } = montar(<ExportarDatos />);
    const desde = (await screen.findByLabelText('Desde')) as HTMLInputElement;
    await user.clear(desde);
    await user.type(desde, '2026-11-01');
    const csv = screen.getByRole('button', { name: 'Mejor en CSV' });
    await waitFor(() => expect(csv.hasAttribute('disabled')).toBe(false));
    await user.click(csv);
    await waitFor(() => expect(crearUrl).toHaveBeenCalledTimes(5));
    const archivos = crearUrl.mock.calls.map((c) => c[0] as File);
    expect(archivos.map((f) => f.name)).toEqual([
      'fergo-movimientos-2026-11-01-a-2026-12-31.csv',
      'fergo-clientes-2026-11-01-a-2026-12-31.csv',
      'fergo-visitas-2026-11-01-a-2026-12-31.csv',
      'fergo-fianzas-2026-11-01-a-2026-12-31.csv',
      'fergo-prestamos-2026-11-01-a-2026-12-31.csv',
    ]);
    const b = await bytes(archivos[0]);
    expect([...b.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
    const movs = new TextDecoder().decode(b.subarray(3));
    expect(movs.split('\r\n')[0]).toBe('Fecha;Tipo;Categoría;Grupo;Importe;Medio de pago;Cliente;Nota;Inversión;Cuenta en ganado;Foto del ticket');
    expect(movs).toContain('03/11/2026;Gasto;Alquiler de furgoneta;Movilidad;-90,00;Efectivo;Sra. Morales;"Furgo; día 3";No;Sí;');
    expect(movs).toContain('01/11/2026;Aporte de capital;;;500,00;Efectivo;;;No;No;');
    expect(movs).not.toContain('10/10/2026'); // octubre fuera del rango
    clics.mockRestore();
  });
});
