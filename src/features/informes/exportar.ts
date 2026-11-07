import { activos, efectoEnCaja, efectoEnGanado, fianzas, prestamos } from '../../domain/cifras';
import { MEDIOS_PAGO, TIPOS_TRABAJO, type Categoria, type Cliente, type Movimiento, type TipoMovimiento, type Visita } from '../../domain/tipos';
import { claveDia } from '../../lib/fechas';

// Exportación de datos (§15): hojas Movimientos, Clientes, Visitas, Fianzas y Préstamos en .xlsx (generado aquí,
// sin dependencias: zip sin compresión «STORE» + SpreadsheetML mínimo) y alternativa CSV (es-ES: «;», coma decimal,
// BOM UTF-8). Todo son funciones puras salvo `compartirODescargar`. Se excluyen los borrados lógicos.

/** Celda: texto, importe en céntimos (euros con 2 decimales y «€» en Excel) o día "AAAA-MM-DD". */
export type Celda = string | number | { importe: number } | { fecha: string };
export type Fila = Celda[];
export interface Hoja {
  nombre: string;
  filas: Fila[]; // la primera es la cabecera
}
/** Rango de días en Madrid, ambos incluidos ("AAAA-MM-DD"). */
export interface Rango {
  desde: string;
  hasta: string;
}

const siNo = (v: boolean) => (v ? 'Sí' : 'No');
const enRango = (dia: string, r: Rango) => dia >= r.desde && dia <= r.hasta;

export const NOMBRE_TIPO: Record<TipoMovimiento, string> = {
  gasto: 'Gasto',
  cobro: 'Cobro',
  anticipo: 'Anticipo o señal',
  otro_ingreso: 'Otro ingreso',
  aporte: 'Aporte de capital',
  prestamo: 'Préstamo recibido',
  devolucion_prestamo: 'Devolución de préstamo',
  fianza_entregada: 'Fianza entregada',
  fianza_devuelta: 'Fianza devuelta',
  saldo_inicial: 'Saldo inicial',
};

const nombreMedio = (id: string) => MEDIOS_PAGO.find((x) => x.id === id)?.nombre ?? '';

/** Importe con signo según §9.1: lo que entra en caja, positivo; lo que sale, negativo. Un gasto siempre resta. */
export function importeConSigno(m: Pick<Movimiento, 'tipo' | 'importe'>): number {
  if (m.tipo === 'gasto') return -m.importe;
  return efectoEnCaja({ tipo: m.tipo, importe: m.importe }) < 0 ? -m.importe : m.importe;
}

export const CABECERA_MOVIMIENTOS = [
  'Fecha', 'Tipo', 'Categoría', 'Grupo', 'Importe', 'Medio de pago', 'Cliente', 'Nota', 'Inversión', 'Cuenta en ganado', 'Foto del ticket',
];

export function filasMovimientos(movs: Movimiento[], categorias: Categoria[], clientes: Cliente[], rango: Rango): Fila[] {
  const cats = new Map(categorias.map((c) => [c.id, c]));
  const nombres = new Map(clientes.map((c) => [c.id, c.nombre]));
  const filas = activos(movs)
    .map((m) => ({ m, dia: claveDia(m.fecha) }))
    .filter(({ dia }) => enRango(dia, rango))
    .sort((a, b) => a.m.fecha.localeCompare(b.m.fecha) || a.m.creado_en.localeCompare(b.m.creado_en))
    .map(({ m, dia }): Fila => {
      const c = m.categoria_id ? cats.get(m.categoria_id) : undefined;
      return [
        { fecha: dia },
        NOMBRE_TIPO[m.tipo] ?? m.tipo,
        c?.nombre ?? '',
        c?.grupo ?? '',
        { importe: importeConSigno(m) },
        nombreMedio(m.medio_pago),
        (m.cliente_id && nombres.get(m.cliente_id)) || '',
        m.nota,
        siNo(m.tipo === 'gasto' && m.es_inversion),
        siNo(efectoEnGanado(m) !== 0),
        // Las fotos sólo están en el móvil (tabla local): no hay enlace que poner.
        m.foto_id ? 'Foto en el móvil' : '',
      ];
    });
  return [CABECERA_MOVIMIENTOS, ...filas];
}

const TIPO_CLIENTE: Record<Cliente['tipo'], string> = { particular: 'Particular', comunidad: 'Comunidad', empresa: 'Empresa' };
const SERVICIO: Record<string, string> = { jardin: 'Jardín', piscina: 'Piscina' };
const nombreTrabajo = (id: string) => TIPOS_TRABAJO.find((t) => t.id === id)?.nombre ?? id;
const importeOpcional = (c: number | null): Celda => (c == null ? '' : { importe: c });

