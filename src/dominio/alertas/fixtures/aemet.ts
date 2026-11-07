// FIXTURES DE PRUEBA. Avisos AEMET simulados en formato parecido a CAP (Meteoalerta). No vienen de AEMET real y
// nunca se activan en la app: sólo las pruebas los pasan a `crearProveedorAemetSimulado`.

import type { AlertaCap } from '../aemet';

/** Polígono aproximado de la zona «Metropolitana y Henares» (simplificado, para pruebas). */
export const POLIGONO_METROPOLITANA = '40.25,-3.95 40.25,-3.45 40.60,-3.45 40.60,-3.95 40.25,-3.95';
/** Polígono de la Sierra (simplificado), fuera de Madrid capital. */
export const POLIGONO_SIERRA = '40.62,-4.25 40.62,-3.80 40.95,-3.80 40.95,-4.25 40.62,-4.25';

export function avisoCap(p: {
  id: string;
  nivel: 'verde' | 'amarillo' | 'naranja' | 'rojo';
  fenomeno: 'VI' | 'PR' | 'TO' | 'TM' | 'NE' | 'PO';
  onset: string;
  expires: string;
  poligono?: string;
  zona?: string;
  status?: AlertaCap['status'];
  msgType?: AlertaCap['msgType'];
}): AlertaCap {
  const nombres: Record<string, string> = { VI: 'vientos', PR: 'lluvias', TO: 'tormentas', TM: 'temperaturas máximas', NE: 'nevadas', PO: 'polvo' };
  return {
    identifier: `2.49.0.0.724.0.ES.${p.id}`,
    sender: 'aemet-simulado@fergo.local',
    sent: p.onset,
    status: p.status ?? 'Actual',
    msgType: p.msgType ?? 'Alert',
    scope: 'Public',
    info: [
      {
        language: 'es-ES',
        category: 'Met',
        event: `Aviso de ${nombres[p.fenomeno]} de nivel ${p.nivel}`,
        urgency: 'Future',
        severity: p.nivel === 'rojo' ? 'Extreme' : p.nivel === 'naranja' ? 'Severe' : 'Moderate',
        certainty: 'Likely',
        onset: p.onset,
        expires: p.expires,
        headline: `Aviso ${p.nivel}. ${nombres[p.fenomeno]}`,
        parameter: [
          { valueName: 'AEMET-Meteoalerta nivel', value: p.nivel },
          { valueName: 'AEMET-Meteoalerta fenomeno', value: `${p.fenomeno};${nombres[p.fenomeno]}` },
          { valueName: 'AEMET-Meteoalerta parametro', value: p.fenomeno === 'VI' ? 'VI;Rachas máximas;70 km/h' : `${p.fenomeno};Valor;-` },
        ],
        area: [{ areaDesc: 'Metropolitana y Henares', polygon: p.poligono ?? POLIGONO_METROPOLITANA, geocode: { valueName: 'AEMET-Meteoalerta zona', value: p.zona ?? '722802' } }],
      },
    ],
  };
}
