import { useEffect, useState } from 'react';
import { BarraInferior, type Pestana } from './components/BarraInferior';
import { DeshacerProvider } from './components/Deshacer';
import { Dialogo } from './components/Dialogo';
import { DatosProvider, useDatos } from './db/datos';
import { borrarAjuste, leerAjuste, usarComo } from './db/repo';
import type { Cliente, Movimiento } from './domain/tipos';
import { formatearEuros, parsearImporte } from './lib/dinero';
import { ClienteFicha } from './screens/ClienteFicha';
import { ClienteForm } from './screens/ClienteForm';
import { Clientes } from './screens/Clientes';
import { GuiaInstalacion, debeMostrarGuia } from './screens/GuiaInstalacion';
import { HojaCobro } from './screens/HojaCobro';
import { Hoy, type DestinoHoy } from './screens/Hoy';
import { Marcador } from './screens/Marcador';
import { Movimientos, type Filtro } from './screens/Movimientos';
import { CLAVE_BORRADOR, Registrar, type Borrador, type TipoHoja } from './screens/Registrar';
import { SaldoInicial } from './screens/SaldoInicial';
import { TeDeben } from './screens/TeDeben';

// Navegación (§7): 4 pestañas + botón Registrar; pantallas de segundo nivel con la barra visible
// (Alertas, Ajustes, Informes, Te deben, Ficha de cliente); hojas modales (Registrar, Saldo inicial,
// Nuevo/Editar cliente, ¿Cobraste a …?) a pantalla completa o desde abajo, sin barra. Máximo 3 niveles.

type Sub = null | 'alertas' | 'ajustes' | 'informes' | 'te-deben' | { cliente: string };
type Hoja =
  | null
  | { tipo: 'registrar'; editar?: Movimiento; borrador?: Borrador; inicial?: { tipo: TipoHoja; clienteId?: string } }
  | { tipo: 'saldo' }
  | { tipo: 'cliente'; cliente?: Cliente }
  | { tipo: 'cobro'; clienteId: string };

const NOMBRES: Record<Pestana, string> = { hoy: 'Hoy', movimientos: 'Movimientos', clientes: 'Clientes', agenda: 'Agenda' };

export function App() {
  const [guia, setGuia] = useState(debeMostrarGuia);
  if (guia) return <GuiaInstalacion onSeguir={() => setGuia(false)} />;
  return (
    <DatosProvider>
      <DeshacerProvider>
        <Principal onVerGuia={() => setGuia(true)} />
      </DeshacerProvider>
    </DatosProvider>
  );
}

