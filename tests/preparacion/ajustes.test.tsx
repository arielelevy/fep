// Plantillas editables en Ajustes y proveedores de alquiler (ola 8, encargo B; spec §8.12, §8.14, §10.10): lo que se
// guarda aquí lo usa Preparar trabajo (material, ropa, «Ya la reservé», «Llamar a …»). Deshacer, permisos de Pablo y
// navegación desde Ajustes.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { reiniciarBase } from '../../src/db/db';
import { leerAjuste, SinPermiso, usarComo } from '../../src/db/repo';
import { anadirArticuloPlantilla, leerMaterial, leerRopa, pluralizar } from '../../src/features/ajustes/plantillas/datos';
import { PlantillaRopa } from '../../src/features/ajustes/plantillas/PlantillaRopa';
import { PlantillasMaterial } from '../../src/features/ajustes/plantillas/PlantillasMaterial';
import { CLAVE_BORRADOS, guardarProveedor, leerAvisoFurgo, leerProveedores, quitarProveedor } from '../../src/features/ajustes/proveedores/datos';
import { Proveedores } from '../../src/features/ajustes/proveedores/Proveedores';
import { listaRopa } from '../../src/features/preparar/logica';
import { PrepararTrabajo } from '../../src/features/preparar/PrepararTrabajo';
import { leerPlantillas } from '../../src/features/preparar/plantillas';
import { AHORA, MIERCOLES, montar, texto, visita } from './escena';

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  await reiniciarBase('fergo');
});
afterEach(() => vi.useRealTimers());

const props = { etiquetaVolver: 'Ajustes', onVolver: vi.fn() };
/** Espera a que exista un elemento (los datos locales cargan de forma asíncrona). */
const elemento = (sel: string) =>
  waitFor(() => {
    const el = document.querySelector(sel) as HTMLElement | null;
    expect(el).not.toBeNull();
    return el!;
  });

describe('Plantillas de material', () => {
  it('parte de §8.12 y lo añadido en Ajustes aparece en Preparar trabajo', async () => {
    const { user } = montar(<PlantillasMaterial {...props} />);
    const setos = await elemento('[data-tipo="setos_poda"]');
    await waitFor(() => expect(within(setos).getByRole('list', { name: 'Material de Setos y poda' })).toBeTruthy());
    expect(within(setos).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Cuchillas cortasetos', 'Gasolina de mezcla', 'Sacos de restos', 'Lona']);

    const desbroce = document.querySelector('[data-tipo="desbroce"]') as HTMLElement;
    await user.click(within(desbroce).getByRole('button', { name: /Desbroce/ }));
    expect(within(desbroce).getByText('Sin artículos. En este trabajo no te pediré revisar material.')).toBeTruthy();
    await user.type(await within(desbroce).findByLabelText('Nuevo artículo para Desbroce'), 'hilo de desbrozadora');
    await user.click(within(desbroce).getByRole('button', { name: 'Añadir' }));
    await waitFor(async () => expect((await leerPlantillas()).material.desbroce).toEqual(['Hilo de desbrozadora']));
    // Las demás plantillas siguen (no se pierde la de setos al guardar otra).
    expect((await leerPlantillas()).material.setos_poda).toHaveLength(4);
    expect(await screen.findByText('Añadido a Desbroce')).toBeTruthy();
  });

  it('el material guardado sale en el bloque Material del día', async () => {
    await anadirArticuloPlantilla('desbroce', 'Hilo de desbrozadora');
    await visita({ fecha: MIERCOLES, tipos: ['desbroce'] });
    montar(<PrepararTrabajo fecha={MIERCOLES} etiquetaVolver="Alertas" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />);
    await waitFor(() => expect(texto(document.querySelector('[data-bloque="material"]'))).toContain('Hilo de desbrozadora'));
  });

  it('quitar un artículo se puede deshacer; un repetido se avisa sin guardarlo', async () => {
    const { user } = montar(<PlantillasMaterial {...props} />);
    const setos = await elemento('[data-tipo="setos_poda"]');
    await user.click(await within(setos).findByRole('button', { name: 'Quitar Lona de Setos y poda' }));
    await waitFor(async () => expect((await leerMaterial()).setos_poda).not.toContain('Lona'));
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await leerMaterial()).setos_poda).toContain('Lona'));

    await user.type(within(setos).getByLabelText('Nuevo artículo para Setos y poda'), 'gasolina DE mezcla');
    await user.click(within(setos).getByRole('button', { name: 'Añadir' }));
    expect((await within(setos).findByRole('alert')).textContent).toBe('Ya está en la lista');
    expect((await leerMaterial()).setos_poda).toHaveLength(4);
  });
});

