import { useId, useState } from 'react';
import { Bell, Check, Package, Plus, X } from 'lucide-react';
import { useDeshacer } from '../../components/Deshacer';
import { MEDIOS_PAGO, TIPOS_TRABAJO, type Categoria, type MedioPago, type TipoTrabajo, type Visita } from '../../domain/tipos';

const nombreTipo = (t: TipoTrabajo) => TIPOS_TRABAJO.find((x) => x.id === t)?.nombre ?? t;
import { parsearImporte } from '../../lib/dinero';
import { useCerrojo } from '../../lib/hooks';
import { categoriaDeArticulo, opcionesRecordatorio, recordatorioPorDefecto, textoListaCompra, textoMomento } from './logica';
import type { EstadoMaterial, ItemMaterial } from './modelo';
import { anadirArticulo, guardarRecordatorio, marcarMaterial, registrarGastoArticulo } from './operaciones';

// Bloque Material (§10.8.2; maqueta «7. Preparar trabajo», bloque Material). Cada artículo con «Lo tengo» (lima suave)
// y «Comprar» (ámbar oscuro relleno); estado inicial: ninguno. Con algo en «Comprar» aparece la caja ámbar «Lista de
// compra» con «Recordarme» (por defecto mañana a las 18:00, siempre antes del trabajo). Al marcar «Comprado» se ofrece
// «¿Registrar el gasto?» con la categoría deducida del artículo.

