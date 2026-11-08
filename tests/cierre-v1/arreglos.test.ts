// Cierre de la v1 (coordinadora, 2026-11-07): lo que los QA de las olas 8 y 9 habían aceptado sin corregir y Ariel
// pidió arreglar antes del release («arreglá todo antes de pushear»).
import { beforeEach, describe, expect, it } from 'vitest';
import { db, reiniciarBase } from '../../src/db/db';
import { crearCliente, type DatosCliente } from '../../src/db/repo';
import { DIAS_CLAVES_AVISADAS, podarClaves } from '../../src/features/avisos/envio';
import { aCsv } from '../../src/features/informes/exportar';
import { registrarGastoArticulo } from '../../src/features/preparar/operaciones';
import { AJUSTES_LOCALES, configurarServidor, hayServidor } from '../../src/sync/sincronizacion';

describe('CSV · un texto que empieza por = + - @ no se abre como fórmula', () => {
  it('antepone apóstrofo a los textos peligrosos y deja números y textos normales igual', () => {
    const csv = aCsv([['=HYPERLINK("x")', '+34 611', '-nota', '@sum', 'Abono octubre', -38.5]]);
    const fila = csv.replace(/^﻿/, '').split('\r\n')[0];
    expect(fila).toBe(`"'=HYPERLINK(""x"")";'+34 611;'-nota;'@sum;Abono octubre;-38,5`);
  });
});

describe('Registro de avisos · se poda lo que tiene más de 90 días', () => {
  it('quita las claves viejas y conserva las recientes', () => {
    const ahora = new Date('2026-11-07T12:00:00Z');
    const viejo = new Date(ahora.getTime() - (DIAS_CLAVES_AVISADAS + 1) * 86_400_000).toISOString();
    const reciente = new Date(ahora.getTime() - 10 * 86_400_000).toISOString();
    expect(podarClaves({ a: viejo, b: reciente, c: ahora.toISOString() }, ahora)).toEqual({ b: reciente, c: ahora.toISOString() });
  });
});

describe('Sincronización · ajustes propios de cada móvil y «Ticket sin subir»', () => {
  it('el último medio de pago y la bienvenida no viajan al servidor', () => {
    for (const clave of ['ultimo_medio_pago', 'pasos_bienvenida', 'saldo_inicial_hecho', 'usuario_actual']) {
      expect(AJUSTES_LOCALES.has(clave)).toBe(true);
    }
  });

  it('sin servidor enchufado no hay adónde subir fotos; con servidor, sí', () => {
    configurarServidor(null);
    expect(hayServidor()).toBe(false);
    configurarServidor({ enviar: async () => undefined, subirFoto: async () => undefined });
    expect(hayServidor()).toBe(true);
    configurarServidor(null);
  });
});

describe('Preparar · un artículo comprado no admite un segundo gasto', () => {
  const BASE: DatosCliente = {
    nombre: 'Urb. El Olivar', tipo: 'comunidad', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Olivo 1',
    municipio: 'Madrid', lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null,
    frecuencia_visitas: null, dias_preferidos: [], hora_preferida: null, duracion_habitual: 120, tipos_trabajo_habituales: [],
    precio_habitual: null, requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true,
  };

  beforeEach(async () => {
    await reiniciarBase('fergo');
    await crearCliente(BASE); // deja la base preparada con el titular
  });

  it('el segundo registro del mismo artículo se rechaza; tras deshacer el primero, se puede volver a registrar', async () => {
    const categoria = (await db.categorias.toArray()).find((c) => !c.eliminado_en)!.id;
    const item = { nombre: 'Abono', tipo: null, extra: true };
    const datos = { importe: 1500, categoria_id: categoria, medio_pago: 'efectivo' as const, cliente_id: null };
    const primero = await registrarGastoArticulo('2026-11-11', item, datos);
    await expect(registrarGastoArticulo('2026-11-11', item, datos)).rejects.toThrow('ya tiene su gasto registrado');
    expect((await db.movimientos.filter((m) => !m.eliminado_en && m.nota === 'Abono').toArray()).length).toBe(1);
    await primero.deshacer();
    await registrarGastoArticulo('2026-11-11', item, datos);
    expect((await db.movimientos.filter((m) => !m.eliminado_en && m.nota === 'Abono').toArray()).length).toBe(1);
  });
});
