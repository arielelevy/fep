import Dexie, { type Table } from 'dexie';
import { CATEGORIAS_INICIALES } from '../domain/categoriasIniciales';
import type { Ajuste, Categoria, Cliente, Deuda, Foto, Movimiento, Usuario } from '../domain/tipos';

// Almacenamiento local en IndexedDB con Dexie (§4.2, §14): todo se guarda aquí primero.

export class FergoDB extends Dexie {
  movimientos!: Table<Movimiento, string>;
  categorias!: Table<Categoria, string>;
  usuarios!: Table<Usuario, string>;
  ajustes!: Table<Ajuste, string>;
  fotos!: Table<Foto, string>;
  clientes!: Table<Cliente, string>;
  deudas!: Table<Deuda, string>;

  constructor(nombre = 'fergo') {
    super(nombre);
    this.version(1).stores({
      movimientos: 'id, fecha, tipo, categoria_id, eliminado_en',
      categorias: 'id, &clave, tipo',
      usuarios: 'id, rol',
      ajustes: 'clave',
      fotos: 'id',
    });
    // Ola 4: clientes, deudas de trabajos y el usuario colaborador (Pablo).
    this.version(2)
      .stores({
        clientes: 'id, nombre, eliminado_en',
        deudas: 'id, cliente_id, eliminado_en',
      })
      .upgrade(async (tx) => {
        const usuarios = await tx.table('usuarios').toArray();
        if (!usuarios.some((u: Usuario) => u.rol === 'colaborador')) {
          const titular = usuarios.find((u: Usuario) => u.rol === 'titular');
          if (titular) await tx.table('usuarios').add(pablo(titular.negocio_id, titular.id));
        }
      });
    this.on('populate', (tx) => sembrar(tx));
  }
}

export const nuevoId = (): string => crypto.randomUUID();

// Siembra inicial: negocio, usuario titular y categorías de §9.2.
function sembrar(tx: import('dexie').Transaction) {
  const ahora = new Date().toISOString();
  const negocioId = nuevoId();
  const felipeId = nuevoId();
  const comunes = {
    negocio_id: negocioId,
    creado_en: ahora,
    actualizado_en: ahora,
    creado_por: felipeId,
    modificado_por: felipeId,
    eliminado_en: null,
    version: 1,
  };
  tx.table('ajustes').bulkAdd([
    { clave: 'negocio_id', valor: negocioId },
    { clave: 'usuario_actual', valor: felipeId },
  ]);
  // En esta ola no hay inicio de sesión: el dispositivo trabaja como Felipe (titular).
  tx.table('usuarios').add({
    id: felipeId,
    ...comunes,
    nombre: 'Felipe',
    email: '',
    rol: 'titular',
    etiqueta_aportante: 'papá',
  } satisfies Usuario);
  tx.table('usuarios').add(pablo(negocioId, felipeId));
  tx.table('categorias').bulkAdd(
    CATEGORIAS_INICIALES.map((c) => ({
      id: nuevoId(),
      ...comunes,
      clave: c.clave,
      nombre: c.nombre,
      nombre_corto: c.nombre_corto,
      grupo: c.grupo,
      icono: c.icono,
      tipo: c.tipo,
      es_inversion: c.es_inversion,
      visible: c.visible,
      orden_manual: c.orden,
      contador_uso_60d: 0,
    }) satisfies Categoria),
  );
}

/** Pablo, colaborador (§3): ve todo; sólo registra y edita aportes y préstamos. Sus aportes son «de papá». */
function pablo(negocioId: string, creadoPor: string): Usuario {
  const ahora = new Date().toISOString();
  return {
    id: nuevoId(),
    negocio_id: negocioId,
    creado_en: ahora,
    actualizado_en: ahora,
    creado_por: creadoPor,
    modificado_por: creadoPor,
    eliminado_en: null,
    version: 1,
    nombre: 'Pablo',
    email: '',
    rol: 'colaborador',
    etiqueta_aportante: 'papá',
  };
}

export let db = new FergoDB();

/** Sólo para pruebas: base nueva y vacía. */
export async function reiniciarBase(nombre = 'fergo'): Promise<FergoDB> {
  db.close();
  await Dexie.delete(nombre);
  db = new FergoDB(nombre);
  await db.open();
  return db;
}
