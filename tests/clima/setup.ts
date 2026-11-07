import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node ≥ 25 deja indefinido el localStorage de jsdom (ver src/test/setup.ts): memoria para las pruebas.
try {
  window.localStorage.getItem('x');
} catch {
  const m = new Map<string, string>();
  const almacen = {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
  Object.defineProperty(window, 'localStorage', { value: almacen, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: almacen, configurable: true });
}
if (typeof window.localStorage?.setItem !== 'function') {
  const m = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 },
  });
}

afterEach(() => cleanup());
