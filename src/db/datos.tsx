import { createContext, useContext, type ReactNode } from 'react';
import { db } from './db';
import { useLive } from '../lib/hooks';
import type { Categoria, MedioPago, Movimiento, Usuario } from '../domain/tipos';

// Datos locales compartidos por las pantallas. 'undefined' = cargando (esqueletos, §10).
export interface Datos {
  movimientos: Movimiento[]; // activos (sin borrado lógico)
  categorias: Categoria[];
  usuario: Usuario | undefined;
  ultimoMedio: MedioPago;
  saldoInicialHecho: boolean;
  pasos: { cliente: boolean; avisos: boolean };
}

const DatosCtx = createContext<Datos | undefined>(undefined);

export const useDatos = () => useContext(DatosCtx);

export function DatosProvider({ children }: { children: ReactNode }) {
  const datos = useLive<Datos>(async () => {
    const [movimientos, categorias, ajustes, usuarios] = await Promise.all([
      db.movimientos.filter((m) => !m.eliminado_en).toArray(),
      db.categorias.toArray(),
      db.ajustes.toArray(),
      db.usuarios.toArray(),
    ]);
    const a = new Map(ajustes.map((x) => [x.clave, x.valor]));
    return {
      movimientos,
      categorias,
      usuario: usuarios.find((u) => u.id === a.get('usuario_actual')),
      ultimoMedio: (a.get('ultimo_medio_pago') as MedioPago) ?? 'efectivo',
      saldoInicialHecho: Boolean(a.get('saldo_inicial_hecho')),
      pasos: { cliente: false, avisos: false, ...((a.get('pasos_bienvenida') as object) ?? {}) },
    };
  });
  return <DatosCtx.Provider value={datos}>{children}</DatosCtx.Provider>;
}