function Principal({ onVerGuia }: { onVerGuia: () => void }) {
  const datos = useDatos();
  const [pestana, setPestana] = useState<Pestana>('hoy');
  const [sub, setSub] = useState<Sub>(null);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [filtro, setFiltro] = useState<{ f?: Filtro; n: number; cliente?: string }>({ n: 0 });
  const [borradorPendiente, setBorradorPendiente] = useState<Borrador | null>(null);

  // Borrador (§5.1.6): al volver a la app se ofrece recuperar el gasto a medias.
  useEffect(() => {
    leerAjuste<Borrador | null>(CLAVE_BORRADOR, null).then((b) => b && setBorradorPendiente(b));
  }, []);

  const irPestana = (p: Pestana) => {
    // §7.1: volver a tocar la pestaña activa sube al inicio.
    if (p === pestana && !sub) document.scrollingElement?.scrollTo?.({ top: 0, behavior: 'smooth' });
    if (p === 'movimientos' && pestana !== 'movimientos') setFiltro((x) => ({ n: x.n + 1 }));
    setSub(null);
    setPestana(p);
  };

  const irDesdeHoy = (d: DestinoHoy) => {
    if (d === 'saldo-inicial') setHoja({ tipo: 'saldo' });
    else if (d === 'mov-fianzas' || d === 'mov-aportes') {
      setFiltro((x) => ({ f: d === 'mov-fianzas' ? 'fianzas' : 'aportes', n: x.n + 1 }));
      setSub(null);
      setPestana('movimientos');
    } else setSub(d);
  };

  const volver = { etiqueta: NOMBRES[pestana], onVolver: () => setSub(null) };
  const abrirRegistrar = () => setHoja({ tipo: 'registrar' });
  // "Ya pagó" (§9.4): Registrar en Cobro con el cliente y lo pendiente precargados.
  const yaPago = (clienteId: string) => setHoja({ tipo: 'registrar', inicial: { tipo: 'cobro', clienteId } });

  let pantalla;
  if (sub === 'alertas')
    pantalla = <Marcador titulo="Alertas" subtitulo="Tiempo y preparación de los próximos días" vacio="Todo en orden. No hay nada que decidir esta semana." texto="Las alertas del tiempo, la furgoneta y el material llegan en la próxima versión." volver={volver} />;
  else if (sub === 'ajustes')
    pantalla = (
      <Marcador titulo="Ajustes" vacio="Ajustes en camino" texto="Categorías, avisos y proveedores llegan en la próxima versión." volver={volver}>
        <h2 className="etiqueta-seccion">Quién usa este móvil</h2>
        <div className="filas" style={{ marginTop: 0 }}>
          <div className="fila">
            <span className="nombre" id="etq-usuario">Usuario</span>
            <div className="chips" role="radiogroup" aria-labelledby="etq-usuario">
              {(datos?.usuarios ?? []).map((u) => (
                <button key={u.id} type="button" role="radio" aria-checked={datos?.usuario?.id === u.id} className="chip tocable" onClick={() => usarComo(u.rol)}>
                  {u.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="secundario" style={{ margin: '8px 4px 0' }}>Pablo ve todo y solo puede registrar aportes y préstamos.</p>
        <div className="filas">
          <button type="button" className="fila tocable" onClick={onVerGuia}>
            <span className="nombre">Guía de instalación</span>
          </button>
        </div>
      </Marcador>
    );
  else if (sub === 'informes')
    pantalla = <Marcador titulo="Informes" vacio="Informes en camino" texto="Los gráficos y la exportación a Excel llegan en la próxima versión." volver={volver} />;
  else if (sub === 'te-deben') pantalla = <TeDeben etiquetaVolver={NOMBRES[pestana]} onVolver={() => setSub(null)} onYaPago={yaPago} />;
  else if (sub && typeof sub === 'object')
    pantalla = (
      <ClienteFicha
        clienteId={sub.cliente}
        onVolver={() => setSub(null)}
        onEditar={() => setHoja({ tipo: 'cliente', cliente: datos?.clientes.find((c) => c.id === sub.cliente) })}
        onYaPago={yaPago}
        onTrabajoHecho={(clienteId) => setHoja({ tipo: 'cobro', clienteId })}
        onVerMovimientos={(clienteId) => {
          setFiltro((x) => ({ n: x.n + 1, cliente: clienteId }));
          setSub(null);
          setPestana('movimientos');
        }}
      />
    );
  else if (pestana === 'hoy') pantalla = <Hoy onIr={irDesdeHoy} />;
  else if (pestana === 'movimientos')
    pantalla = (
      <Movimientos
        key={filtro.n}
        filtroInicial={filtro.f}
        clienteId={filtro.cliente}
        onQuitarCliente={() => setFiltro((x) => ({ n: x.n + 1 }))}
        onEditar={(m) => setHoja({ tipo: 'registrar', editar: m })}
        onRegistrar={abrirRegistrar}
        onInformes={() => setSub('informes')}
      />
    );
  else if (pestana === 'clientes')
    pantalla = <Clientes onAbrir={(id) => setSub({ cliente: id })} onNuevo={() => setHoja({ tipo: 'cliente' })} />;
  else pantalla = <Marcador titulo="Agenda" subtitulo="Tiempo de los próximos 14 días" vacio="Sin visitas" texto="La agenda y el tiempo llegan en la próxima versión de la app." />;

  const importeBorrador = borradorPendiente ? parsearImporte(borradorPendiente.textoImporte) : null;

  return (
    <div className="app">
      {pantalla}
      <BarraInferior activa={pestana} onPestana={irPestana} onRegistrar={abrirRegistrar} />

      {hoja?.tipo === 'registrar' && (
        <Registrar editar={hoja.editar} borrador={hoja.borrador} inicial={hoja.inicial} onCerrar={() => setHoja(null)} />
      )}
      {hoja?.tipo === 'saldo' && <SaldoInicial onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'cliente' && (
        <ClienteForm
          cliente={hoja.cliente}
          onCerrar={(guardado) => {
            setHoja(null);
            // Un cliente nuevo se abre en su ficha.
            if (guardado && !hoja.cliente) {
              setPestana('clientes');
              setSub({ cliente: guardado.id });
            }
          }}
        />
      )}
      {hoja?.tipo === 'cobro' && <HojaCobro clienteId={hoja.clienteId} onCerrar={() => setHoja(null)} />}

      {borradorPendiente && !hoja && !datos?.esColaborador && (
        <Dialogo
          titulo={importeBorrador ? `Tenías un gasto a medias de ${formatearEuros(importeBorrador)}. ¿Seguir?` : 'Tenías un gasto a medias. ¿Seguir?'}
          principal="Seguir"
          secundario="Descartar"
          onPrincipal={() => {
            setHoja({ tipo: 'registrar', borrador: borradorPendiente });
            setBorradorPendiente(null);
          }}
          onSecundario={() => {
            borrarAjuste(CLAVE_BORRADOR);
            setBorradorPendiente(null);
          }}
        />
      )}
    </div>
  );
}
