import { X } from 'lucide-react';
import { useId, useState } from 'react';
import type { Visita } from '../../../domain/tipos';
import { centimosATexto, parsearImporte } from '../../../lib/dinero';
import { useCerrojo } from '../../../lib/hooks';
import { devolucionPorDefecto, diasAlquiler, recogidaPorDefecto } from '../../preparar/logica';
import { guardarReserva } from '../../preparar/operaciones';
import { proveedorHabitual, type ProveedorAlquiler } from '../../preparar/plantillas';

// Formulario «Ya la reservé» abierto desde la tarjeta «ALQUILA LA FURGONETA» de Alertas (§10.7: «Botón "Ya la reservé"
// → formulario de reserva (10.8.1)»), para resolver sin salir de Alertas (§5.2.2). Mismos campos y valores por defecto
// que el de Preparar trabajo: proveedor (el habitual preseleccionado), recogida la tarde anterior a las 19:00,
// devolución el día del trabajo a las 20:00, precio y fianza precargados del proveedor. Guarda con `guardarReserva`
// del encargo A, la misma escritura que usa su pantalla.

export function HojaReservaAlerta({
  fecha,
  visitas,
  proveedores,
  onCerrar,
}: {
  fecha: string;
  /** Visitas del día que necesitan furgoneta (las que cubre la reserva). */
  visitas: Visita[];
  proveedores: ProveedorAlquiler[];
  onCerrar: (r?: { deshacer: () => Promise<void> }) => void;
}) {
  const id = useId();
  const cerrojo = useCerrojo();
  const habitual = proveedorHabitual(proveedores);
  const [nombre, setNombre] = useState(habitual?.nombre ?? '');
  const [recogida, setRecogida] = useState(recogidaPorDefecto(fecha));
  const [devolucion, setDevolucion] = useState(devolucionPorDefecto(fecha));
  const precioInicial = habitual?.precio_dia ? habitual.precio_dia * diasAlquiler(recogidaPorDefecto(fecha), devolucionPorDefecto(fecha)) : null;
  const [precio, setPrecio] = useState(precioInicial !== null ? centimosATexto(precioInicial) : '');
  const [fianza, setFianza] = useState(habitual?.fianza_habitual != null ? centimosATexto(habitual.fianza_habitual) : '');
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
        recogida, devolucion, precio: p ?? 0, fianza_prevista: f ?? 0, visitas,
      });
      onCerrar(r);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError(e instanceof Error && (e.name === 'SinPermiso' || /^(Falta|La |Importe|Fecha)/.test(e.message)) ? e.message : 'No se pudo guardar. Vuelve a intentarlo.');
    }
  };

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <header className="hoja-cabecera">
          <h1 id={`${id}-t`}>Ya la reservé</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={() => onCerrar()}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <div className="formulario-preparar">
            <label className="campo-preparar">
              <span>¿A quién se la alquilas?</span>
              <input value={nombre} list={`${id}-prov`} autoComplete="off" onChange={(e) => setNombre(e.target.value)} />
              <datalist id={`${id}-prov`}>
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