export function filasClientes(clientes: Cliente[]): Fila[] {
  const cabecera = [
    'Nombre', 'Tipo', 'Teléfono', 'Teléfono 2', 'Contacto', 'Dirección', 'Municipio', 'Servicios', 'Modalidad', 'Cuota de abono',
    'Día de cobro', 'Precio habitual', 'Activo', 'Notas',
  ];
  const filas = clientes
    .filter((c) => !c.eliminado_en)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((c): Fila => [
      c.nombre,
      TIPO_CLIENTE[c.tipo] ?? c.tipo,
      c.telefono ?? '',
      c.telefono_2 ?? '',
      c.contacto,
      c.direccion,
      c.municipio,
      c.servicios.map((s) => SERVICIO[s] ?? s).join(', '),
      c.modalidad === 'abono' ? 'Abono' : 'Puntual',
      importeOpcional(c.modalidad === 'abono' ? c.cuota_abono : null),
      c.modalidad === 'abono' && c.dia_cobro_abono ? c.dia_cobro_abono : '',
      importeOpcional(c.precio_habitual),
      siNo(c.activo),
      c.notas,
    ]);
  return [cabecera, ...filas];
}

const ESTADO_VISITA: Record<Visita['estado'], string> = { programada: 'Programada', hecha: 'Hecha', cancelada: 'Cancelada' };

export function filasVisitas(visitas: Visita[], clientes: Cliente[], rango: Rango): Fila[] {
  const nombres = new Map(clientes.map((c) => [c.id, c.nombre]));
  const cabecera = ['Fecha', 'Hora', 'Duración (min)', 'Cliente', 'Trabajos', 'Descripción', 'Precio', 'En el abono', 'Furgoneta', 'Ayudantes', 'Estado'];
  const filas = visitas
    .filter((v) => !v.eliminado_en && enRango(v.fecha, rango))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? ''))
    .map((v): Fila => [
      { fecha: v.fecha },
      v.hora_inicio ?? '',
      v.duracion,
      nombres.get(v.cliente_id) ?? '',
      v.tipos_trabajo.map(nombreTrabajo).join(', '),
      v.descripcion,
      importeOpcional(v.precio),
      siNo(v.incluida_en_abono),
      siNo(v.requiere_vehiculo),
      v.ayudantes,
      ESTADO_VISITA[v.estado] ?? v.estado,
    ]);
  return [cabecera, ...filas];
}

const ESTADO_FIANZA = { pendiente: 'Pendiente de devolver', devuelta: 'Devuelta', devuelta_parcial: 'Devuelta con descuento' } as const;

/** Fianzas (§8.8, §9.6): cada «fianza entregada» con lo devuelto y lo descontado (de domain/cifras). */
export function filasFianzas(movs: Movimiento[], rango: Rango): Fila[] {
  const cabecera = ['Fecha', 'Entregada a', 'Motivo', 'Importe', 'Devuelto', 'Descontado', 'Pendiente', 'Estado', 'Medio de pago'];
  const filas = fianzas(movs)
    .map((f) => ({ f, dia: claveDia(f.entrega.fecha) }))
    .filter(({ dia }) => enRango(dia, rango))
    .sort((a, b) => a.f.entrega.fecha.localeCompare(b.f.entrega.fecha))
    .map(({ f, dia }): Fila => [
      { fecha: dia },
      f.entrega.fianza?.entregada_a ?? '',
      f.entrega.fianza?.motivo || f.entrega.nota,
      { importe: f.entrega.importe },
      { importe: f.devuelto },
      { importe: f.descontado },
      { importe: Math.max(0, f.entrega.importe - f.devuelto - f.descontado) },
      ESTADO_FIANZA[f.estado],
      nombreMedio(f.entrega.medio_pago),
    ]);
  return [cabecera, ...filas];
}

