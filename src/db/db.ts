import Dexie, { type Table } from 'dexie';
import { CATEGORIAS_INICIALES } from '../domain/categoriasIniciales';
import type { Ajuste, Categoria, Foto, Movimiento, Usuario } from '../domain/tipos';

// Almacenamiento local en IndexedDB con Dexie (§4.2, §14): todo se guarda aquí primero.

export class FergoDB extends Dexie {
  movimientos!: Table<Movimiento, string>;
  categorias!: Table<Categoria, string>;
  usuarios!: Table<Usuario, string>;
  ajustes!: Table<Ajuste, string>;
  fotos!: Table<Foto, string>;

  constructor(nombre = 'fergo') {
    super(nombre);
    this.version(1).stores({
      movimientos: 'id, fecha, tipo, categoria_id, eliminado_en',
      categorias: 'id, &clave, tipo',
      usuarios: 'id, rol',
      ajustes: 'clave',
      fotos: 'id',
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

export let db = new FergoDB();

/** Sólo para pruebas: base nueva y vacía. */
export async function reiniciarBase(nombre = 'fergo'): Promise<FergoDB> {
  db.close();
  await Dexie.delete(nombre);
  db = new FergoDB(nombre);
  await db.open();
  return db;
}
