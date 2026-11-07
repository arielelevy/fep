import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDatos } from '../../db/datos';
import { formatearEuros } from '../../lib/dinero';
import { claveMes, mesConMayuscula, nombreMes, sumarMeses } from '../../lib/fechas';
import { useEnLinea } from '../../lib/hooks';
import { BandaSinConexion } from '../../screens/Hoy';
import { alquilerFurgoneta, anchoBarra, crecimiento, gastoPorCategoria, ganadoPorMes, margenesPorCliente } from './calculos';
import { ExportarDatos } from './ExportarDatos';
import './informes.css';

// Pantalla Informes (§10.9). No tiene maqueta: sigue §10.9 y el estilo de «3. Movimientos» (docs/maqueta.md §1.3):
// título de 26 pt, selector de mes «‹ Octubre ›» en tarjeta blanca, tarjetas blancas de 16 pt, importes positivos en
// verde medio y el resto en color de texto (sin rojo: §6.1 y §9.3, «− 120 €»). Un dato principal por tarjeta y barras
// sencillas hechas con divs, siempre con su valor en texto. Sin animaciones propias. Accesible desde Movimientos.

const mesCorto = (mes: string) => {
  const n = nombreMes(mes);
  return n.charAt(0).toUpperCase() + n.slice(1, 3);
};

export function Informes({ etiquetaVolver, onVolver }: { etiquetaVolver: string; onVolver: () => void }) {
  const datos = useDatos();
  const enLinea = useEnLinea();
  const mesActual = claveMes(new Date());
  const [mesGasto, setMesGasto] = useState(mesActual);

  const movimientos = datos?.movimientos;
  const ganado = useMemo(() => (movimientos ? ganadoPorMes(movimientos, mesActual) : []), [movimientos, mesActual]);
  const gastos = useMemo(() => (datos ? gastoPorCategoria(datos.movimientos, datos.categorias, mesGasto) : []), [datos, mesGasto]);
  const margenes = useMemo(() => (datos ? margenesPorCliente(datos.movimientos, datos.clientes, mesActual) : []), [datos, mesActual]);
  const alquiler = useMemo(() => (datos ? alquilerFurgoneta(datos.movimientos, datos.categorias, mesActual) : []), [datos, mesActual]);
  const crec = useMemo(() => (datos ? crecimiento(datos.movimientos, datos.clientes, mesActual) : null), [datos, mesActual]);

  return (
    <main className="pantalla informes" aria-labelledby="titulo-informes">
      <button type="button" className="volver tocable" onClick={onVolver}>
        <ChevronLeft size={20} aria-hidden="true" />
        {etiquetaVolver}
      </button>
      <h1 className="titulo-pantalla" id="titulo-informes">
        Informes
      </h1>
      {!enLinea && <div style={{ marginTop: 14 }}><BandaSinConexion /></div>}

      {!datos ? (
        <div aria-busy="true" aria-label="Cargando informes">
          <div className="esqueleto" style={{ height: 180, marginTop: 14 }} />
          <div className="esqueleto" style={{ height: 140, marginTop: 10 }} />
        </div>
      ) : (
        <>
          <TarjetaGanado filas={ganado} mesActual={mesActual} />
          <TarjetaGastoCategoria filas={gastos} mes={mesGasto} mesMaximo={mesActual} onMes={setMesGasto} />
          <TarjetaMargen filas={margenes} anio={mesActual.slice(0, 4)} />
          <TarjetaAlquiler tramos={alquiler} />
          {crec && <TarjetaCrecimiento c={crec} />}
          <ExportarDatos titulo="Exportar a Excel" />
        </>
      )}
    </main>
  );
}