export function BloqueMaterial({
  fecha,
  visitas,
  items,
  recordatorio,
  categorias,
  ultimoMedio,
  puede,
}: {
  fecha: string;
  visitas: Visita[];
  items: ItemMaterial[];
  recordatorio: string | null;
  categorias: Categoria[];
  ultimoMedio: MedioPago;
  puede: boolean;
}) {
  const id = useId();
  const { mostrar } = useDeshacer();
  const [nuevo, setNuevo] = useState<string | null>(null);
  // «Añadir siempre para [tipo]»: tipos de trabajo del día marcados para guardar el artículo en su plantilla.
  const [siempre, setSiempre] = useState<TipoTrabajo[]>([]);
  const tiposDia = [...new Set(visitas.flatMap((v) => v.tipos_trabajo))];
  const [elegirHora, setElegirHora] = useState(false);
  const [otraHora, setOtraHora] = useState('');
  const [gasto, setGasto] = useState<ItemMaterial | null>(null);
  const [error, setError] = useState('');
  const ahora = new Date();

  const fallo = (e: unknown) => {
    console.error(e);
    setError(e instanceof Error && e.name === 'SinPermiso' ? e.message : 'No se pudo guardar. Vuelve a intentarlo.');
  };

  const marcar = async (item: ItemMaterial, estado: EstadoMaterial) => {
    setError('');
    try {
      // Tocar otra vez el botón activo lo deja sin revisar.
      const destino = item.estado === estado ? 'sin_revisar' : estado;
      await marcarMaterial(fecha, item, destino);
      // Primera cosa a comprar: el recordatorio por defecto queda guardado (mañana a las 18:00 si cabe antes del trabajo).
      if (destino === 'comprar' && !recordatorio) {
        const def = recordatorioPorDefecto(new Date(), fecha, visitas);
        if (def) await guardarRecordatorio(fecha, def);
      }
    } catch (e) {
      fallo(e);
    }
  };

  const comprado = async (item: ItemMaterial) => {
    setError('');
    try {
      const r = await marcarMaterial(fecha, item, 'comprado');
      mostrar(`${item.nombre}: comprado`, r.deshacer);
      setGasto(item);
    } catch (e) {
      fallo(e);
    }
  };

  const anadir = async () => {
    if (!nuevo?.trim()) return;
    setError('');
    try {
      const r = await anadirArticulo(fecha, nuevo, siempre);
      mostrar(siempre.length ? 'Añadido a la lista y a la plantilla' : 'Añadido a la lista', r.deshacer);
      setNuevo(null);
      setSiempre([]);
    } catch (e) {
      fallo(e);
    }
  };

  const recordar = async (valor: string | null) => {
    setError('');
    try {
      const r = await guardarRecordatorio(fecha, valor);
      mostrar(valor ? `Te lo recuerdo ${textoMomento(valor, new Date())}` : 'Recordatorio quitado', r.deshacer);
      setElegirHora(false);
    } catch (e) {
      fallo(e);
    }
  };

  const lista = textoListaCompra(items);
  const aComprar = items.filter((i) => i.estado === 'comprar');
  const opciones = opcionesRecordatorio(ahora, fecha, visitas);

  return (
    <section className="tarjeta bloque-preparar" aria-labelledby={`${id}-t`} data-bloque="material">
      <header className="bloque-cabecera">
        <span className="bloque-icono" aria-hidden="true">
          <Package size={22} />
        </span>
        <div>
          <h2 id={`${id}-t`}>¿Tienes todo el material?</h2>
          <p className="bloque-sub">Lista según el tipo de trabajo</p>
        </div>
      </header>

      {items.length === 0 && <p className="bloque-texto">Para estos trabajos no hay lista de material. Añade lo que necesites.</p>}

      <ul className="lista-material">
        {items.map((item) => (
          <li key={item.nombre} className="articulo" data-estado={item.estado}>
            <span className="nombre">{item.nombre}</span>
            {item.estado === 'comprado' ? (
              <span className="chip-preparar lima">Comprado</span>
            ) : (
              <span className="botones" role="group" aria-label={item.nombre}>
                <button
                  type="button"
                  className="boton-material tengo tocable"
                  aria-pressed={item.estado === 'lo_tengo'}
                  disabled={!puede}
                  onClick={() => marcar(item, 'lo_tengo')}
                >
                  Lo tengo
                </button>
                <button
                  type="button"
                  className="boton-material comprar tocable"
                  aria-pressed={item.estado === 'comprar'}
                  disabled={!puede}
                  onClick={() => marcar(item, 'comprar')}
                >
                  Comprar
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {puede &&
        (nuevo === null ? (
          <button type="button" className="boton-texto tocable anadir" onClick={() => setNuevo('')}>
            <Plus size={18} aria-hidden="true" />
            Añadir otra cosa
          </button>
        ) : (
          <div className="anadir-articulo">
            <label className="sr-only" htmlFor={`${id}-nuevo`}>
              Qué más necesitas
            </label>
            <input
              id={`${id}-nuevo`}
              value={nuevo}
              placeholder="Qué más necesitas"
              autoFocus
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && anadir()}
            />
            <button type="button" className="chip tocable" disabled={!nuevo.trim()} onClick={anadir}>
              Añadir
            </button>
            <button type="button" className="boton-icono tocable" aria-label="Cancelar" onClick={() => setNuevo(null)}>
              <X size={20} aria-hidden="true" />
            </button>
            {tiposDia.length > 0 && (
              <div className="siempre-para">
                {tiposDia.map((t) => {
                  const marcado = siempre.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      role="checkbox"
                      aria-checked={marcado}
                      className="prenda tocable"
                      onClick={() => setSiempre((s) => (marcado ? s.filter((x) => x !== t) : [...s, t]))}
                    >
                      <span className="casilla" aria-hidden="true">
                        {marcado && <Check size={16} strokeWidth={3} />}
                      </span>
                      <span>Añadir siempre para {nombreTipo(t).toLowerCase()}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

      {lista && (
        <div className="caja-compra">
          <p className="lista">{lista}</p>
          <div className="recordarme">
            <Bell size={18} aria-hidden="true" />
            <span className="etiqueta">Recordarme</span>
            <button type="button" className="boton-hora tocable" disabled={!puede} aria-expanded={elegirHora} onClick={() => setElegirHora((x) => !x)}>
              {recordatorio ? capital(textoMomento(recordatorio, ahora)) : 'Elegir hora'}
            </button>
          </div>
          {elegirHora && puede && (
            <div className="opciones-recordatorio">
              {opciones.map((o) => (
                <button key={o.valor} type="button" className="chip tocable" aria-pressed={recordatorio === o.valor} onClick={() => recordar(o.valor)}>
                  {o.texto}
                </button>
              ))}
              <label className="sr-only" htmlFor={`${id}-hora`}>
                Elegir día y hora
              </label>
              <input id={`${id}-hora`} type="datetime-local" value={otraHora} onChange={(e) => setOtraHora(e.target.value)} />
              <button type="button" className="chip tocable" disabled={!otraHora} onClick={() => recordar(otraHora)}>
                Elegir
              </button>
              {recordatorio && (
                <button type="button" className="boton-texto tocable" onClick={() => recordar(null)}>
                  No recordarme
                </button>
              )}
            </div>
          )}
          {puede && (
            <ul className="por-comprar">
              {aComprar.map((i) => (
                <li key={i.nombre}>
                  <span>{i.nombre}</span>
                  <button type="button" className="chip tocable" onClick={() => comprado(i)}>
                    Comprado
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      )}

      {gasto && (
        <HojaGasto
          fecha={fecha}
          item={gasto}
          visitas={visitas}
          categorias={categorias}
          ultimoMedio={ultimoMedio}
          onCerrar={(texto, deshacer) => {
            setGasto(null);
            if (texto && deshacer) mostrar(texto, deshacer);
          }}
        />
      )}
    </section>
  );
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** «¿Registrar el gasto?» (§10.8.2): importe, categoría deducida (cambiable) y pago; imputado a la visita si hay una sola cliente. */
function HojaGasto({
  fecha,
  item,
  visitas,
  categorias,
  ultimoMedio,
  onCerrar,
}: {
  fecha: string;
  item: ItemMaterial;
  visitas: Visita[];
  categorias: Categoria[];
  ultimoMedio: MedioPago;
  onCerrar: (texto?: string, deshacer?: () => Promise<void>) => void;
}) {
  const id = useId();
  const cerrojo = useCerrojo();
  const gastos = categorias.filter((c) => c.tipo === 'gasto' && !c.eliminado_en && c.visible).sort((a, b) => a.orden_manual - b.orden_manual);
  const deducida = categorias.find((c) => c.clave === categoriaDeArticulo(item.nombre, item.tipo)) ?? gastos.find((c) => c.clave === 'otros_gastos');
  const [categoria, setCategoria] = useState(deducida?.id ?? gastos[0]?.id ?? '');
  const [importe, setImporte] = useState('');
  const [medio, setMedio] = useState<MedioPago>(ultimoMedio);
  const [error, setError] = useState('');
  const clientes = [...new Set(visitas.map((v) => v.cliente_id))];
  const valor = parsearImporte(importe);

  const guardar = async () => {
    if (valor === null || valor <= 0 || !categoria || !cerrojo.tomar()) return;
    try {
      const r = await registrarGastoArticulo(fecha, item, { importe: valor, categoria_id: categoria, medio_pago: medio, cliente_id: clientes.length === 1 ? clientes[0] : null });
      onCerrar('Gasto guardado', r.deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError(e instanceof Error && e.name === 'SinPermiso' ? e.message : 'No se pudo guardar. Vuelve a intentarlo.');
    }
  };

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
        <header className="hoja-cabecera">
          <h1 id={`${id}-titulo`}>¿Registrar el gasto?</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={() => onCerrar()}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <div className="formulario-preparar">
            <p className="bloque-texto">{item.nombre}</p>
            <label className="campo-preparar">
              <span>Importe (€)</span>
              <input inputMode="decimal" value={importe} placeholder="0,00" autoFocus onChange={(e) => setImporte(e.target.value)} />
            </label>
            <label className="campo-preparar">
              <span>Categoría</span>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {gastos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <div className="bloque-medios">
              <span className="etiqueta-campo" id={`${id}-pago`}>
                Pago
              </span>
              <div className="chips" role="radiogroup" aria-labelledby={`${id}-pago`}>
                {MEDIOS_PAGO.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={medio === m.id} className="chip tocable" onClick={() => setMedio(m.id)}>
                    {m.nombre}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && (
            <p className="aviso-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="hoja-pie hoja-pie-doble">
          <button type="button" className="boton-texto tocable" onClick={() => onCerrar()}>
            Ahora no
          </button>
          <button type="button" className="boton-principal tocable" disabled={valor === null || valor <= 0 || cerrojo.ocupado} onClick={guardar}>
            Guardar gasto
          </button>
        </footer>
      </div>
    </div>
  );
}
