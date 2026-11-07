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

/**
 * Cerrojo para acciones que no deben repetirse con un doble toque (guardar una hoja).
 * `tomar()` es síncrono (ref) y devuelve false si ya hay una en curso; `ocupado` sirve para desactivar el botón.
 * Si la acción falla, se llama a `soltar()`; si sale bien, la hoja se cierra y el cerrojo no se suelta.
 */
export function useCerrojo() {
  const ref = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  return {
    ocupado,
    tomar: () => {
      if (ref.current) return false;
      ref.current = true;
      setOcupado(true);
      return true;
    },
    soltar: () => {
      ref.current = false;
      setOcupado(false);
    },
  };
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