/** Lista de barras horizontales: etiqueta, barra (decorativa) y el valor en texto. */
function Barras({
  filas,
  etiqueta,
  tono = 'verde',
}: {
  filas: { clave: string; texto: string; valor: number; detalle?: string }[];
  etiqueta: string;
  tono?: 'verde' | 'neutro';
}) {
  const maximo = Math.max(0, ...filas.map((f) => Math.abs(f.valor)));
  return (
    <ul className="barras" aria-label={etiqueta}>
      {filas.map((f) => (
        <li key={f.clave} className="barra-fila" data-clave={f.clave}>
          <span className="barra-etiqueta">
            {f.texto}
            {f.detalle && <span className="barra-detalle"> · {f.detalle}</span>}
          </span>
          <span className="barra-pista" aria-hidden="true">
            <span className={`barra-relleno ${f.valor < 0 ? 'negativa' : tono}`} style={{ width: `${anchoBarra(f.valor, maximo)}%` }} />
          </span>
          <span className="barra-valor">{formatearEuros(f.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

function TarjetaGanado({ filas, mesActual }: { filas: { mes: string; ganado: number }[]; mesActual: string }) {
  const actual = filas[filas.length - 1]?.ganado ?? 0;
  const hayDatos = filas.some((f) => f.ganado !== 0);
  return (
    <section className="tarjeta tarjeta-informe" aria-labelledby="inf-ganado" data-tarjeta="ganado">
      <h2 className="titulo-tarjeta-informe" id="inf-ganado">
        Ganado por mes
      </h2>
      <p className="dato-principal" data-testid="ganado-actual">
        <span className={actual > 0 ? 'positivo' : ''}>{formatearEuros(actual)}</span>
        <span className="dato-sub"> en {nombreMes(mesActual)}</span>
      </p>
      {hayDatos ? (
        <Barras
          etiqueta="Ganado en los últimos 12 meses"
          filas={filas.map((f) => ({ clave: f.mes, texto: `${mesCorto(f.mes)} ${f.mes.slice(2, 4)}`, valor: f.ganado }))}
        />
      ) : (
        <p className="secundario vacio-informe">Cuando registres cobros y gastos, aquí verás cómo va cada mes.</p>
      )}
    </section>
  );
}

function TarjetaGastoCategoria({
  filas,
  mes,
  mesMaximo,
  onMes,
}: {
  filas: ReturnType<typeof gastoPorCategoria>;
  mes: string;
  mesMaximo: string;
  onMes: (m: string) => void;
}) {
  const total = filas.reduce((s, f) => s + f.importe, 0);
  const mover = (n: number) => onMes(sumarMeses(mes, n));
  return (
    <section className="tarjeta tarjeta-informe" aria-labelledby="inf-gasto" data-tarjeta="gasto">
      <h2 className="titulo-tarjeta-informe" id="inf-gasto">
        Gasto por categoría
      </h2>
      <div className="selector-mes selector-informe">
        <button type="button" className="tocable" aria-label="Mes anterior" onClick={() => mover(-1)}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <span className="mes" aria-live="polite">
          {mesConMayuscula(mes)} {mes.slice(0, 4)}
        </span>
        <button type="button" className="tocable" aria-label="Mes siguiente" disabled={mes >= mesMaximo} onClick={() => mover(1)}>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
      <p className="dato-principal" data-testid="gasto-total">
        <span>{formatearEuros(total)}</span>
        <span className="dato-sub"> gastado en {nombreMes(mes)}</span>
      </p>
      {filas.length ? (
        <Barras
          etiqueta={`Gasto por categoría en ${nombreMes(mes)}`}
          tono="neutro"
          filas={filas.map((f) => ({ clave: f.categoriaId ?? 'sin', texto: f.nombre, valor: f.importe, detalle: f.esInversion ? 'Equipo' : undefined }))}
        />
      ) : (
        <p className="secundario vacio-informe">No hay gastos en {nombreMes(mes)}.</p>
      )}
    </section>
  );
}

function TarjetaMargen({ filas, anio }: { filas: ReturnType<typeof margenesPorCliente>; anio: string }) {
  const total = filas.reduce((s, f) => s + f.margen, 0);
  return (
    <section className="tarjeta tarjeta-informe" aria-labelledby="inf-margen" data-tarjeta="margen">
      <h2 className="titulo-tarjeta-informe" id="inf-margen">
        Margen por cliente
      </h2>
      <p className="dato-principal">
        <span className={total > 0 ? 'positivo' : ''}>{formatearEuros(total)}</span>
        <span className="dato-sub"> en {anio}</span>
      </p>
      <p className="secundario nota-informe">Lo que te pagó cada cliente menos los gastos que le apuntaste.</p>
      {filas.length ? (
        <ol className="lista-margen" aria-label={`Margen por cliente en ${anio}, de mayor a menor`}>
          {filas.map((f) => (
            <li key={f.clienteId} className="fila-margen" data-cliente={f.clienteId}>
              <span className="margen-nombre">
                {f.nombre}
                <span className="margen-detalle">
                  Cobrado {formatearEuros(f.cobrado)} · Gastos {formatearEuros(f.gastado)}
                </span>
              </span>
              <span className={`margen-valor${f.margen > 0 ? ' positivo' : ''}`}>{formatearEuros(f.margen)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="secundario vacio-informe">Cuando cobres a tus clientes, aquí verás lo que te deja cada uno.</p>
      )}
    </section>
  );
}

function TarjetaAlquiler({ tramos }: { tramos: ReturnType<typeof alquilerFurgoneta> }) {
  const anual = tramos.find((t) => t.meses === 12);
  return (
    <section className="tarjeta tarjeta-informe" aria-labelledby="inf-alquiler" data-tarjeta="alquiler">
      <h2 className="titulo-tarjeta-informe" id="inf-alquiler">
        Alquiler de furgoneta
      </h2>
      <p className="dato-principal" data-testid="alquiler-media">
        <span>{formatearEuros(anual?.media ?? 0)}</span>
        <span className="dato-sub"> al mes de media (12 meses)</span>
      </p>
      <dl className="datos-informe">
        {tramos.map((t) => (
          <div key={t.meses} className="dato-fila" data-meses={t.meses}>
            <dt>Últimos {t.meses} meses</dt>
            <dd>
              {formatearEuros(t.total)}
              <span className="dato-media"> · {formatearEuros(t.media)}/mes</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TarjetaCrecimiento({ c }: { c: ReturnType<typeof crecimiento> }) {
  const hayIngresos = c.ingresosAnio > 0;
  return (
    <section className="tarjeta tarjeta-informe" aria-labelledby="inf-crecimiento" data-tarjeta="crecimiento">
      <h2 className="titulo-tarjeta-informe" id="inf-crecimiento">
        Crecimiento
      </h2>
      <p className="dato-principal" data-testid="ingresos-anio">
        <span className={hayIngresos ? 'positivo' : ''}>{formatearEuros(c.ingresosAnio)}</span>
        <span className="dato-sub"> cobrado en {c.anio}</span>
      </p>
      <dl className="datos-informe">
        <div className="dato-fila">
          <dt>Media mensual</dt>
          <dd data-testid="media-mensual">{formatearEuros(c.mediaMensual)}</dd>
        </div>
        <div className="dato-fila">
          <dt>Clientes activos</dt>
          <dd data-testid="clientes-activos">{c.clientesActivos}</dd>
        </div>
        <div className="dato-fila">
          <dt>Clientes de abono</dt>
          <dd data-testid="clientes-abono">{c.clientesAbono}</dd>
        </div>
      </dl>
      {hayIngresos && (
        <>
          <h3 className="subtitulo-informe">Evolución mensual</h3>
          <Barras
            etiqueta={`Cobrado cada mes de ${c.anio}`}
            filas={c.porMes.map((x) => ({ clave: x.mes, texto: mesCorto(x.mes), valor: x.ingresos }))}
          />
        </>
      )}
    </section>
  );
}
