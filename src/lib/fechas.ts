// Fechas en Europe/Madrid (§4.3) con nombres en español.
export const ZONA = 'Europe/Madrid';

export const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export interface PartesFecha {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  diaSemana: number;
}

const formateador = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
  weekday: 'short',
});
const SEMANA_EN: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Partes de un instante vistas en Madrid. */
export function partesMadrid(instante: Date | string | number): PartesFecha {
  const p: Record<string, string> = {};
  for (const { type, value } of formateador.formatToParts(new Date(instante))) p[type] = value;
  return {
    anio: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    diaSemana: SEMANA_EN[p.weekday],
  };
}

const dos = (n: number) => String(n).padStart(2, '0');

/** "2026-10-11": día natural en Madrid. */
export function claveDia(instante: Date | string | number): string {
  const p = partesMadrid(instante);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

/** "2026-10": mes natural en Madrid. */
export function claveMes(instante: Date | string | number): string {
  const p = partesMadrid(instante);
  return `${p.anio}-${dos(p.mes)}`;
}

/** Instante que corresponde a una hora local de Madrid. */
export function desdeMadrid(anio: number, mes: number, dia: number, hora = 12, minuto = 0): Date {
  const objetivo = Date.UTC(anio, mes - 1, dia, hora, minuto);
  let t = objetivo;
  for (let i = 0; i < 3; i++) {
    const p = partesMadrid(t);
    t += objetivo - Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto);
  }
  return new Date(t);
}

/** Convierte "2026-10-11" a instante, con la hora de 'referencia' (o las 12:00). */
export function instanteDeClaveDia(clave: string, referencia?: Date | string): Date {
  const [a, m, d] = clave.split('-').map(Number);
  if (referencia) {
    const p = partesMadrid(referencia);
    return desdeMadrid(a, m, d, p.hora, p.minuto);
  }
  return desdeMadrid(a, m, d, 12, 0);
}

export function sumarDias(clave: string, dias: number): string {
  const [a, m, d] = clave.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`;
}

/** "Domingo, 11 de octubre" */
export function fechaLarga(instante: Date | string | number): string {
  const p = partesMadrid(instante);
  return `${DIAS_LARGOS[p.diaSemana]}, ${p.dia} de ${MESES[p.mes - 1]}`;
}

export function diaSemanaDeClave(clave: string): number {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Encabezado de grupo en Movimientos (mockup p. 3): "HOY", "AYER", "MIÉRCOLES 8". */
export function encabezadoDia(clave: string, ahora: Date = new Date()): string {
  const hoy = claveDia(ahora);
  if (clave === hoy) return 'HOY';
  if (clave === sumarDias(hoy, -1)) return 'AYER';
  const d = Number(clave.split('-')[2]);
  return `${DIAS_LARGOS[diaSemanaDeClave(clave)].toUpperCase()} ${d}`;
}

/** Texto de la fila Fecha del formulario: "Hoy", "Ayer", "Mañana", "Mié 8 oct". */
export function etiquetaFechaCorta(clave: string, ahora: Date = new Date()): string {
  const hoy = claveDia(ahora);
  if (clave === hoy) return 'Hoy';
  if (clave === sumarDias(hoy, -1)) return 'Ayer';
  if (clave === sumarDias(hoy, 1)) return 'Mañana';
  const [, m, d] = clave.split('-').map(Number);
  return `${DIAS_CORTOS[diaSemanaDeClave(clave)]} ${d} ${MESES[m - 1].slice(0, 3)}`;
}

export function nombreMes(claveM: string): string {
  return MESES[Number(claveM.split('-')[1]) - 1];
}

export function mesConMayuscula(claveM: string): string {
  const n = nombreMes(claveM);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function sumarMeses(claveM: string, n: number): string {
  const [a, m] = claveM.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}`;
}
