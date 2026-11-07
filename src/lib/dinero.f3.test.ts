import { describe, expect, it } from 'vitest';
import {
  IMPORTE_MAXIMO,
  centimosATexto,
  formatearConSigno,
  formatearEuros,
  formatearMientrasEscribe,
  parsearImporte,
} from './dinero';

// Feature 3 (frente B). Especificación §4.3: importes en céntimos enteros, formato es-ES
// "1.240 €", "38,50 €"; sin decimales si son ",00" en resúmenes y con decimales en el detalle.
// §10.2.1.3: acepta coma decimal, máximo 99.999,99 €, formatea mientras se escribe.

describe('Formato es-ES de importes (§4.3)', () => {
  it('resumen: sin decimales si son ,00 y con punto de miles', () => {
    expect(formatearEuros(124000)).toBe('1.240 €');
    expect(formatearEuros(3850)).toBe('38,50 €');
    expect(formatearEuros(0)).toBe('0 €');
    expect(formatearEuros(5)).toBe('0,05 €');
    expect(formatearEuros(99900)).toBe('999 €');
    expect(formatearEuros(100000)).toBe('1.000 €');
    expect(formatearEuros(9999999)).toBe('99.999,99 €');
    expect(formatearEuros(123456789)).toBe('1.234.567,89 €');
  });

  it('detalle: siempre con dos decimales', () => {
    expect(formatearEuros(124000, 'detalle')).toBe('1.240,00 €');
    expect(formatearEuros(3850, 'detalle')).toBe('38,50 €');
    expect(formatearEuros(0, 'detalle')).toBe('0,00 €');
  });

  it('negativos con signo menos tipográfico y espacio: "− 120 €" (§9.3)', () => {
    expect(formatearEuros(-12000)).toBe('− 120 €');
    expect(formatearEuros(-3850)).toBe('− 38,50 €');
  });

  it('con signo explícito: "+ 60 €", "− 38,50 €" y cero sin signo', () => {
    expect(formatearConSigno(6000)).toBe('+ 60 €');
    expect(formatearConSigno(-3850)).toBe('− 38,50 €');
    expect(formatearConSigno(0)).toBe('0 €');
  });

  it('rechaza importes que no son céntimos enteros', () => {
    expect(() => formatearEuros(38.5)).toThrow();
    expect(() => formatearEuros(0.1 + 0.2)).toThrow();
  });
});

describe('Lectura del campo Importe a céntimos enteros (§10.2.1.3)', () => {
  it('acepta coma decimal y punto de miles', () => {
    expect(parsearImporte('38,50')).toBe(3850);
    expect(parsearImporte('38,5')).toBe(3850);
    expect(parsearImporte('1.240')).toBe(124000);
    expect(parsearImporte('1.240,05')).toBe(124005);
    expect(parsearImporte('0,01')).toBe(1);
    expect(parsearImporte('  45 € ')).toBe(4500);
  });

  it('un punto seguido de 1 o 2 cifras se toma como decimal', () => {
    expect(parsearImporte('38.5')).toBe(3850);
    expect(parsearImporte('38.50')).toBe(3850);
  });

  it('devuelve siempre enteros (sin errores de coma flotante)', () => {
    for (const texto of ['0,10', '0,20', '0,30', '19,99', '1.234,56', '0,07', '99.999,99']) {
      const c = parsearImporte(texto);
      expect(Number.isInteger(c)).toBe(true);
    }
    expect(parsearImporte('0,10')! + parsearImporte('0,20')!).toBe(parsearImporte('0,30'));
    expect(parsearImporte('19,99')).toBe(1999);
  });

  it('máximo 99.999,99 €', () => {
    expect(IMPORTE_MAXIMO).toBe(9999999);
    expect(parsearImporte('99.999,99')).toBe(9999999);
    expect(parsearImporte('100.000')).toBeNull();
    expect(parsearImporte('99.999,999')).toBeNull();
  });

  it('rechaza textos no válidos', () => {
    expect(parsearImporte('')).toBeNull();
    expect(parsearImporte('abc')).toBeNull();
    expect(parsearImporte('1,2,3')).toBeNull();
    expect(parsearImporte('-5')).toBeNull();
    expect(parsearImporte('12,345')).toBeNull();
  });

  it('ida y vuelta: céntimos → texto editable → céntimos', () => {
    for (const c of [1, 50, 3850, 4000, 124000, 385000, 9999999]) {
      expect(parsearImporte(centimosATexto(c))).toBe(c);
    }
    expect(centimosATexto(3850)).toBe('38,50');
    expect(centimosATexto(124000)).toBe('1.240');
  });
});

describe('Formato mientras se escribe (§10.2.1.3)', () => {
  it('agrupa miles al teclear', () => {
    expect(formatearMientrasEscribe('3850')).toBe('3.850');
    expect(formatearMientrasEscribe('12400')).toBe('12.400');
  });

  it('admite una coma y hasta dos decimales', () => {
    expect(formatearMientrasEscribe('38,')).toBe('38,');
    expect(formatearMientrasEscribe('38,5')).toBe('38,5');
    expect(formatearMientrasEscribe('38,50')).toBe('38,50');
    expect(formatearMientrasEscribe('38,505')).toBeNull();
    expect(formatearMientrasEscribe('38,5,')).toBeNull();
  });

  it('un punto recién tecleado se convierte en la coma decimal', () => {
    expect(formatearMientrasEscribe('38.', '38')).toBe('38,');
  });

  it('no deja pasar de 5 cifras enteras (99.999) ni letras', () => {
    expect(formatearMientrasEscribe('99999')).toBe('99.999');
    expect(formatearMientrasEscribe('100000')).toBeNull();
    expect(formatearMientrasEscribe('12a')).toBeNull();
  });

  it('quita ceros a la izquierda y ",5" se muestra como "0,5"', () => {
    expect(formatearMientrasEscribe('007')).toBe('7');
    expect(formatearMientrasEscribe(',5')).toBe('0,5');
  });
});