describe('Plantilla de ropa', () => {
  it('añadir una prenda por persona la multiplica por las personas del día', async () => {
    const { user } = montar(<PlantillaRopa {...props} />);
    await user.click(await screen.findByRole('button', { name: 'Añadir prenda' }));
    const hoja = screen.getByRole('dialog', { name: 'Añadir prenda' });
    await user.type(within(hoja).getByLabelText('Nombre'), 'Chaleco reflectante');
    expect((within(hoja).getByLabelText('Cuando son varias') as HTMLInputElement).value).toBe('Chalecos reflectante');
    await user.clear(within(hoja).getByLabelText('Cuando son varias'));
    await user.type(within(hoja).getByLabelText('Cuando son varias'), 'Chalecos reflectantes');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => expect((await leerRopa()).some((p) => p.singular === 'Chaleco reflectante')).toBe(true));
    const ropa = (await leerPlantillas()).ropa;
    expect(listaRopa(ropa, 3).map((p) => p.texto)).toContain('Chalecos reflectantes (3)');
    expect(listaRopa(ropa, 1).map((p) => p.texto)).toContain('Chaleco reflectante (1)');
  });

  it('«Una para todo el equipo» no se multiplica; cambiar y quitar con deshacer', async () => {
    const { user } = montar(<PlantillaRopa {...props} />);
    await user.click(await screen.findByRole('button', { name: 'Cambiar Gorra FERGO' }));
    const hoja = screen.getByRole('dialog', { name: 'Cambiar Gorra FERGO' });
    await user.click(within(hoja).getByLabelText('Una para todo el equipo'));
    await user.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => expect(listaRopa(await leerRopa(), 3).find((p) => p.clave === 'gorra')?.texto).toBe('Gorra FERGO'));
    await waitFor(() => expect(texto(document.querySelector('[data-prenda="gorra"]'))).toContain('Una para todo el equipo'));

    await user.click(screen.getByRole('button', { name: 'Quitar Botas' }));
    await waitFor(async () => expect((await leerRopa()).some((p) => p.clave === 'botas')).toBe(false));
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect((await leerRopa()).some((p) => p.clave === 'botas')).toBe(true));
  });

  it('propone el plural en español', () => {
    expect(pluralizar('Toalla')).toBe('Toallas');
    expect(pluralizar('Pantalón corto')).toBe('Pantalones corto');
    expect(pluralizar('Cinturón')).toBe('Cinturones');
    expect(pluralizar('Guantes')).toBe('Guantes');
  });
});

