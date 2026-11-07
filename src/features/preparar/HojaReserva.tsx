import { X } from 'lucide-react';
import { useId, useState } from 'react';
import type { Visita } from '../../domain/tipos';
import { centimosATexto, parsearImporte } from '../../lib/dinero';
import { useCerrojo } from '../../lib/hooks';
import { devolucionPorDefecto, diasAlquiler, recogidaPorDefecto } from './logica';
import type { ReservaVehiculo } from './modelo';
import { guardarReserva } from './operaciones';
import { proveedorHabitual, type ProveedorAlquiler } from './plantillas';

/** Mensaje que se enseña al usuario: los de validación y permisos tal cual; el resto, el texto por defecto. */
export const mensajeError = (e: unknown, porDefecto: string) =>
  e instanceof Error && (e.name === 'SinPermiso' || /^(Falta|La |Importe|Fecha|Esta )/.test(e.message)) ? e.message : porDefecto;

/**
 * Formulario «Ya la reservé» (hoja inferior, §10.8.1): proveedor (el habitual preseleccionado), recogida (la tarde
 * anterior a las 19:00), devolución (el día del trabajo a las 20:00), precio y fianza prevista (precargados del
 * proveedor si están en Ajustes). Lo usan Preparar trabajo y la tarjeta «ALQUILA LA FURGONETA» de Alertas (§10.7).
 */
export function HojaReserva({
  fecha,
  visitas,
  reserva,
  proveedores,
  onCerrar,
}: {
  fecha: string;
  /** Visitas del día que necesitan furgoneta (las que cubre la reserva). */
  visitas: Visita[];
  /** Reserva a corregir; sin ella, reserva nueva. */
  reserva?: ReservaVehiculo;
  proveedores: ProveedorAlquiler[];
  onCerrar: (texto?: string, deshacer?: () => Promise<void>) => void;
}) {
  const id = useId();
  const cerrojo = useCerrojo();
  const habitual = proveedorHabitual(proveedores);
  const [nombre, setNombre] = useState(reserva?.proveedor_nombre ?? habitual?.nombre ?? '');
  const [recogida, setRecogida] = useState(reserva?.recogida ?? recogidaPorDefecto(fecha));
  const [devolucion, setDevolucion] = useState(reserva?.devolucion ?? devolucionPorDefecto(fecha));
  const precioInicial = reserva?.precio ?? (habitual?.precio_dia ? habitual.precio_dia * diasAlquiler(recogidaPorDefecto(fecha), devolucionPorDefecto(fecha)) : null);
  const fianzaInicial = reserva?.fianza_prevista ?? habitual?.fianza_habitual ?? null;
  const [precio, setPrecio] = useState(precioInicial !== null ? centimosATexto(precioInicial) : '');
  const [fianza, setFianza] = useState(fianzaInicial !== null ? centimosATexto(fianzaInicial) : '');
  const [error, setError] = useState('');

  const proveedor = proveedores.find((p) => p.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
  const p = precio.trim() ? parsearImporte(precio) : 0;
  const f = fianza.trim() ? parsearImporte(fianza) : 0;
  const valido = Boolean(nombre.trim()) && p !== null && f !== null && devolucion > recogida;

  const guardar = async () => {
    if (!valido || !cerrojo.tomar()) return;
    setError('');
    try {
      const r = await guardarReserva({
        fecha, proveedor_id: proveedor?.id ?? null, proveedor_nombre: nombre, proveedor_telefono: proveedor?.telefono ?? null,
        recogida, devolucion, precio: p ?? 0, fianza_prevista: f ?? 0, visitas: visitas.filter((v) => v.requiere_vehiculo),
      });
      onCerrar(reserva ? 'Reserva cambiada' : 'Furgoneta reservada', r.deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError(mensajeError(e, 'No se pudo guardar. Vuelve a intentarlo.'));
    }
  };

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
        <header className="hoja-cabecera">
          <h1 id={`${id}-titulo`}>Ya la reservé</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={() => onCerrar()}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <div className="formulario-preparar">
            <label className="campo-preparar">
              <span>¿A quién se la alquilas?</span>
              <input value={nombre} list={`${id}-proveedores`} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
              <datalist id={`${id}-proveedores`}>
                {proveedores.map((x) => (
                  <option key={x.id} value={x.nombre} />
                ))}
              </datalist>
            </label>
            <label className="campo-preparar">
              <span>Recogida</span>
              <input type="datetime-local" value={recogida} onChange={(e) => setRecogida(e.target.value)} />
            </label>
            <label className="campo-preparar">
              <span>Devolución</span>
              <input type="datetime-local" value={devolucion} onChange={(e) => setDevolucion(e.target.value)} />
            </label>
            {devolucion <= recogida && <p className="aviso-error">La devolución tiene que ser después de la recogida.</p>}
            <label className="campo-preparar">
              <span>Precio del alquiler (€)</span>
              <input inputMode="decimal" value={precio} placeholder="0,00" onChange={(e) => setPrecio(e.target.value)} />
            </label>
            <label className="campo-preparar">
              <span>Fianza prevista (€)</span>
              <input inputMode="decimal" value={fianza} placeholder="0,00" onChange={(e) => setFianza(e.target.value)} />
            </label>
            <p className="texto-aclaratorio ambar">La fianza no es un gasto. Te la devuelven.</p>
          </div>
          {error && (
            <p className="aviso-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="hoja-pie">
          <button type="button" className="boton-principal tocable" disabled={!valido || cerrojo.ocupado} onClick={guardar}>
            Guardar reserva
          </button>
        </footer>
      </div>
    </div>
  );
}