/** Préstamos (§8.9): cada «préstamo recibido» con lo devuelto y lo pendiente (de domain/cifras). */
export function filasPrestamos(movs: Movimiento[], rango: Rango): Fila[] {
  const cabecera = ['Fecha', 'Importe', 'Devuelto', 'Pendiente', 'Estado', 'Medio de pago', 'Nota'];
  const filas = prestamos(movs)
    .map((p) => ({ p, dia: claveDia(p.prestamo.fecha) }))
    .filter(({ dia }) => enRango(dia, rango))
    .map(({ p, dia }): Fila => [
      { fecha: dia },
      { importe: p.prestamo.importe },
      { importe: p.devuelto },
      { importe: p.pendiente },
      p.pendiente > 0 ? 'Pendiente' : 'Devuelto',
      nombreMedio(p.prestamo.medio_pago),
      p.prestamo.nota,
    ]);
  return [cabecera, ...filas];
}

export interface DatosExportar {
  movimientos: Movimiento[];
  categorias: Categoria[];
  clientes: Cliente[];
  visitas: Visita[];
}

/** Las cinco hojas de §15, en orden. */
export function hojasExportacion(d: DatosExportar, rango: Rango): Hoja[] {
  return [
    { nombre: 'Movimientos', filas: filasMovimientos(d.movimientos, d.categorias, d.clientes, rango) },
    { nombre: 'Clientes', filas: filasClientes(d.clientes) },
    { nombre: 'Visitas', filas: filasVisitas(d.visitas, d.clientes, rango) },
    { nombre: 'Fianzas', filas: filasFianzas(d.movimientos, rango) },
    { nombre: 'Préstamos', filas: filasPrestamos(d.movimientos, rango) },
  ];
}

// ---------- Texto de celdas ----------

/** Céntimos a euros sin coma flotante: "-38.50" con `decimal` '.', "-38,50" con ','. Sin separador de miles. */
export function centimosADecimal(centimos: number, decimal: '.' | ','): string {
  const abs = Math.abs(centimos);
  return `${centimos < 0 ? '-' : ''}${Math.floor(abs / 100)}${decimal}${String(abs % 100).padStart(2, '0')}`;
}

