import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronRight, Ellipsis, Search, X } from 'lucide-react';
import { Dialogo } from '../components/Dialogo';
import { Icono } from '../components/Icono';
import { useDeshacer } from '../components/Deshacer';
import { useDatos } from '../db/datos';
import { db } from '../db/db';
import { borrarAjuste, crearMovimiento, editarMovimiento, eliminarMovimiento, guardarAjuste, guardarFoto } from '../db/repo';
import { esImporteAtipico } from '../domain/cifras';
import { ordenarCategoriasGasto } from '../domain/ordenCategorias';
import { MEDIOS_PAGO, etiquetaEliminado, type Categoria, type MedioPago, type Movimiento } from '../domain/tipos';
import { centimosATexto, formatearEuros, formatearMientrasEscribe, parsearImporte } from '../lib/dinero';
import { claveDia, etiquetaFechaCorta, fechaMaximaRegistro, instanteDeClaveDia } from '../lib/fechas';
import { useCerrojo } from '../lib/hooks';
import { comprimirTicket } from '../lib/imagen';
import { ElegirCliente, RegistrarDinero, SoloLectura, tipoHojaDe } from './RegistrarDinero';

// Hoja "Nuevo movimiento" (§10.2), construida contra el mockup "2. Registrar" (PDF p. 2, docs/maqueta.md §1.2).
// Diferencias de la maqueta resueltas por la especificación: filas Fecha y Nota, chip Transferencia,
// aria-label "Foto del ticket" en la cámara. Cobro, Aporte y Fianza (ola 4) viven en RegistrarDinero.tsx.

export type TipoHoja = 'gasto' | 'cobro' | 'aporte' | 'fianza';

export interface Borrador {
  textoImporte: string;
  categoriaId: string | null;
  fechaClave: string;
  medio: MedioPago;
  nota: string;
}

export const CLAVE_BORRADOR = 'borrador_registro';

const TIPOS: { id: TipoHoja; nombre: string }[] = [
  { id: 'gasto', nombre: 'Gasto' },
  { id: 'cobro', nombre: 'Cobro' },
  { id: 'aporte', nombre: 'Aporte' },
  { id: 'fianza', nombre: 'Fianza' },
];


// Cola única para el borrador: evita que una escritura tardía lo resucite tras guardar.
let colaBorrador: Promise<unknown> = Promise.resolve();
// La cola guarda la versión «atendida» de cada escritura: si una falla (p. ej. la base se cerró), no queda un rechazo
// sin atender hasta la siguiente pulsación. Quien espera la escritura recibe igualmente el error.
const encolar = (f: () => Promise<unknown>) => {
  const r = colaBorrador.then(f, f);
  colaBorrador = r.catch(() => undefined);
  return r;
};

