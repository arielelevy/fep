import 'fake-indexeddb/auto';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node ≥ 25 trae un localStorage global propio que, sin --localstorage-file, queda indefinido y tapa el de jsdom.
// Para las pruebas se usa un almacenamiento en memoria.
function almacenamientoEnMemoria(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => void datos.delete(k),
    setItem: (k, v) => void datos.set(k, String(v)),
  };
}
let disponible = false;
try {
  disponible = typeof window.localStorage?.setItem === 'function';
} catch {
  disponible = false;
}
if (!disponible) {
  const almacen = almacenamientoEnMemoria();
  Object.defineProperty(window, 'localStorage', { value: almacen, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: almacen, configurable: true });
}

// La guía de instalación sólo se ve fuera de la app instalada; en las pruebas se da por vista.
window.localStorage.setItem('fergo.guia.vista', '1');

// La suite completa corre muchos archivos en paralelo: la primera carga de datos de IndexedDB puede pasar de 1 s
// (límite por defecto de findBy/waitFor) y dar fallos intermitentes que no aparecen al correr un archivo solo.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());
