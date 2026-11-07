// Envío SIMULADO de avisos (§12.4). No hay servidor ni Web Push real (fuera de alcance): el planificador se ejecuta
// en el móvil (al abrir la app y cada 5 minutos con la app abierta) y cada aviso que tocaría enviar queda registrado
// en la tabla `ajustes` (clave `avisos_simulados`), con su texto, acciones y enlace profundo. Ajustes › Avisos y
// horarios los muestra. Al enviarse, lo incluido queda marcado como avisado en el estado de clima (ola 7) y de
// preparación (ola 8), para que nada se repita.

import { db } from '../../db/db';
import { guardarAjuste, leerAjuste } from '../../db/repo';
import { resumenSemanal, textoResumenSemanal } from '../../domain/resumenSemanal';
import { alertasActivas, marcarNotificadas } from '../../dominio/alertas';
import { almacen as almacenClima, enCola } from '../../componentes/alertas/useAlertasClima';
import { leerAvisoFurgo } from '../ajustes/proveedores/datos';
import { calcularAlertasPreparacion } from '../alertas/preparacion/motor';
import { leerEstado, marcarAvisados } from '../alertas/preparacion/estado';
import { leerPreparaciones, leerReservas } from '../preparar/operaciones';
import { leerPlantillas } from '../preparar/plantillas';
import { leerConfigAvisos } from './config';
import { planificar, type Notificacion } from './planificador';

export const CLAVE_AVISOS_SIMULADOS = 'avisos_simulados';
export const MAXIMO_REGISTRO = 50;

export interface AvisoSimulado extends Omit<Notificacion, 'marcar'> {
  enviado_en: string;
}

export interface RegistroAvisos {
  /** Claves ya avisadas → instante ISO. */
  claves: Record<string, string>;
  /** Últimos avisos simulados, el más reciente primero. */
  enviados: AvisoSimulado[];
}

export const registroVacio = (): RegistroAvisos => ({ claves: {}, enviados: [] });

export async function leerRegistroAvisos(): Promise<RegistroAvisos> {
  return { ...registroVacio(), ...(await leerAjuste<Partial<RegistroAvisos>>(CLAVE_AVISOS_SIMULADOS, {})) };
}

/** Registra un aviso simulado (también lo usa «Probar notificación»). */
export async function registrarAvisoSimulado(n: Omit<Notificacion, 'marcar'>, marcar: string[] = [], ahora = new Date()): Promise<void> {
  await db.transaction('rw', db.ajustes, async () => {
    const r = await leerRegistroAvisos();
    const iso = ahora.toISOString();
    for (const c of marcar) r.claves[c] = iso;
    r.enviados = [{ ...n, enviado_en: iso }, ...r.enviados].slice(0, MAXIMO_REGISTRO);
    await guardarAjuste(CLAVE_AVISOS_SIMULADOS, r);
  });
}

/**
 * Ejecuta el planificador una vez: lee datos, ajustes y alertas, decide qué toca y lo «envía» (simulado).
 * Solo en el móvil del titular: Pablo no recibe avisos operativos (§3). Devuelve lo enviado.
 */
export async function ejecutarPlanificador(ahora: Date = new Date()): Promise<Notificacion[]> {
  const usuario = await leerAjuste<string>('usuario_actual', '');
  if (!usuario || (await db.usuarios.get(usuario))?.rol !== 'titular') return [];

  const [config, visitas, clientes, movimientos, deudas, registro, estadoPrep, preparaciones, reservas, plantillas, avisoFurgo, estadoClima] = await Promise.all([
    leerConfigAvisos(),
    db.visitas.filter((v) => !v.eliminado_en).toArray(),
    db.clientes.filter((c) => !c.eliminado_en).toArray(),
    db.movimientos.filter((m) => !m.eliminado_en).toArray(),
    db.deudas.filter((d) => !d.eliminado_en).toArray(),
    leerRegistroAvisos(),
    leerEstado(),
    leerPreparaciones(),
    leerReservas(),
    leerPlantillas(),
    leerAvisoFurgo(),
    almacenClima.leer(),
  ]);

  const prep = calcularAlertasPreparacion({
    visitas, clientes, preparaciones, reservas, plantillas, avisoFurgoDias: avisoFurgo, pospuestas: estadoPrep.pospuestas, horaResumen: config.horaResumen, ahora,
  });
  // Resumen semanal positivo (§5.5.2): solo si hubo cobros; nunca un «esta semana no cobraste».
  const semanal = resumenSemanal(movimientos, ahora, { visitas, deudas });
  const lineaSemanal = semanal.cobrado > 0 ? textoResumenSemanal(semanal) : null;

  const plan = planificar({
    ahora, config, visitas, clientes,
    alertasClima: alertasActivas(estadoClima),
    alertasPreparacion: prep.alertas,
    avisadosPreparacion: estadoPrep.avisados,
    registro: registro.claves,
    lineaSemanal,
  });
  if (!plan.length) return [];

  // Registro simulado (no se envía nada real) y marcas para no repetir.
  await db.transaction('rw', db.ajustes, async () => {
    const r = await leerRegistroAvisos();
    const iso = ahora.toISOString();
    for (const n of plan) {
      for (const c of n.marcar.registro) r.claves[c] = iso;
      const { marcar: _m, ...aviso } = n;
      r.enviados.unshift({ ...aviso, enviado_en: iso });
    }
    r.enviados = r.enviados.slice(0, MAXIMO_REGISTRO);
    await guardarAjuste(CLAVE_AVISOS_SIMULADOS, r);
  });
  await marcarAvisados(plan.flatMap((n) => n.marcar.preparacion), ahora);
  const idsClima = plan.flatMap((n) => n.marcar.clima);
  if (idsClima.length) {
    await enCola(async () => {
      const e = await almacenClima.leer();
      await almacenClima.guardar(marcarNotificadas(e, idsClima, ahora));
    });
  }
  return plan;
}
