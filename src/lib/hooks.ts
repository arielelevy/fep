import { liveQuery } from 'dexie';
import { useEffect, useRef, useState, type DependencyList } from 'react';

/** Consulta reactiva a IndexedDB: se vuelve a ejecutar cuando cambian las tablas que lee. */
export function useLive<T>(consulta: () => Promise<T>, deps: DependencyList = []): T | undefined {
  const [valor, setValor] = useState<T>();
  useEffect(() => {
    const sub = liveQuery(consulta).subscribe({
      next: (v) => setValor(() => v),
      error: (e) => console.error('Error leyendo datos locales', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return valor;
}

/** Estado de conexión (banda "Sin conexión", §10). */
export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return enLinea;
}

/** "Reducir movimiento" del sistema (§5.6.6). */
export function prefiereMenosMovimiento(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** Valor anterior de una variable entre renders. */
export function useAnterior<T>(valor: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = valor;
  }, [valor]);
  return ref.current;
}

/** Lectura y escritura segura en localStorage (preferencias del dispositivo). */
export const local = {
  leer(clave: string): string | null {
    try {
      return window.localStorage.getItem(clave);
    } catch {
      return null;
    }
  },
  escribir(clave: string, valor: string) {
    try {
      window.localStorage.setItem(clave, valor);
    } catch {
      /* almacenamiento no disponible: se ignora */
    }
  },
};
