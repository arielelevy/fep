import { useEffect, useState } from 'react';
import { BarraInferior, type Pestana } from './components/BarraInferior';
import { DeshacerProvider } from './components/Deshacer';
import { Dialogo } from './components/Dialogo';
import { DatosProvider } from './db/datos';
import { borrarAjuste, leerAjuste } from './db/repo';
import type { Movimiento } from './domain/tipos';
import { formatearEuros, parsearImporte } from './lib/dinero';
import { GuiaInstalacion, debeMostrarGuia } from './screens/GuiaInstalacion';
import { Hoy, type DestinoHoy } from './screens/Hoy';
import { Marcador } from './screens/Marcador';
import { Movimientos, type Filtro } from './screens/Movimientos';
import { CLAVE_BORRADOR, Registrar, type Borrador } from './screens/Registrar';
import { SaldoInicial } from './screens/SaldoInicial';

// Navegación (§7): 4 pestañas + botón Registrar; pantallas de segundo nivel con la barra visible;
// hojas modales (Registrar, Saldo inicial) a pantalla completa sin barra. Máximo 3 niveles.

type Sub = null | 'alertas' | 'ajustes' | 'informes';
type Hoja = null | { tipo: 'registrar'; editar?: Movimiento; borrador?: Borrador } | { tipo: 'saldo' };

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
  const [pestana, setPestana] = useState<Pestana>('hoy');
  const [sub, setSub] = useState<Sub>(null);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [filtro, setFiltro] = useState<{ f?: Filtro; n: number }>({ n: 0 });
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

  let pantalla;
  if (sub === 'alertas')
    pantalla = <Marcador titulo="Alertas" subtitulo="Tiempo y preparación de los próximos días" vacio="Todo en orden. No hay nada que decidir esta semana." texto="Las alertas del tiempo, la furgoneta y el material llegan en la próxima versión." volver={volver} />;
  else if (sub === 'ajustes')
    pantalla = (
      <Marcador titulo="Ajustes" vacio="Ajustes en camino" texto="Categorías, avisos y proveedores llegan en la próxima versión." volver={volver}>
        <div className="filas">
          <button type="button" className="fila tocable" onClick={onVerGuia}>
            <span className="nombre">Guía de instalación</span>
          </button>
        </div>
      </Marcador>
    );
  else if (sub === 'informes')
    pantalla = <Marcador titulo="Informes" vacio="Informes en camino" texto="Los gráficos y la exportación a Excel llegan en la próxima versión." volver={volver} />;
  else if (pestana === 'hoy') pantalla = <Hoy onIr={irDesdeHoy} />;
  else if (pestana === 'movimientos')
    pantalla = (
      <Movimientos
        key={filtro.n}
        filtroInicial={filtro.f}
        onEditar={(m) => setHoja({ tipo: 'registrar', editar: m })}
        onRegistrar={abrirRegistrar}
        onInformes={() => setSub('informes')}
      />
    );
  else if (pestana === 'clientes')
    pantalla = <Marcador titulo="Clientes" vacio="Aún no tienes clientes" texto="Los clientes llegan en la próxima versión de la app." />;
  else pantalla = <Marcador titulo="Agenda" subtitulo="Tiempo de los próximos 14 días" vacio="Sin visitas" texto="La agenda y el tiempo llegan en la próxima versión de la app." />;

  const importeBorrador = borradorPendiente ? parsearImporte(borradorPendiente.textoImporte) : null;

  return (
    <div className="app">
      {pantalla}
      <BarraInferior activa={pestana} onPestana={irPestana} onRegistrar={abrirRegistrar} />

      {hoja?.tipo === 'registrar' && <Registrar editar={hoja.editar} borrador={hoja.borrador} onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'saldo' && <SaldoInicial onCerrar={() => setHoja(null)} />}

      {borradorPendiente && !hoja && (
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
