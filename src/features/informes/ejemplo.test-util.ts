// Datos de ejemplo para las pruebas puras de Informes y Exportación (no es una prueba: lo importan las que sí lo son).
import { expect } from 'vitest';
import { crc32 } from './exportar';
import type { Categoria, Cliente, Movimiento, TipoMovimiento, Visita } from '../../domain/tipos';
import { desdeMadrid } from '../../lib/fechas';

const comunes = (id: string) => ({
  id,
  negocio_id: 'n',
  creado_en: '2026-01-01T00:00:00.000Z',
  actualizado_en: '2026-01-01T00:00:00.000Z',
  creado_por: 'u',
  modificado_por: 'u',
  eliminado_en: null as string | null,
  version: 1,
});

let n = 0;
/** Movimiento el día (Madrid, 12:00) `dia` "AAAA-MM-DD". */
export function mov(tipo: TipoMovimiento, importe: number, dia: string, extra: Partial<Movimiento> = {}): Movimiento {
  const [a, m, d] = dia.split('-').map(Number);
  return {
    ...comunes(`m${++n}`),
    tipo,
    importe,
    fecha: desdeMadrid(a, m, d, 12).toISOString(),
    categoria_id: null,
    medio_pago: 'efectivo',
    cliente_id: null,
    nota: '',
    foto_id: null,
    es_inversion: false,
    con_iva: null,
    base: null,
    cuota_iva: null,
    ...extra,
  };
}

export function cat(id: string, clave: string, nombre: string, grupo: Categoria['grupo'], es_inversion = false): Categoria {
  return {
    ...comunes(id), clave, nombre, nombre_corto: nombre, grupo, icono: 'Ellipsis', tipo: 'gasto', es_inversion, visible: true, orden_manual: 1, contador_uso_60d: 0,
  };
}

export function cliente(id: string, nombre: string, extra: Partial<Cliente> = {}): Cliente {
  return {
    ...comunes(id), nombre, tipo: 'particular', telefono: '+34611566779', telefono_2: null, contacto: '', direccion: 'Calle Olivo 1', municipio: 'Madrid',
    lat: null, lon: null, servicios: ['jardin'], modalidad: 'puntual', cuota_abono: null, dia_cobro_abono: null, frecuencia_visitas: null,
    dias_preferidos: [], hora_preferida: null, duracion_habitual: 60, tipos_trabajo_habituales: [], precio_habitual: null,
    requiere_vehiculo_por_defecto: false, ayudantes_por_defecto: 0, notas: '', activo: true, ...extra,
  };
}

export function visita(id: string, clienteId: string, fecha: string, extra: Partial<Visita> = {}): Visita {
  return {
    ...comunes(id), cliente_id: clienteId, fecha, hora_inicio: '09:00', duracion: 60, tipos_trabajo: ['corte_cesped'], descripcion: '', precio: 4500,
    incluida_en_abono: false, requiere_vehiculo: false, ayudantes: 0, estado: 'programada', serie_id: null, fecha_serie: null,
    reprogramada_desde: null, motivo_reprogramacion: null, motivo_cancelacion: '', hecha_en: null, ...extra,
  };
}

export const CATS = [
  cat('c-alq', 'alquiler_furgoneta', 'Alquiler de furgoneta', 'Movilidad'),
  cat('c-gas', 'gasolina', 'Gasolina (vehículo)', 'Movilidad'),
  cat('c-her', 'herramientas', 'Herramientas y equipos nuevos', 'Equipos', true),
];

/** Lee un zip sin compresión desde sus cabeceras locales y comprueba método y CRC. */
export function leerZip(bytes: Uint8Array): Map<string, string> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const archivos = new Map<string, string>();
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    expect(dv.getUint16(p + 8, true)).toBe(0); // STORE
    const crc = dv.getUint32(p + 14, true);
    const tam = dv.getUint32(p + 18, true);
    expect(dv.getUint32(p + 22, true)).toBe(tam);
    const largoNombre = dv.getUint16(p + 26, true);
    const extra = dv.getUint16(p + 28, true);
    const nombre = dec.decode(bytes.subarray(p + 30, p + 30 + largoNombre));
    const ini = p + 30 + largoNombre + extra;
    const datos = bytes.subarray(ini, ini + tam);
    expect(crc32(datos)).toBe(crc);
    archivos.set(nombre, dec.decode(datos));
    p = ini + tam;
  }
  // Directorio central y fin de directorio con el mismo número de entradas.
  const fin = bytes.length - 22;
  expect(dv.getUint32(fin, true)).toBe(0x06054b50);
  expect(dv.getUint16(fin + 10, true)).toBe(archivos.size);
  expect(dv.getUint32(fin + 16, true)).toBe(p);
  return archivos;
}
