// Estado de las alertas de clima para la interfaz (ola 7, frente B). Consume el motor del frente A
// (src/dominio/alertas, ver CONTRATO.md) sin reescribirlo: aquí sólo se decide CUÁNDO recalcular y se lee lo guardado.
//
// - El estado vive en IndexedDB (tabla `ajustes`, clave `alertas_clima`) y se lee con una consulta reactiva: la
//   campana y la pantalla Alertas se actualizan solas al mover, mantener o deshacer.
// - Se recalcula al abrir y cada vez que cambian las visitas o los clientes. El motor es idempotente; aun así todas
//   las escrituras (recalcular, mover, mantener y sus «Deshacer») pasan por una cola para que dos pantallas abiertas a
//   la vez no lean y escriban el estado cruzado.
// - En la app instalada no hay proveedor del tiempo: `prepararClima` deja todo «Sin previsión» y no salen alertas de
//   semáforo (decisión de Ariel: no inventar el tiempo). El clima simulado sólo lo enchufan las pruebas.

import { useEffect, useMemo, useState } from 'react';
import { useDatos } from '../../db/datos';
import { db } from '../../db/db';
import { useLive } from '../../lib/hooks';
import {
  alertasActivas, almacenAlertasLocal, CLAVE_AJUSTE_ALERTAS, contarParaDecidir, estadoVacio, prepararClima, quienSoy, recalcularYGuardar,
  type AlertaClima, type ClimaCliente, type EstadoAlertas,
} from '../../dominio/alertas';

export const almacen = almacenAlertasLocal();

let cola: Promise<unknown> = Promise.resolve();

/** Ejecuta una escritura del estado de alertas después de las que ya estén en curso. */
export function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const r = cola.then(tarea, tarea);
  cola = r.catch(() => undefined);
  return r;
}

/** Último clima calculado por cliente (para proponer días: el semáforo de cada opción). */
let ultimoClima = new Map<string, ClimaCliente>();

/**
 * Una decisión por visita. El motor guarda aparte la alerta del semáforo (CLIMA_DECIDIR) y la del aviso oficial
 * (CLIMA_AEMET) de una misma visita (son asuntos distintos para la deduplicación). En pantalla se muestran juntas en
 * una sola tarjeta, para no repetir el mismo asunto (§5.2.3): manda el aviso oficial, y mover o mantener vale para
 * las dos.
 */
export interface DecisionVisita {
  visitaId: string;
  principal: AlertaClima;
  todas: AlertaClima[];
}

export function agruparDecisiones(activas: AlertaClima[]): DecisionVisita[] {
  const grupos = new Map<string, AlertaClima[]>();
  for (const a of activas) {
    if (a.seccion !== 'para_decidir') continue;
    const clave = `${a.entidad.id}:${a.fecha}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), a]);
  }
  return [...grupos.values()].map((todas) => ({
    visitaId: todas[0].entidad.id,
    principal: todas.find((a) => a.tipo === 'CLIMA_AEMET') ?? todas[0],
    todas,
  }));
}

export interface UsoAlertas {
  /** null mientras carga por primera vez. */
  estado: EstadoAlertas | null;
  activas: AlertaClima[];
  /** Sección PARA DECIDIR: una entrada por visita. */
  decisiones: DecisionVisita[];
  /**
   * Insignia de la campana: alertas activas que requieren decisión (no cuenta las informativas, §10.1.1), contadas
   * como decisiones por visita, igual que las tarjetas de la pantalla. `contarParaDecidir` del motor contaría 2 para
   * una visita con semáforo rojo y aviso oficial a la vez.
   */
  insignia: number;
  /** Lo que da `contarParaDecidir` del motor (alertas sueltas). */
  alertasParaDecidir: number;
  clima: Map<string, ClimaCliente>;
}

export function useAlertasClima(): UsoAlertas {
  const datos = useDatos();
  const guardado = useLive(async () => ((await db.ajustes.get(CLAVE_AJUSTE_ALERTAS))?.valor as EstadoAlertas | undefined) ?? estadoVacio());
  const [clima, setClima] = useState(ultimoClima);

  // Firma de lo que afecta a las alertas: si no cambia, no se recalcula.
  const firma = useMemo(() => {
    if (!datos) return null;
    const v = datos.visitas.map((x) => `${x.id}:${x.version}:${x.fecha}:${x.hora_inicio}:${x.estado}`).join('|');
    const c = datos.clientes.map((x) => `${x.id}:${x.version}:${x.lat}:${x.lon}`).join('|');
    return `${v}#${c}`;
  }, [datos]);

  useEffect(() => {
    if (!datos || firma === null) return;
    let vivo = true;
    const { visitas, clientes } = datos;
    enCola(async () => {
      const yo = await quienSoy();
      const c = await prepararClima(clientes);
      await recalcularYGuardar(almacen, { visitas, clientes, clima: c, usuario: yo.usuario, negocio: yo.negocio });
      ultimoClima = c;
      if (vivo) setClima(c);
    }).catch((e: unknown) => {
      // Base sin preparar (primer arranque) o servicio del tiempo caído: se queda lo último guardado.
      // Base cerrada: la app se está cerrando o se reinició la base local; no hay nada que revisar.
      const esperado = e instanceof Error && (e.message === 'Base local sin preparar' || e.name === 'DatabaseClosedError');
      if (!esperado) console.error('No se pudieron revisar las alertas', e);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  return useMemo(() => {
    const estado = guardado ?? null;
    const activas = estado ? alertasActivas(estado) : [];
    const decisiones = agruparDecisiones(activas);
    return {
      estado,
      activas,
      decisiones,
      insignia: decisiones.length,
      alertasParaDecidir: estado ? contarParaDecidir(estado) : 0,
      clima,
    };
  }, [guardado, clima]);
}
