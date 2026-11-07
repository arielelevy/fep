import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DURACION_DESHACER_MS, DeshacerProvider, useDeshacer } from './Deshacer';

function Disparador({ deshacer }: { deshacer: () => Promise<void> }) {
  const { mostrar } = useDeshacer();
  return (
    <button type="button" onClick={() => mostrar('Gasto guardado', deshacer)}>
      disparar
    </button>
  );
}

afterEach(() => vi.useRealTimers());

describe('Barra Deshacer (§5.4.1)', () => {
  it('dura 8 segundos y luego desaparece', () => {
    vi.useFakeTimers();
    const deshacer = vi.fn(async () => {});
    render(
      <DeshacerProvider>
        <Disparador deshacer={deshacer} />
      </DeshacerProvider>,
    );
    act(() => screen.getByText('disparar').click());
    expect(screen.getByRole('status').textContent).toContain('Gasto guardado');
    expect(DURACION_DESHACER_MS).toBe(8000);
    act(() => vi.advanceTimersByTime(7900));
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
    expect(deshacer).not.toHaveBeenCalled();
  });

  it('ejecuta el deshacer al pulsarlo dentro de los 8 segundos', async () => {
    const deshacer = vi.fn(async () => {});
    render(
      <DeshacerProvider>
        <Disparador deshacer={deshacer} />
      </DeshacerProvider>,
    );
    act(() => screen.getByText('disparar').click());
    await act(async () => screen.getByRole('button', { name: 'Deshacer' }).click());
    expect(deshacer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
