// Operaciones con efecto (§10.7): guardar el estado de las alertas, recalcular, «Mover» y «Mantener la visita».
// Las alertas se guardan en la tabla `ajustes` ya existente (clave `alertas_clima`), sin cambiar el esquema de la base.
// Toda escritura deja `modificado_por` (§3) y devuelve su «Deshacer» (§5.4.1). Pablo (colaborador) no puede.

import { servicioClima, type ServicioClima } from '../../clima';
import { db } from '../../db/db';
import { guardarAjuste, leerAjuste, moverVisita, SinPermiso, type Deshacer } from '../../db/repo';
import type { Cliente, Visita } from '../../domain/tipos';
import { claveDia, sumarDias } from '../../lib/fechas';
import type { ProveedorAvisos } from './aemet';
import { estadoVacio, recalcularAlertas } from './motor';
import { RANGO_AVISO, RANGO_SEMAFORO } from './catalogo';
import type { AlertaClima, ClimaCliente, EstadoAlertas, ResultadoRecalculo } from './tipos';

export const CLAVE_AJUSTE_ALERTAS = 'alertas_clima';

/** Dónde vive el estado de las alertas. */
export interface AlmacenAlertas {
  leer(): Promise<EstadoAlertas>;
  guardar(e: EstadoAlertas): Promise<void>;
}

export function almacenAlertasEnMemoria(inicial: EstadoAlertas = estadoVacio()): AlmacenAlertas {
  let e = structuredClone(inicial);
  return {
    leer: async () => structuredClone(e),
    guardar: async (nuevo) => {
      e = structuredClone(nuevo);
    },
  };
}

/** Almacén local (IndexedDB, tabla `ajustes`): funciona sin conexión (§14.2). */
export function almacenAlertasLocal(): AlmacenAlertas {
  return {
    leer: () => leerAjuste<EstadoAlertas>(CLAVE_AJUSTE_ALERTAS, estadoVacio()),
    guardar: (e) => guardarAjuste(CLAVE_AJUSTE_ALERTAS, e),
  };
}

/** Usuario y negocio actuales, y si puede decidir (sólo el titular, §3). */
export async function quienSoy(): Promise<{ usuario: string; negocio: string; titular: boolean }> {
  const usuario = await leerAjuste<string>('usuario_actual', '');
  const negocio = await leerAjuste<string>('negocio_id', '');
  if (!usuario || !negocio) throw new Error('Base local sin preparar');
  const rol = (await db.usuarios.get(usuario))?.rol ?? 'colaborador';
  return { usuario, negocio, titular: rol === 'titular' };
}

/**
 * Clima de cada cliente para el motor. Por defecto usa el servicio del clima de la app (src/clima): en la app
 * instalada no hay proveedor y todo queda «Sin previsión» (decisión de Ariel), así que no salen alertas de semáforo.
 * Los avisos oficiales salen de `avisos` (en la app real: ninguno hasta enchufar AEMET).
 */
export async function prepararClima(
  clientes: Cliente[],
  op: { servicio?: ServicioClima; avisos?: ProveedorAvisos | null; ahora?: Date } = {},
): Promise<Map<string, ClimaCliente>> {
  const servicio = op.servicio ?? servicioClima();
  const hoy = claveDia(op.ahora ?? new Date());
  const hasta = sumarDias(hoy, 13);
  const r = new Map<string, ClimaCliente>();
  await Promise.all(
    clientes.map(async (c) => {
      if (c.lat === null || c.lon === null) {
        r.set(c.id, { ubicacion: null, prevision: null, avisos: [] });
        return;
      }
      const u = { lat: c.lat, lon: c.lon };
      const [p, avisos] = await Promise.all([
        servicio.prevision(u),
        op.avisos === undefined ? servicio.avisos(u, hoy, hasta) : op.avisos ? op.avisos.avisos(u, hoy, hasta) : Promise.resolve([]),
      ]);
      r.set(c.id, { ubicacion: u, prevision: p.prevision, avisos, motivo: p.motivo });
    }),
  );
  return r;
}

/** Recalcula y guarda. Idempotente: llamarlo varias veces con lo mismo no crea ni duplica nada. */
export async function recalcularYGuardar(
  almacen: AlmacenAlertas,
  e: { visitas: Visita[]; clientes: Cliente[]; clima: Map<string, ClimaCliente>; ahora?: Date; usuario: string; negocio: string },
): Promise<ResultadoRecalculo> {
  const estado = await almacen.leer();
  const r = recalcularAlertas({ ...e, estado, ahora: e.ahora ?? new Date() });
  await almacen.guardar(r.estado);
  return r;
}

async function exigirTitular(): Promise<string> {
  const q = await quienSoy();
  if (!q.titular) throw new SinPermiso();
  return q.usuario;
}

function buscar(estado: EstadoAlertas, alertaId: string): AlertaClima {
  const a = estado.alertas.find((x) => x.id === alertaId && !x.eliminado_en);
  if (!a) throw new Error('Alerta no encontrada');
  return a;
}

/**
 * «Mantener la visita» (§10.7): la alerta queda descartada y su asunto no vuelve a avisar salvo que empeore por
 * encima de este nivel o aparezca un aviso oficial (que es otro asunto).
 */
export async function mantenerVisita(almacen: AlmacenAlertas, alertaId: string, ahora: Date = new Date()): Promise<{ alerta: AlertaClima; deshacer: Deshacer }> {
  const usuario = await exigirTitular();
  const antes = await almacen.leer();
  const estado = structuredClone(antes);
  const a = buscar(estado, alertaId);
  const iso = ahora.toISOString();
  a.estado = 'descartada';
  a.resuelta_en = iso;
  a.actualizado_en = iso;
  a.modificado_por = usuario;
  a.version += 1;
  const rango = a.tipo === 'CLIMA_AEMET' && a.aviso ? RANGO_AVISO[a.aviso.nivel] : RANGO_SEMAFORO[a.semaforo];
  estado.descartes = [
    ...estado.descartes.filter((d) => d.clave_asunto !== a.clave_asunto),
    { clave_asunto: a.clave_asunto, rango, descartado_en: iso, descartado_por: usuario },
  ];
  await almacen.guardar(estado);
  return { alerta: a, deshacer: () => almacen.guardar(antes) };
}

/**
 * «Mover» desde la alerta (§10.7): mueve la visita (guarda `reprogramada_desde` y motivo `clima`) y resuelve la
 * alerta. El mensaje y el enlace wa.me los arma la interfaz con `mensajeMoverVisita` y `enlaceWhatsApp`; aquí no se
 * envía nada. «Deshacer» vuelve la visita a su día y hora y reabre la alerta.
 */
export async function moverVisitaPorAlerta(
  almacen: AlmacenAlertas,
  alertaId: string,
  fecha: string,
  hora: string | null,
  ahora: Date = new Date(),
): Promise<{ visita: Visita; alerta: AlertaClima; deshacer: Deshacer }> {
  const usuario = await exigirTitular();
  const antes = await almacen.leer();
  const estado = structuredClone(antes);
  const a = buscar(estado, alertaId);
  const motivo = a.tipo === 'CLIMA_MEJORA' ? 'propio' : 'clima';
  const r = await moverVisita(a.entidad.id, fecha, hora, motivo);
  const iso = ahora.toISOString();
  a.estado = 'resuelta';
  a.resuelta_en = iso;
  a.actualizado_en = iso;
  a.modificado_por = usuario;
  a.version += 1;
  await almacen.guardar(estado);
  return {
    visita: r.visita,
    alerta: a,
    deshacer: async () => {
      await r.deshacer();
      await almacen.guardar(antes);
    },
  };
}