describe('Proveedores de alquiler', () => {
  it('el proveedor habitual precarga la reserva y da «Llamar a …» en Preparar trabajo', async () => {
    const { user, unmount } = montar(<Proveedores {...props} />);
    expect(await screen.findByText('Aún no tienes proveedores.')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Añadir proveedor' }));
    const hoja = screen.getByRole('dialog', { name: 'Añadir proveedor' });
    expect((within(hoja).getByLabelText('Es mi proveedor habitual') as HTMLInputElement).checked).toBe(true);
    await user.type(within(hoja).getByLabelText('Nombre'), 'Alquileres Sur');
    await user.type(within(hoja).getByLabelText('Teléfono'), '611 22 33 44');
    await user.type(within(hoja).getByLabelText('Precio por día (€)'), '45');
    await user.type(within(hoja).getByLabelText('Fianza habitual (€)'), '150');
    await user.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    await waitFor(async () => expect(await leerProveedores()).toHaveLength(1));
    const [p] = await leerProveedores();
    expect(p).toMatchObject({ nombre: 'Alquileres Sur', telefono: '+34611223344', precio_dia: 4500, fianza_habitual: 15000, habitual: true, version: 1 });
    expect(p.creado_por).toBeTruthy();
    expect(await screen.findByText('Habitual')).toBeTruthy();
    unmount();

    await visita({ fecha: MIERCOLES, furgo: true });
    const r = montar(<PrepararTrabajo fecha={MIERCOLES} etiquetaVolver="Alertas" onVolver={vi.fn()} onAbrirVisita={vi.fn()} />);
    const furgo = await elemento('[data-bloque="furgoneta"]');
    expect(within(furgo).getByRole('link', { name: 'Llamar a Alquileres Sur' }).getAttribute('href')).toBe('tel:+34611223344');
    await r.user.click(within(furgo).getByRole('button', { name: 'Ya la reservé' }));
    const reserva = screen.getByRole('dialog', { name: 'Ya la reservé' });
    expect((within(reserva).getByLabelText('¿A quién se la alquilas?') as HTMLInputElement).value).toBe('Alquileres Sur');
    expect((within(reserva).getByLabelText('Fianza prevista (€)') as HTMLInputElement).value).toBe('150');
  });

  it('solo uno es el habitual; quitar es borrado lógico y se puede deshacer', async () => {
    const a = (await guardarProveedor({ nombre: 'Alquileres Sur', telefono: '', direccion: '', precio_dia: 4500, fianza_habitual: 15000, habitual: false })).proveedor;
    expect(a.habitual).toBe(true); // el primero queda como habitual
    const b = (await guardarProveedor({ nombre: 'Furgos Norte', telefono: '', direccion: 'Calle Mayor 2', precio_dia: null, fianza_habitual: null, habitual: true })).proveedor;
    let lista = await leerProveedores();
    expect(lista.filter((p) => p.habitual).map((p) => p.id)).toEqual([b.id]);

    const { deshacer } = await quitarProveedor(b.id);
    lista = await leerProveedores();
    expect(lista.map((p) => p.nombre)).toEqual(['Alquileres Sur']);
    expect(lista[0].habitual).toBe(true);
    const borrados = await leerAjuste<{ id: string; eliminado_en: string | null }[]>(CLAVE_BORRADOS, []);
    expect(borrados.find((p) => p.id === b.id)?.eliminado_en).toBeTruthy();
    await deshacer();
    expect((await leerProveedores()).map((p) => p.nombre)).toEqual(['Alquileres Sur', 'Furgos Norte']);

    await expect(guardarProveedor({ nombre: 'furgos norte', telefono: '', direccion: '', precio_dia: null, fianza_habitual: null, habitual: false })).rejects.toThrow('Ya tienes un proveedor con ese nombre');
    await expect(guardarProveedor({ nombre: 'Otro', telefono: '12', direccion: '', precio_dia: null, fianza_habitual: null, habitual: false })).rejects.toThrow('Teléfono no válido');
  });

  it('antelación del aviso para alquilar: 3, 4 (por defecto) o 5 días', async () => {
    const { user } = montar(<Proveedores {...props} />);
    const cuatro = await screen.findByRole('radio', { name: '4 días antes' });
    await waitFor(() => expect(cuatro.getAttribute('aria-checked')).toBe('true'));
    const cinco = screen.getByRole('radio', { name: '5 días antes' });
    await waitFor(() => expect((cinco as HTMLButtonElement).disabled).toBe(false));
    await user.click(cinco);
    await waitFor(async () => expect(await leerAvisoFurgo()).toBe(5));
    expect(await screen.findByText('Te aviso 5 días antes')).toBeTruthy();
  });
});

describe('Permisos y navegación', () => {
  it('Pablo ve las plantillas y los proveedores pero no los cambia', async () => {
    await guardarProveedor({ nombre: 'Alquileres Sur', telefono: '', direccion: '', precio_dia: 4500, fianza_habitual: 15000, habitual: true });
    await usarComo('colaborador');
    await expect(anadirArticuloPlantilla('riego', 'Goteros')).rejects.toBeInstanceOf(SinPermiso);
    await expect(guardarProveedor({ nombre: 'Otro', telefono: '', direccion: '', precio_dia: null, fianza_habitual: null, habitual: false })).rejects.toBeInstanceOf(SinPermiso);
    const r = montar(<Proveedores {...props} />);
    expect(await screen.findByText('Felipe cambia los proveedores; aquí los ves.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Añadir proveedor' })).toBeNull();
    r.unmount();
    montar(<PlantillasMaterial {...props} />);
    expect(await screen.findByText('Felipe cambia las plantillas; aquí las ves.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Quitar / })).toBeNull();
  });

  it('desde Hoy: logo → Ajustes → Plantillas de material, Plantilla de ropa y Proveedores, y «‹ Ajustes» vuelve', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const { render } = await import('@testing-library/react');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Ajustes' }));
    await user.click(await screen.findByRole('button', { name: 'Plantillas de material' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Plantillas de material' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    await user.click(await screen.findByRole('button', { name: 'Plantilla de ropa' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Plantilla de ropa' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Ajustes' }));
    await user.click(await screen.findByRole('button', { name: 'Proveedores de alquiler' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Proveedores de alquiler' })).toBeTruthy();
  });
});
