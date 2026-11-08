// Enlace directo a la guía de instalación (Ariel, 2026-11-07): `/?ir=instalar` la muestra aunque ya se haya visto,
// para mandarle a Felipe un enlace que lo lleve a instalar la app.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { local } from '../../src/lib/hooks';
import { CLAVE_GUIA, debeMostrarGuia } from '../../src/screens/GuiaInstalacion';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('Guía de instalación por enlace', () => {
  it('sin el enlace y con la guía ya vista, no aparece', () => {
    local.escribir(CLAVE_GUIA, '1');
    window.history.replaceState(null, '', '/');
    expect(debeMostrarGuia()).toBe(false);
  });

  it('con ?ir=instalar aparece aunque ya se haya visto, y al seguir se limpia la dirección', async () => {
    local.escribir(CLAVE_GUIA, '1');
    window.history.replaceState(null, '', '/?ir=instalar');
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Instala FERGO' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Seguir en el navegador' }));
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('heading', { name: 'Instala FERGO' })).toBeNull();
  });
});
