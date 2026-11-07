import { claveDia, sumarDias } from '../lib/fechas';
import { claveHora } from './horas';
import type { AvisoOficial, DiaClima, HoraClima, ProveedorClima, Ubicacion } from './tipos';

// Proveedor de clima SIMULADO (§13.2: el real va tras la misma interfaz). Datos deterministas: la misma ubicación,
// día y hora dan siempre el mismo valor, para que las pruebas y las demostraciones sean repetibles. No son
// previsiones reales: `fuente: 'simulada'` permite que la interfaz lo indique.

/** Redondeo a 2 decimales (~1 km), §11.1: se consulta una vez por punto y las coordenadas van sin datos personales (§16.5). */
export const redondear = (u: Ubicacion): Ubicacion => ({ lat: Math.round(u.lat * 100) / 100, lon: Math.round(u.lon * 100) / 100 });

/** Hash determinista de una cadena → [0, 1). */
function azar(clave: string): number {
  let h = 2166136261;
  for (let i = 0; i < clave.length; i++) {
    h ^= clave.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Temperaturas medias de Madrid por mes (máx/mín aproximadas, °C) para que los datos sean verosímiles.
const MAX_MES = [10, 12, 16, 18, 23, 29, 33, 32, 27, 20, 14, 10];
const MIN_MES = [3, 4, 6, 8, 11, 16, 19, 19, 16, 11, 6, 3];

export interface OpcionesSimulado {
  /** Cambia valores de horas concretas (escenarios de prueba o demostración). */
  escenario?: (u: Ubicacion, hora: string) => Partial<Omit<HoraClima, 'hora'>> | null | undefined;
  /** Avisos oficiales simulados. */
  avisos?: AvisoOficial[] | ((u: Ubicacion, desde: string, hasta: string) => AvisoOficial[]);
  /** Fuerza un fallo (proveedor sin respuesta) para probar «Sin previsión». */
  fallar?: boolean | (() => boolean);
  /** Reloj inyectable (pruebas). */
  ahora?: () => Date;
}

export function horaSimulada(u: Ubicacion, hora: string): HoraClima {
  const r = redondear(u);
  const base = `${r.lat},${r.lon}|`;
  const dia = hora.slice(0, 10);
  const h = Number(hora.slice(11, 13));
  const mes = Number(dia.slice(5, 7)) - 1;
  // Tiempo del día: unos días secos, otros inestables.
  const tipoDia = azar(base + dia);
  const lluviosa = tipoDia > 0.72;
  const nuboso = tipoDia > 0.45;
  const diurno = Math.sin(((h - 9) / 24) * 2 * Math.PI); // máximo hacia las 15:00
  const temperatura = Math.round((((MAX_MES[mes] + MIN_MES[mes]) / 2 + ((MAX_MES[mes] - MIN_MES[mes]) / 2) * diurno + (azar(base + dia + 't') - 0.5) * 4) * 10)) / 10;
  const prob = lluviosa ? Math.round(40 + azar(base + hora + 'p') * 55) : nuboso ? Math.round(azar(base + hora + 'p') * 35) : Math.round(azar(base + hora + 'p') * 10);
  const precipitacion = lluviosa && prob > 60 ? Math.round(azar(base + hora + 'mm') * 40) / 10 : 0;
  const viento = Math.round(5 + azar(base + dia + 'v') * 15 + azar(base + hora + 'v') * 8);
  const rachas = Math.round(viento * (1.4 + azar(base + hora + 'r') * 0.5));
  const codigo_wmo = precipitacion >= 2.5 ? 63 : precipitacion > 0 ? 61 : nuboso ? 3 : tipoDia > 0.2 ? 2 : 0;
  return { hora, prob_precipitacion: prob, precipitacion, codigo_wmo, temperatura, viento, rachas };
}

/** Resume horas en días (máx., mín., probabilidad máxima, lluvia total y el código más significativo). */
export function resumirDias(horas: HoraClima[]): DiaClima[] {
  const porDia = new Map<string, HoraClima[]>();
  for (const h of horas) {
    const d = h.hora.slice(0, 10);
    porDia.set(d, [...(porDia.get(d) ?? []), h]);
  }
  return [...porDia.entries()].map(([fecha, hs]) => ({
    fecha,
    max: Math.round(Math.max(...hs.map((x) => x.temperatura))),
    min: Math.round(Math.min(...hs.map((x) => x.temperatura))),
    prob_precipitacion: Math.max(...hs.map((x) => x.prob_precipitacion)),
    precipitacion: Math.round(hs.reduce((s, x) => s + x.precipitacion, 0) * 10) / 10,
    // Diurno (08–20): el código más severo de las horas de trabajo.
    codigo_wmo: Math.max(...hs.filter((x) => { const h = Number(x.hora.slice(11, 13)); return h >= 8 && h <= 20; }).map((x) => x.codigo_wmo)),
  }));
}

export function crearProveedorSimulado(op: OpcionesSimulado = {}): ProveedorClima {
  const ahora = op.ahora ?? (() => new Date());
  const falla = () => (typeof op.fallar === 'function' ? op.fallar() : Boolean(op.fallar));
  return {
    nombre: 'simulada',
    async prevision(ubicacion, dias) {
      if (falla()) throw new Error('El servicio del tiempo no responde');
      const u = redondear(ubicacion);
      const hoy = claveDia(ahora());
      const horas: HoraClima[] = [];
      // Desde ayer: la regla de césped mira las 12 h previas a una visita temprana de hoy.
      for (let d = -1; d < Math.min(dias, 16); d++) {
        const dia = sumarDias(hoy, d);
        for (let h = 0; h < 24; h++) {
          const clave = claveHora(dia, h);
          horas.push({ ...horaSimulada(u, clave), ...(op.escenario?.(u, clave) ?? {}) });
        }
      }
      return { ubicacion: u, horas, dias: resumirDias(horas).filter((d) => d.fecha >= hoy), actualizado_en: ahora().toISOString(), fuente: 'simulada' };
    },
    async avisos(ubicacion, desde, hasta) {
      if (falla()) throw new Error('El servicio del tiempo no responde');
      const lista = typeof op.avisos === 'function' ? op.avisos(redondear(ubicacion), desde, hasta) : (op.avisos ?? []);
      return lista.filter((a) => a.fecha >= desde && a.fecha <= hasta);
    },
  };
}