export function Registrar({
  editar,
  borrador,
  inicial,
  onCerrar,
}: {
  editar?: Movimiento;
  borrador?: Borrador;
  /** Tipo y cliente precargados (p. ej. "Ya pagó" abre en Cobro con el cliente, §9.4). */
  inicial?: { tipo: TipoHoja; clienteId?: string };
  onCerrar: () => void;
}) {
  const datos = useDatos();
  const { mostrar } = useDeshacer();
  const hoy = claveDia(new Date());
  const esSaldo = editar?.tipo === 'saldo_inicial';

  const [tipo, setTipo] = useState<TipoHoja>(editar ? (esSaldo ? 'gasto' : tipoHojaDe(editar.tipo)) : (inicial?.tipo ?? (datos?.esColaborador ? 'aporte' : 'gasto')));
  const [textoImporte, setTextoImporte] = useState(
    editar ? centimosATexto(editar.importe) : (borrador?.textoImporte ?? ''),
  );
  const [categoriaId, setCategoriaId] = useState<string | null>(editar?.categoria_id ?? borrador?.categoriaId ?? null);
  const [fechaClave, setFechaClave] = useState(editar ? claveDia(editar.fecha) : (borrador?.fechaClave ?? hoy));
  const [medio, setMedio] = useState<MedioPago>(editar?.medio_pago ?? borrador?.medio ?? datos?.ultimoMedio ?? 'efectivo');
  const [nota, setNota] = useState(editar?.nota ?? borrador?.nota ?? '');
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [fotoExistente, setFotoExistente] = useState<string | null>(editar?.foto_id ?? null);
  const [fotoExistenteUrl, setFotoExistenteUrl] = useState<string | null>(null);
  const [verMas, setVerMas] = useState(false);
  const [confirmar, setConfirmar] = useState<null | 'descartar' | 'atipico' | 'eliminar'>(null);
  // Cliente imputado (§9.5): opcional en gastos; cuenta en el margen del cliente.
  const [clienteId, setClienteId] = useState<string | null>(editar?.cliente_id ?? null);
  const [verClientes, setVerClientes] = useState(false);
  const [error, setError] = useState('');
  const cerrojo = useCerrojo(); // evita dobles guardados con un doble toque
  const fotoGuardada = useRef<{ blob: Blob; id: string } | null>(null); // reintento sin fotos huérfanas
  const cerrando = useRef(false);
  const inputImporte = useRef<HTMLInputElement>(null);

  const importe = parsearImporte(textoImporte);
  const { cuadricula, resto } = useMemo(
    () => (datos ? ordenarCategoriasGasto(datos.categorias, datos.movimientos) : { cuadricula: [], resto: [] }),
    // El orden se fija al abrir la hoja para que no salte mientras se elige.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos === undefined],
  );
  const categoria = datos?.categorias.find((c) => c.id === categoriaId);
  const enMas = categoria && !cuadricula.some((c) => c.id === categoria.id);

  // Si el último medio de pago llega después de abrir (carga inicial), se aplica.
  const medioTocado = useRef(Boolean(editar || borrador));
  useEffect(() => {
    if (!medioTocado.current && datos) setMedio(datos.ultimoMedio);
    // Pablo (colaborador) sólo registra aportes y préstamos (§3): la hoja abre en Aporte.
    if (datos?.esColaborador && !editar && !inicial) setTipo((t) => (t === 'gasto' ? 'aporte' : t));
  }, [datos, editar, inicial]);

  // Foto existente al editar.
  useEffect(() => {
    if (!fotoExistente) return;
    let url: string | null = null;
    let activo = true;
    db.fotos.get(fotoExistente).then((f) => {
      if (activo && f && typeof URL.createObjectURL === 'function') {
        url = URL.createObjectURL(f.blob);
        setFotoExistenteUrl(url);
      }
    }).catch((e) => console.error('No se pudo leer la foto del ticket', e));
    return () => {
      activo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fotoExistente]);

  // La miniatura de la foto nueva se libera al cambiarla (elegirFoto) o al cerrar la hoja.
  const fotoUrl = foto?.url;
  useEffect(
    () => () => {
      if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    },
    [fotoUrl],
  );

  // Borrador (§5.1.6): se guarda en local en cada cambio de un gasto nuevo.
  useEffect(() => {
    if (editar || cerrando.current || tipo !== 'gasto') return;
    const hay = Boolean(textoImporte || categoriaId);
    const valor: Borrador = { textoImporte, categoriaId, fechaClave, medio, nota };
    encolar(() => {
      if (cerrando.current) return Promise.resolve();
      return hay ? guardarAjuste(CLAVE_BORRADOR, valor) : borrarAjuste(CLAVE_BORRADOR);
    }).catch((e) => console.error('No se pudo guardar el borrador', e));
  }, [editar, tipo, textoImporte, categoriaId, fechaClave, medio, nota]);

  const hayDatos = Boolean(textoImporte || categoriaId || nota || foto);
  const esGasto = esSaldo || tipo === 'gasto';
  const puedeGuardar = esGasto && importe !== null && importe > 0 && (esSaldo || Boolean(categoriaId));
  const fechaMax = fechaMaximaRegistro(hoy);
  // Al editar, un importe ya confirmado no vuelve a preguntar si no cambian importe ni categoría.
  const sinCambiosDeImporte = editar && importe === editar.importe && categoriaId === editar.categoria_id;

  const cerrarSinGuardar = async () => {
    cerrando.current = true;
    if (!editar) await encolar(() => borrarAjuste(CLAVE_BORRADOR));
    onCerrar();
  };

  const pulsarCerrar = () => {
    if (!editar && hayDatos) setConfirmar('descartar');
    else onCerrar();
  };

  const fechaFinal = (): string => {
    if (editar && fechaClave === claveDia(editar.fecha)) return editar.fecha;
    if (fechaClave === hoy) return new Date().toISOString();
    return instanteDeClaveDia(fechaClave, new Date()).toISOString();
  };

  const guardar = async (forzar = false) => {
    if (!puedeGuardar || importe === null || !datos || cerrojo.ocupado) return;
    if (
      !esSaldo &&
      !forzar &&
      !sinCambiosDeImporte &&
      categoriaId &&
      esImporteAtipico(importe, categoriaId, datos.movimientos, editar?.id)
    ) {
      setConfirmar('atipico');
      return;
    }
    if (!cerrojo.tomar()) return;
    setError('');
    try {
      let fotoId = fotoExistente;
      if (foto) {
        if (fotoGuardada.current?.blob !== foto.blob) {
          fotoGuardada.current = { blob: foto.blob, id: await guardarFoto(foto.blob) };
        }
        fotoId = fotoGuardada.current.id;
      }
      const comunes = { importe, fecha: fechaFinal(), medio_pago: medio, nota, foto_id: fotoId };
      cerrando.current = true;
      if (editar) {
        const r = await editarMovimiento(editar.id, esSaldo ? comunes : { ...comunes, categoria_id: categoriaId, cliente_id: clienteId });
        onCerrar();
        mostrar(esSaldo ? 'Saldo editado' : 'Gasto editado', r.deshacer);
      } else {
        const r = await crearMovimiento({ tipo: 'gasto', categoria_id: categoriaId, cliente_id: clienteId, ...comunes });
        onCerrar();
        mostrar('Gasto guardado', r.deshacer);
        await encolar(() => borrarAjuste(CLAVE_BORRADOR));
      }
    } catch (e) {
      console.error(e);
      cerrando.current = false;
      cerrojo.soltar();
      setError('No se pudo guardar. Lo que has escrito sigue aquí; vuelve a intentarlo.');
    }
  };

  const eliminar = async () => {
    if (!editar) return;
    try {
      const r = await eliminarMovimiento(editar.id);
      onCerrar();
      mostrar(etiquetaEliminado(editar.tipo), r.deshacer);
    } catch (e) {
      console.error(e);
      setError('No se pudo eliminar. Vuelve a intentarlo.');
    }
  };

  const elegirFoto = async (archivo: File | undefined) => {
    if (!archivo) return;
    const blob = await comprimirTicket(archivo);
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
    setFoto({ blob, url });
    setFotoExistente(null);
  };

  const titulo = esSaldo ? 'Editar saldo inicial' : editar ? 'Editar gasto' : 'Nuevo movimiento';
  const textoGuardar = editar ? 'Guardar cambios' : `Guardar ${TIPOS.find((t) => t.id === tipo)!.nombre.toLowerCase()}`;
  const fechaFutura = fechaClave > hoy;
  const miniatura = foto?.url || fotoExistenteUrl;

  const colaborador = datos?.esColaborador ?? false;
  const segmentadoTipos = !editar && (
    <div className="segmentado" role="radiogroup" aria-label="Tipo de movimiento">
      {TIPOS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={tipo === t.id}
          className="tocable"
          disabled={colaborador && t.id !== 'aporte'}
          onClick={() => setTipo(t.id)}
        >
          {t.nombre}
        </button>
      ))}
    </div>
  );
  // Hallazgo 1 del revisor de la ola 4: Pablo ve por qué hay pestañas tachadas (§3, §5.6.3: nunca solo por color).
  const segmentado = segmentadoTipos && (
    <>
      {segmentadoTipos}
      {colaborador && (
        <p className="secundario" id="aviso-colaborador" style={{ margin: '6px 4px 0', fontSize: '0.8125rem' }}>
          Solo puedes registrar aportes y préstamos.
        </p>
      )}
    </>
  );

  // Al guardar o descartar un cobro, aporte o fianza, el borrador del gasto ya no sirve (QA ola 4, hallazgo 4).
  const cerrarDinero = async () => {
    cerrando.current = true;
    if (!editar) await encolar(() => borrarAjuste(CLAVE_BORRADOR));
    onCerrar();
  };

  if (colaborador && editar && (esSaldo || editar.tipo === 'gasto')) return <SoloLectura m={editar} onCerrar={onCerrar} />;
  if (!esGasto)
    return (
      <RegistrarDinero
        tipo={tipo as Exclude<TipoHoja, 'gasto'>}
        editar={editar}
        clienteInicial={inicial?.clienteId}
        cabecera={segmentado}
        compartido={{
          textoImporte, setTextoImporte, fechaClave, setFechaClave, nota, setNota, medio,
          setMedio: (m) => { medioTocado.current = true; setMedio(m); },
        }}
        onPulsarCerrar={cerrarDinero}
        onCerrar={cerrarDinero}
      />
    );

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby="titulo-registrar">
        <header className="hoja-cabecera">
          <h1 id="titulo-registrar">{titulo}</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={pulsarCerrar}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>

        <div className="hoja-cuerpo">
          {segmentado}

          {esGasto ? (
            <>
              <div className="importe">
                <label htmlFor="importe">Importe</label>
                <div className="campo">
                  <input
                    ref={inputImporte}
                    id="importe"
                    name="importe"
                    inputMode="decimal"
                    enterKeyHint="done"
                    autoComplete="off"
                    autoFocus
                    placeholder="0"
                    value={textoImporte}
                    style={{ width: `${Math.max(textoImporte.length, 1) + 0.3}ch` }}
                    onChange={(e) => {
                      const nuevo = formatearMientrasEscribe(e.target.value, textoImporte);
                      if (nuevo !== null) setTextoImporte(nuevo);
                    }}
                  />
                  <span className="euro" aria-hidden="true">
                    €
                  </span>
                </div>
              </div>

              {esSaldo ? (
                <p className="texto-aclaratorio neutro">Dinero del negocio al empezar. No cuenta como ganancia.</p>
              ) : (
                <>
                  <p className="subtitulo-campo" id="titulo-categoria">
                    Categoría
                  </p>
                  <div className="cuadricula" role="radiogroup" aria-labelledby="titulo-categoria">
                    {cuadricula.map((c) => (
                      <BotonCategoria
                        key={c.id}
                        c={c}
                        elegida={c.id === categoriaId}
                        onElegir={() => setCategoriaId(c.id)}
                      />
                    ))}
                    <button
                      type="button"
                      className="categoria tocable"
                      role="radio"
                      aria-checked={Boolean(enMas)}
                      aria-label={enMas ? `Más: ${categoria!.nombre}` : 'Más categorías'}
                      onClick={() => setVerMas(true)}
                    >
                      {enMas ? <Icono nombre={categoria!.icono} size={26} /> : <Ellipsis size={26} aria-hidden="true" />}
                      {enMas ? categoria!.nombre_corto : 'Más'}
                    </button>
                  </div>
                </>
              )}

              <div className="filas">
                <div className="fila fila-fecha">
                  <span className="nombre" id="etq-fecha">
                    Fecha
                  </span>
                  <span className="valor fuerte">
                    {etiquetaFechaCorta(fechaClave)}
                    <ChevronRight size={18} aria-hidden="true" />
                  </span>
                  <input
                    type="date"
                    aria-labelledby="etq-fecha"
                    value={fechaClave}
                    max={fechaMax}
                    onChange={(e) => e.target.value && e.target.value <= fechaMax && setFechaClave(e.target.value)}
                  />
                </div>
                {fechaFutura && <p className="aviso-fila">¿Es un gasto previsto? Lo guardo con fecha {etiquetaFechaCorta(fechaClave).toLowerCase()}.</p>}
                {!esSaldo && (
                  <>
                    <button type="button" className="fila tocable" onClick={() => setVerClientes(true)}>
                      <span className="nombre">Cliente</span>
                      <span className={`valor${clienteId ? ' fuerte' : ''}`}>
                        {datos?.clientes.find((x) => x.id === clienteId)?.nombre ?? 'Opcional'}
                        <ChevronRight size={18} aria-hidden="true" />
                      </span>
                    </button>
                    {clienteId && (
                      <button type="button" className="boton-texto tocable" style={{ marginLeft: 8 }} onClick={() => setClienteId(null)}>
                        Quitar cliente
                      </button>
                    )}
                  </>
                )}
                <div className="fila">
                  <span className="nombre" id="etq-pago">
                    Pago
                  </span>
                  <div className="chips" role="radiogroup" aria-labelledby="etq-pago">
                    {MEDIOS_PAGO.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={medio === m.id}
                        className="chip tocable"
                        onClick={() => {
                          medioTocado.current = true;
                          setMedio(m.id);
                        }}
                      >
                        {m.nombre}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="fila">
                  <span className="nombre">Nota</span>
                  <input type="text" placeholder="Opcional" value={nota} maxLength={140} onChange={(e) => setNota(e.target.value)} />
                </label>
              </div>

              {editar && (
                <div style={{ marginTop: 18 }}>
                  <button type="button" className="boton-peligro tocable" onClick={() => setConfirmar('eliminar')}>
                    Eliminar
                  </button>
                </div>
              )}
            </>
          ) : null}

          {error && (
            <p className="aviso-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="hoja-pie">
          {esGasto && !esSaldo && (
            <label className="boton-camara tocable">
              {miniatura ? <img src={miniatura} alt="" /> : <Camera size={26} aria-hidden="true" />}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                aria-label={miniatura ? 'Cambiar foto del ticket' : 'Foto del ticket'}
                onChange={(e) => elegirFoto(e.target.files?.[0])}
              />
            </label>
          )}
          <button type="button" className="boton-principal tocable" disabled={!puedeGuardar || cerrojo.ocupado} onClick={() => guardar()}>
            {textoGuardar}
          </button>
        </footer>
      </div>

      {verClientes && datos && (
        <ElegirCliente
          clientes={datos.clientes.filter((x) => x.activo)}
          movs={datos.movimientos}
          onElegir={(x) => {
            setClienteId(x.id);
            setVerClientes(false);
          }}
          onCerrar={() => setVerClientes(false)}
        />
      )}
      {verMas && datos && (
        <ListaMas
          categorias={[...cuadricula, ...resto]}
          elegida={categoriaId}
          onElegir={(id) => {
            setCategoriaId(id);
            setVerMas(false);
          }}
          onCerrar={() => setVerMas(false)}
        />
      )}

      {confirmar === 'descartar' && (
        <Dialogo
          titulo="¿Descartar este gasto?"
          principal="Descartar"
          secundario="Seguir editando"
          onPrincipal={cerrarSinGuardar}
          onSecundario={() => setConfirmar(null)}
        />
      )}
      {confirmar === 'atipico' && importe !== null && (
        <Dialogo
          titulo={`¿Seguro que son ${formatearEuros(importe)}?`}
          texto={`Es mucho más de lo habitual en ${categoria?.nombre_corto ?? 'esta categoría'}.`}
          principal="Sí"
          secundario="Corregir"
          onPrincipal={() => {
            setConfirmar(null);
            guardar(true);
          }}
          onSecundario={() => {
            setConfirmar(null);
            inputImporte.current?.focus();
          }}
        />
      )}
      {confirmar === 'eliminar' && (
        <Dialogo
          titulo={esSaldo ? '¿Eliminar este saldo?' : '¿Eliminar este gasto?'}
          texto="Podrás deshacerlo durante unos segundos."
          principal="Eliminar"
          secundario="Cancelar"
          onPrincipal={() => {
            setConfirmar(null);
            eliminar();
          }}
          onSecundario={() => setConfirmar(null)}
        />
      )}
    </div>
  );
}

function BotonCategoria({ c, elegida, onElegir }: { c: Categoria; elegida: boolean; onElegir: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={elegida} className="categoria tocable" onClick={onElegir} aria-label={c.nombre}>
      <Icono nombre={c.icono} size={26} />
      <span aria-hidden="true">{c.nombre_corto}</span>
    </button>
  );
}

// Lista completa agrupada y con buscador (§10.2.2 "Más").
function ListaMas({
  categorias,
  elegida,
  onElegir,
  onCerrar,
}: {
  categorias: Categoria[];
  elegida: string | null;
  onElegir: (id: string) => void;
  onCerrar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filtradas = categorias.filter((c) => norm(c.nombre).includes(norm(busca)));
  const grupos = [...new Set(filtradas.map((c) => c.grupo))];
  return (
    <div className="capa" style={{ zIndex: 56 }}>
      <div className="hoja lista-mas" role="dialog" aria-modal="true" aria-labelledby="titulo-mas">
        <header className="hoja-cabecera">
          <h2 id="titulo-mas">Categorías</h2>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={onCerrar}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <label style={{ position: 'relative', display: 'block' }}>
            <span className="sr-only">Buscar categoría</span>
            <input className="buscador" type="search" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <Search size={18} aria-hidden="true" style={{ position: 'absolute', right: 14, top: 15, color: 'var(--texto-3)' }} />
          </label>
          {grupos.map((g) => (
            <section key={g}>
              <h3 className="etiqueta-seccion">{g}</h3>
              <div className="filas" style={{ marginTop: 0 }} role="radiogroup" aria-label={g}>
                {filtradas
                  .filter((c) => c.grupo === g)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={c.id === elegida}
                      className="fila tocable"
                      onClick={() => onElegir(c.id)}
                    >
                      <Icono nombre={c.icono} size={22} className="icono" />
                      <span className="nombre" style={{ flex: 1, fontWeight: 600 }}>
                        {c.nombre}
                      </span>
                    </button>
                  ))}
              </div>
            </section>
          ))}
          {filtradas.length === 0 && <p className="secundario" style={{ marginTop: 16 }}>No hay categorías con ese nombre.</p>}
        </div>
      </div>
    </div>
  );
}
