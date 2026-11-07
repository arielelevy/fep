// Mensajes al cliente y enlace wa.me (§13.1). No se envía nada: sólo se arma el texto y el enlace.
import { describe, expect, it } from 'vitest';
import { enlaceWhatsApp, esE164, mensajeCancelarVisita, mensajeMoverVisita, mensajeRecordatorioCobro } from './whatsapp';

describe('Plantillas de §13.1', () => {
  it('mover por clima: el motivo cambia según la causa; fechas «el jueves 15», «el viernes 16 a las 09:00»', () => {
    expect(mensajeMoverVisita({ fechaOriginal: '2026-10-15', fechaNueva: '2026-10-16', horaNueva: '09:00', causa: 'lluvia' })).toBe(
      'Hola, soy Felipe de FERGO. Por la lluvia prevista el jueves 15, ¿te va bien que pase el viernes 16 a las 09:00?',
    );
    expect(mensajeMoverVisita({ fechaOriginal: '2026-10-15', fechaNueva: '2026-10-16', horaNueva: '09:00', causa: 'viento' })).toContain('Por el viento previsto el jueves 15');
    expect(mensajeMoverVisita({ fechaOriginal: '2026-10-15', fechaNueva: '2026-10-16', horaNueva: '08:00', causa: 'calor' })).toContain('Por el calor previsto');
    expect(mensajeMoverVisita({ fechaOriginal: '2026-10-15', fechaNueva: '2026-10-16', horaNueva: '08:00', causa: 'tormenta' })).toContain('Por la tormenta prevista');
    expect(mensajeMoverVisita({ fechaOriginal: '2026-10-15', fechaNueva: '2026-10-16', horaNueva: '08:00', causa: 'helada' })).toContain('Por la helada prevista');
  });
  it('mover por otro motivo', () => {
    expect(mensajeMoverVisita({ fechaOriginal: '2026-10-15', fechaNueva: '2026-10-19', horaNueva: '11:30', causa: null })).toBe(
      'Hola, soy Felipe de FERGO. ¿Te va bien que la visita del jueves 15 la pase al lunes 19 a las 11:30?',
    );
  });
  it('cancelar y recordatorio de cobro (importe en céntimos)', () => {
    expect(mensajeCancelarVisita('2026-10-15')).toBe('Hola, soy Felipe de FERGO. Tengo que cancelar la visita del jueves 15. Te escribo para buscar otro día.');
    expect(mensajeRecordatorioCobro('el abono de octubre', 9000)).toBe(
      'Hola, soy Felipe de FERGO. Te recuerdo el pago de el abono de octubre (90 €). Puedes hacerlo por Bizum a este número. ¡Gracias!',
    );
    expect(mensajeRecordatorioCobro('la poda', 3850)).toContain('(38,50 €)');
  });
});

describe('Enlace wa.me', () => {
  it('teléfono E.164 sin «+» y texto codificado', () => {
    const texto = 'Hola, soy Felipe de FERGO. Por la lluvia prevista el jueves 15, ¿te va bien que pase el viernes 16 a las 09:00?';
    const url = enlaceWhatsApp('+34611566779', texto)!;
    expect(url.startsWith('https://wa.me/34611566779?text=Hola%2C%20soy%20Felipe')).toBe(true);
    expect(decodeURIComponent(url.split('?text=')[1])).toBe(texto);
    expect(url).not.toMatch(/ |¿|,/); // espacios, «¿» y comas van codificados
    expect(new URL(url).searchParams.get('text')).toBe(texto);
  });
  it('codifica &, #, + y saltos de línea', () => {
    const url = enlaceWhatsApp('+34611566779', 'A & B #1 + 2\nok')!;
    expect(new URL(url).searchParams.get('text')).toBe('A & B #1 + 2\nok');
  });
  it('sin texto: abre el chat vacío', () => {
    expect(enlaceWhatsApp('+34611566779')).toBe('https://wa.me/34611566779');
  });
  it.each([null, undefined, '', '611566779', '+34 611 566 779', '0034611566779', '+0123456789'])('teléfono no válido (%s) → null', (t) => {
    expect(enlaceWhatsApp(t as string | null, 'hola')).toBeNull();
    expect(esE164(t as string | null)).toBe(false);
  });
});
