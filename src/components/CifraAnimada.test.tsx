import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CifraAnimada, DURACION_CONTEO_MS } from './CifraAnimada';
import { formatearEuros } from '../lib/dinero';

// Conteo de cifras (§5.5.1): los valores intermedios siempre quedan entre el anterior y el nuevo.

afterEach(() => vi.restoreAllMocks());

describe('CifraAnimada', () => {
  it('no se sale del rango aunque el frame llegue con una marca anterior al inicio', () => {
    let reloj = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => reloj);
    const pendientes: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      pendientes.push(cb);
      return pendientes.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { rerender } = render(<CifraAnimada valor={0} formato={formatearEuros} testId="c" />);
    rerender(<CifraAnimada valor={15000} formato={formatearEuros} testId="c" />);
    const vistos: string[] = [];
    // Primer frame con marca 0 (muy anterior a t0 = 1000), luego avanzan el reloj y los frames.
    for (let i = 0; i < 20 && pendientes.length; i++) {
      const cb = pendientes.shift()!;
      act(() => cb(i === 0 ? 0 : reloj));
      vistos.push(screen.getByTestId('c').firstElementChild!.textContent!);
      reloj += DURACION_CONTEO_MS / 5;
    }
    const valores = vistos.map((v) => Number(v.replace(/[^\d,−-]/g, '').replace('−', '-').replace(',', '.')));
    expect(valores.every((v) => v >= 0 && v <= 150)).toBe(true);
    expect(vistos.at(-1)).toBe('150 €');
    expect(vistos[0]).toBe('0 €');
  });
});
