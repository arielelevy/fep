import { describe, expect, it } from 'vitest';
import { centimosATexto, formatearConSigno, formatearEuros, formatearMientrasEscribe, parsearImporte } from './dinero';

describe('formato es-ES de importes en céntimos (§4.3)', () => {
  it('agrupa miles con punto y omite ",00" en resúmenes', () => {
    expect(formatearEuros(124000)).toBe('1.240 €');
    expect(formatearEuros(3850)).toBe('38,50 €');
    expect(formatearEuros(385000)).toBe('3.850 €');
    expect(formatearEuros(0)).toBe('0 €');
    expect(formatearEuros(5)).toBe('0,05 €');
    expect(formatearEuros(123456789)).toBe('1.234.567,89 €');
  });

  it('muestra siempre dos decimales en detalle', () => {
    expect(formatearEuros(124000, 'detalle')).toBe('1.240,00 €');
    expect(formatearEuros(3850, 'detalle')).toBe('38,50 €');
  });

  it('usa el signo menos tipográfico y "+" explícito', () => {
    expect(formatearEuros(-12000)).toBe('− 120 €');
    expect(formatearConSigno(62000)).toBe('+ 620 €');
    expect(formatearConSigno(-3850)).toBe('− 38,50 €');
    expect(formatearConSigno(0)).toBe('0 €');
  });

  it('rechaza importes que no son céntimos enteros', () => {
    expect(() => formatearEuros(38.5)).toThrow();
  });
});

describe('lectura del importe tecleado', () => {
  it('convierte a céntimos enteros sin coma flotante', () => {
    expect(parsearImporte('38,50')).toBe(3850);
    expect(parsearImporte('38,5')).toBe(3850);
    expect(parsearImporte('0,1')).toBe(10);
    expect(parsearImporte('1.240')).toBe(124000);
    expect(parsearImporte('1.240,99')).toBe(124099);
    expect(parsearImporte('38.5')).toBe(3850);
    expect(parsearImporte('3850')).toBe(385000);
    // 0,29 · 100 en coma flotante da 28,999…; aquí debe ser exacto.
    expect(parsearImporte('0,29')).toBe(29);
    expect(parsearImporte('1,15')).toBe(115);
  });

  it('respeta el máximo de 99.999,99 € y rechaza basura', () => {
    expect(parsearImporte('99.999,99')).toBe(9999999);
    expect(parsearImporte('100.000')).toBeNull();
    expect(parsearImporte('')).toBeNull();
    expect(parsearImporte('abc')).toBeNull();
    expect(parsearImporte('1,234')).toBeNull();
    expect(parsearImporte('1,2,3')).toBeNull();
  });

  it('da formato mientras se escribe', () => {
    expect(formatearMientrasEscribe('1240')).toBe('1.240');
    expect(formatearMientrasEscribe('1.2405', '1.240')).toBe('12.405');
    expect(formatearMientrasEscribe('38,5')).toBe('38,5');
    expect(formatearMientrasEscribe('38,505')).toBeNull();
    expect(formatearMientrasEscribe('38.', '38')).toBe('38,');
    expect(formatearMientrasEscribe(',')).toBe('0,');
    expect(formatearMientrasEscribe('123456')).toBeNull();
    expect(formatearMientrasEscribe('12a')).toBeNull();
    expect(formatearMientrasEscribe('')).toBe('');
    expect(formatearMientrasEscribe('007')).toBe('7');
  });

  it('vuelve a texto editable', () => {
    expect(centimosATexto(3850)).toBe('38,50');
    expect(centimosATexto(124000)).toBe('1.240');
    expect(centimosATexto(5)).toBe('0,05');
  });
});
