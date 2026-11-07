import { createContext, useContext, type ReactNode } from 'react';
import { db } from './db';
import { useLive } from '../lib/hooks';
import type { Categoria, Cliente, Deuda, MedioPago, Movimiento, Usuario } from '../domain/tipos';

// Datos locales compartidos por las pantallas. 'undefined' = cargando (esqueletos, §10).
export interface Datos {
  movimientos: Movimiento[]; // activos (sin borrado lógico)
  categorias: Categoria[];
  clientes: Cliente[]; // sin borrado lógico (activos e inactivos)
  deudas: Deuda[];
  usuarios: Usuario[];
  usuario: Usuario | undefined;
  esColaborador: boolean;
  ultimoMedio: MedioPago;
  saldoInicialHecho: boolean;
  pasos: { cliente: boolean; avisos: boolean };
}

const CLAVES_AJUSTES = ['usuario_actual', 'ultimo_medio_pago', 'saldo_inicial_hecho', 'pasos_bienvenida'];

const DatosCtx = createContext<Datos | undefined>(undefined);

export const useDatos = () => useContext(DatosCtx);

export function DatosProvider({ children }: { children: ReactNode }) {
  const datos = useLive<Datos>(async () => {
    // Sólo las claves que se usan: así el borrador de Registrar (otra clave de ajustes, escrito en cada
    // pulsación) no vuelve a lanzar esta consulta ni re-renderiza todas las pantallas.
    const [movimientos, categorias, ajustes, usuarios, clientes, deudas] = await Promise.all([
      db.movimientos.filter((m) => !m.eliminado_en).toArray(),
      db.categorias.toArray(),
      db.ajustes.bulkGet(CLAVES_AJUSTES),
      db.usuarios.toArray(),
      db.clientes.filter((c) => !c.eliminado_en).toArray(),
      db.deudas.filter((x) => !x.eliminado_en).toArray(),
    ]);
    // bulkGet devuelve los valores en el orden de CLAVES_AJUSTES.
    const [usuarioId, medio, saldoHecho, pasos] = ajustes.map((x) => x?.valor);
    return {
      movimientos,
      categorias,
      clientes: clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      deudas,
      usuarios,
      usuario: usuarios.find((u) => u.id === usuarioId),
      esColaborador: usuarios.find((u) => u.id === usuarioId)?.rol === 'colaborador',
      ultimoMedio: (medio as MedioPago) ?? 'efectivo',
      saldoInicialHecho: Boolean(saldoHecho),
      pasos: { cliente: false, avisos: false, ...((pasos as object) ?? {}) },
    };
  });
  return <DatosCtx.Provider value={datos}>{children}</DatosCtx.Provider>;
}
