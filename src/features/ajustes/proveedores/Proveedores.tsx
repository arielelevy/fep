import { Pencil, Phone, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { centimosATexto, formatearEuros, parsearImporte } from '../../../lib/dinero';
import { useLive } from '../../../lib/hooks';
import { AvisoError, PantallaAjuste, useGuardar, usePuedeEditar } from '../plantillas/comun';
import {
  AVISO_FURGO_OPCIONES,
  guardarAvisoFurgo,
  guardarProveedor,
  leerAvisoFurgo,
  leerProveedores,
  marcarHabitual,
  quitarProveedor,
  type Proveedor,
} from './datos';

// Ajustes › Proveedores de alquiler (§10.10.6, §8.14). No está en la maqueta: estilo de la maqueta (decisión H8).
// Tarjetas con nombre, chip «Habitual», teléfono, precio por día y fianza habitual; «Añadir proveedor» y «Cambiar» en
// una hoja inferior. El habitual se preselecciona en «Ya la reservé» y da el botón «Llamar a …» (§10.8.1).
// Debajo, la antelación del aviso para alquilar (§10.10.5: 3 a 5 días, por defecto 4), que usa la alerta FURGO_RESERVAR.

const importe = (c: number | null) => (c === null ? 'Sin dato' : formatearEuros(c, 'detalle'));

export function Proveedores({ etiquetaVolver, onVolver }: { etiquetaVolver: string; onVolver: () => void }) {
  const proveedores = useLive(leerProveedores);
  const aviso = useLive(leerAvisoFurgo);
  const puede = usePuedeEditar();
  const [hoja, setHoja] = useState<null | { proveedor?: Proveedor }>(null);
  const { guardar, error, ocupado } = useGuardar();
  const idAviso = useId();

  return (
    <PantallaAjuste
      id="proveedores"
      titulo="Proveedores de alquiler"
      subtitulo="Para reservar la furgoneta con el precio y la fianza ya puestos."
      etiquetaVolver={etiquetaVolver}
      onVolver={onVolver}
    >
      {proveedores && proveedores.length === 0 && (
        <div className="tarjeta tarjeta-vacia" style={{ marginTop: 12 }}>
          <p className="titulo">Aún no tienes proveedores.</p>
          <p className="secundario" style={{ margin: 0 }}>
            Añade a quién le alquilas la furgoneta y te lo dejo preparado al reservar.
          </p>
        </div>
      )}
      {proveedores?.map((p) => (
        <article key={p.id} className="tarjeta-proveedor" data-proveedor={p.id} aria-labelledby={`prov-${p.id}`}>
          <div className="fila-nombre">
            <h2 id={`prov-${p.id}`}>{p.nombre}</h2>
            {p.habitual && <span className="chip-habitual">Habitual</span>}
          </div>
          <dl>
            {p.telefono && (
              <div>
                <dt>Teléfono</dt>
                <dd>{p.telefono}</dd>
              </div>
            )}
            {p.direccion && (
              <div>
                <dt>Dirección</dt>
                <dd>{p.direccion}</dd>
              </div>
            )}
            <div>
              <dt>Precio por día</dt>
              <dd>{importe(p.precio_dia)}</dd>
            </div>
            <div>
              <dt>Fianza habitual</dt>
              <dd>{importe(p.fianza_habitual)}</dd>
            </div>
          </dl>
          <div className="acciones-proveedor">
            {p.telefono && (
              <a className="boton-texto tocable" href={`tel:${p.telefono}`} aria-label={`Llamar a ${p.nombre}`}>
                <Phone size={16} aria-hidden="true" /> Llamar
              </a>
            )}
            {puede && (
              <>
                <button type="button" className="boton-texto tocable" aria-label={`Cambiar ${p.nombre}`} onClick={() => setHoja({ proveedor: p })}>
                  <Pencil size={16} aria-hidden="true" /> Cambiar
                </button>
                {!p.habitual && (
                  <button type="button" className="boton-texto tocable" disabled={ocupado} onClick={() => guardar(() => marcarHabitual(p.id), `${p.nombre} es el habitual`)}>
                    Hacer habitual
                  </button>
                )}
                <button
                  type="button"
                  className="boton-texto tocable"
                  aria-label={`Quitar ${p.nombre}`}
                  disabled={ocupado}
                  onClick={() => guardar(() => quitarProveedor(p.id), `${p.nombre} quitado`)}
                >
                  Quitar
                </button>
              </>
            )}
          </div>
        </article>
      ))}
      {puede && (
        <button type="button" className="boton-principal tocable boton-anadir" onClick={() => setHoja({})}>
          <Plus size={20} aria-hidden="true" />
          Añadir proveedor
        </button>
      )}

      <h2 className="etiqueta-seccion" id={idAviso}>
        Aviso para alquilar
      </h2>
      <div className="filas" style={{ marginTop: 0 }}>
        <div className="fila">
          <span className="nombre">Días antes del trabajo</span>
          <div className="chips" role="radiogroup" aria-labelledby={idAviso}>
            {AVISO_FURGO_OPCIONES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={aviso === n}
                aria-label={`${n} días antes`}
                className="chip tocable"
                disabled={!puede || ocupado}
                onClick={() => aviso !== n && guardar(() => guardarAvisoFurgo(n), `Te aviso ${n} días antes`)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="secundario" style={{ margin: '8px 4px 0' }}>
        Si sigue sin reservar, te lo repito a 3 días y la víspera.
      </p>
      {!puede && <p className="secundario" style={{ margin: '8px 4px 0' }}>Felipe cambia los proveedores; aquí los ves.</p>}
      <AvisoError error={error} />
      {hoja && <HojaProveedor proveedor={hoja.proveedor} hayOtros={(proveedores?.length ?? 0) > 0} onCerrar={() => setHoja(null)} />}
    </PantallaAjuste>
  );
}

function HojaProveedor({ proveedor, hayOtros, onCerrar }: { proveedor?: Proveedor; hayOtros: boolean; onCerrar: () => void }) {
  const id = useId();
  const [nombre, setNombre] = useState(proveedor?.nombre ?? '');
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? '');
  const [direccion, setDireccion] = useState(proveedor?.direccion ?? '');
  const [precio, setPrecio] = useState(proveedor?.precio_dia != null ? centimosATexto(proveedor.precio_dia) : '');
  const [fianza, setFianza] = useState(proveedor?.fianza_habitual != null ? centimosATexto(proveedor.fianza_habitual) : '');
  const [habitual, setHabitual] = useState(proveedor ? Boolean(proveedor.habitual) : !hayOtros);
  const { guardar, error, setError, ocupado } = useGuardar();

  const enviar = async () => {
    const p = precio.trim() ? parsearImporte(precio) : null;
    const f = fianza.trim() ? parsearImporte(fianza) : null;
    if ((precio.trim() && p === null) || (fianza.trim() && f === null)) {
      setError('Importe no válido');
      return;
    }
    const ok = await guardar(
      () => guardarProveedor({ nombre, telefono, direccion, precio_dia: p, fianza_habitual: f, habitual }, proveedor?.id),
      proveedor ? 'Proveedor cambiado' : 'Proveedor añadido',
    );
    if (ok) onCerrar();
  };

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <header className="hoja-cabecera">
          <h1 id={`${id}-t`}>{proveedor ? `Cambiar ${proveedor.nombre}` : 'Añadir proveedor'}</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={onCerrar}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <form
            className="formulario-ajustes"
            id={`${id}-f`}
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <label className="campo">
              <span>Nombre</span>
              <input value={nombre} maxLength={60} autoComplete="organization" onChange={(e) => setNombre(e.target.value)} />
            </label>
            <label className="campo">
              <span>Teléfono</span>
              <input value={telefono} type="tel" inputMode="tel" autoComplete="tel" onChange={(e) => setTelefono(e.target.value)} />
            </label>
            <label className="campo">
              <span>Dirección</span>
              <input value={direccion} maxLength={120} autoComplete="street-address" onChange={(e) => setDireccion(e.target.value)} />
            </label>
            <label className="campo">
              <span>Precio por día (€)</span>
              <input value={precio} inputMode="decimal" placeholder="0,00" onChange={(e) => setPrecio(e.target.value)} />
            </label>
            <label className="campo">
              <span>Fianza habitual (€)</span>
              <input value={fianza} inputMode="decimal" placeholder="0,00" onChange={(e) => setFianza(e.target.value)} />
            </label>
            <p className="texto-aclaratorio ambar">La fianza no es un gasto. Te la devuelven.</p>
            <label className="casilla-fila">
              <input type="checkbox" checked={habitual} onChange={(e) => setHabitual(e.target.checked)} />
              Es mi proveedor habitual
            </label>
          </form>
          <AvisoError error={error} />
        </div>
        <footer className="hoja-pie">
          <button type="submit" form={`${id}-f`} className="boton-principal tocable" disabled={ocupado || !nombre.trim()}>
            Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}