/** "2026-11-07" → "07/11/2026". */
export function fechaEs(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

function textoCsv(c: Celda): string {
  if (typeof c === 'number') return String(c).replace('.', ',');
  if (typeof c === 'string') return c;
  if ('importe' in c) return centimosADecimal(c.importe, ',');
  return fechaEs(c.fecha);
}

const escaparCsv = (t: string) => (/[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

/** CSV es-ES para Excel: BOM UTF-8, separador «;», coma decimal, filas separadas por CRLF. */
export function aCsv(filas: Fila[]): string {
  return '﻿' + filas.map((f) => f.map((c) => escaparCsv(textoCsv(c))).join(';')).join('\r\n') + '\r\n';
}

// ---------- ZIP sin compresión (STORE) ----------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip con los archivos sin comprimir (método 0). Nombres en UTF-8 (bit 11). */
export function crearZip(archivos: { nombre: string; datos: Uint8Array }[], fecha: Date = new Date()): Uint8Array {
  const cod = new TextEncoder();
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1);
  const dia = ((Math.max(1980, fecha.getFullYear()) - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = cod.encode(a.nombre);
    const crc = crc32(a.datos);
    const local = new Uint8Array(30 + nombre.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, hora, true);
    l.setUint16(12, dia, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, a.datos.length, true);
    l.setUint32(22, a.datos.length, true);
    l.setUint16(26, nombre.length, true);
    l.setUint16(28, 0, true);
    local.set(nombre, 30);
    const central = new Uint8Array(46 + nombre.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.datos.length, true);
    c.setUint32(24, a.datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, desplazamiento, true);
    central.set(nombre, 46);
    locales.push(local, a.datos);
    centrales.push(central);
    desplazamiento += local.length + a.datos.length;
  }
  const tamCentral = centrales.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, archivos.length, true);
  f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, desplazamiento, true);
  const total = new Uint8Array(desplazamiento + tamCentral + 22);
  let p = 0;
  for (const parte of [...locales, ...centrales, fin]) {
    total.set(parte, p);
    p += parte.length;
  }
  return total;
}

// ---------- XLSX (SpreadsheetML mínimo) ----------

/** Escapa texto para XML y quita los caracteres de control que XML no admite. */
export function escaparXml(t: string): string {
  return t
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Columna A, B, …, Z, AA… para el índice (0 = A). */
export function letraColumna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Días desde 30/12/1899 (fecha serie de Excel). */
export function serieExcel(dia: string): number {
  const [a, m, d] = dia.split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

// Estilos (índices de cellXfs): 0 normal, 1 importe «#.##0,00 €», 2 fecha dd/mm/aaaa, 3 cabecera en negrita.
const ESTILO = { importe: 1, fecha: 2, cabecera: 3 } as const;

const ESTILOS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function celdaXml(c: Celda, ref: string, cabecera: boolean): string {
  if (typeof c === 'string') {
    if (c === '') return '';
    return `<c r="${ref}" t="inlineStr"${cabecera ? ` s="${ESTILO.cabecera}"` : ''}><is><t xml:space="preserve">${escaparXml(c)}</t></is></c>`;
  }
  if (typeof c === 'number') return Number.isFinite(c) ? `<c r="${ref}"><v>${c}</v></c>` : '';
  if ('importe' in c) return `<c r="${ref}" s="${ESTILO.importe}"><v>${centimosADecimal(c.importe, '.')}</v></c>`;
  return `<c r="${ref}" s="${ESTILO.fecha}"><v>${serieExcel(c.fecha)}</v></c>`;
}

const largoVisible = (c: Celda) =>
  typeof c === 'string' ? c.length : typeof c === 'number' ? String(c).length : 'importe' in c ? centimosADecimal(c.importe, ',').length + 4 : 10;

export function hojaXml(filas: Fila[]): string {
  const columnas = Math.max(0, ...filas.map((f) => f.length));
  const anchos = Array.from({ length: columnas }, (_, i) => Math.min(60, Math.max(10, ...filas.map((f) => (f[i] === undefined ? 0 : largoVisible(f[i]) + 2)))));
  const cols = columnas ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const filasXml = filas
    .map((f, r) => `<row r="${r + 1}">${f.map((c, i) => celdaXml(c, `${letraColumna(i)}${r + 1}`, r === 0)).join('')}</row>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `${cols}<sheetData>${filasXml}</sheetData></worksheet>`
  );
}

/** Nombre de hoja válido para Excel: sin []:*?/\ y como mucho 31 caracteres. */
const nombreHoja = (n: string) => n.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Hoja';

/** Libro .xlsx con una hoja por elemento (sheet1.xml, sheet2.xml…). */
export function crearXlsx(hojas: Hoja[], fecha: Date = new Date()): Uint8Array {
  const cod = new TextEncoder();
  const n = hojas.length;
  const idx = hojas.map((_, i) => i + 1);
  const tipos =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    idx.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const libro =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${hojas.map((h, i) => `<sheet name="${escaparXml(nombreHoja(h.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
    '</workbook>';
  const relsLibro =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    idx.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';
  return crearZip(
    [
      { nombre: '[Content_Types].xml', datos: cod.encode(tipos) },
      { nombre: '_rels/.rels', datos: cod.encode(rels) },
      { nombre: 'xl/workbook.xml', datos: cod.encode(libro) },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: cod.encode(relsLibro) },
      { nombre: 'xl/styles.xml', datos: cod.encode(ESTILOS_XML) },
      ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: cod.encode(hojaXml(h.filas)) })),
    ],
    fecha,
  );
}

// ---------- Archivos y compartir ----------

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const sufijo = (r: Rango) => `${r.desde}-a-${r.hasta}`;

export function archivoXlsx(hojas: Hoja[], rango: Rango): File {
  return new File([crearXlsx(hojas) as BlobPart], `fergo-${sufijo(rango)}.xlsx`, { type: TIPO_XLSX });
}

/** Un CSV por hoja: «fergo-movimientos-2026-01-01-a-2026-12-31.csv». */
export function archivosCsv(hojas: Hoja[], rango: Rango): File[] {
  const base = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return hojas.map((h) => new File([aCsv(h.filas)], `fergo-${base(h.nombre)}-${sufijo(rango)}.csv`, { type: 'text/csv;charset=utf-8' }));
}

/**
 * Hoja de compartir del sistema si admite archivos (iOS: Mail, WhatsApp, Archivos); si no, descarga con <a download>.
 * Devuelve cómo acabó: 'compartido', 'descargado' o 'cancelado' (el usuario cerró la hoja de compartir).
 */
export async function compartirODescargar(archivos: File[], titulo = 'Datos de FERGO'): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.canShare?.({ files: archivos }) && nav.share) {
    try {
      await nav.share({ files: archivos, title: titulo });
      return 'compartido';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelado';
      // Otro fallo de la hoja de compartir: se descarga igualmente.
    }
  }
  for (const f of archivos) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return 'descargado';
}

/** Rango por defecto (§15): el año en curso en Madrid. */
export function rangoAnioEnCurso(ahora: Date = new Date()): Rango {
  const anio = claveDia(ahora).slice(0, 4);
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}
