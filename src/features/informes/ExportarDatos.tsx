import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useDatos } from '../../db/datos';
import { archivoXlsx, archivosCsv, compartirODescargar, fechaEs, hojasExportacion, rangoAnioEnCurso, type Rango } from './exportar';
import './informes.css';

// Exportar datos (§15). Bloque reutilizable: va en Informes (§10.9.6) y en Ajustes. Filtro por rango de fechas
// (por defecto, el año en curso en Madrid), «Exportar a Excel» (.xlsx con 5 hojas) y alternativa CSV (un archivo
// por hoja). Se comparte con la hoja del sistema si admite archivos; si no, se descarga.

type Formato = 'xlsx' | 'csv';

export function ExportarDatos({ titulo = 'Exportar datos' }: { titulo?: string }) {
  const datos = useDatos();
  const [rango, setRango] = useState<Rango>(() => rangoAnioEnCurso());
  const [ocupado, setOcupado] = useState<Formato | null>(null);
  const [aviso, setAviso] = useState('');
  const rangoValido = Boolean(rango.desde && rango.hasta && rango.desde <= rango.hasta);

  const exportar = async (formato: Formato) => {
    if (!datos || !rangoValido) return;
    setOcupado(formato);
    setAviso('');
    try {
      const hojas = hojasExportacion(datos, rango);
      const archivos = formato === 'xlsx' ? [archivoXlsx(hojas, rango)] : archivosCsv(hojas, rango);
      const r = await compartirODescargar(archivos);
      if (r === 'compartido') setAviso('Listo. Archivo compartido.');
      else if (r === 'descargado') setAviso(formato === 'xlsx' ? 'Listo. Archivo descargado.' : 'Listo. Archivos descargados.');
    } catch (e) {
      console.error(e);
      setAviso('No se pudo exportar. Vuelve a intentarlo.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section className="tarjeta exportar-datos" aria-labelledby="titulo-exportar">
      <h2 className="titulo-tarjeta-informe" id="titulo-exportar">
        {titulo}
      </h2>
      <p className="secundario exportar-ayuda">
        Movimientos, clientes, visitas, fianzas y préstamos
        {rangoValido ? ` del ${fechaEs(rango.desde)} al ${fechaEs(rango.hasta)}` : ''}.
      </p>
      <div className="exportar-rango">
        <label className="exportar-campo">
          <span>Desde</span>
          <input type="date" value={rango.desde} max={rango.hasta || undefined} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
        </label>
        <label className="exportar-campo">
          <span>Hasta</span>
          <input type="date" value={rango.hasta} min={rango.desde || undefined} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
        </label>
      </div>
      {!rangoValido && (
        <p className="secundario" role="status">
          Elige una fecha de inicio anterior a la final.
        </p>
      )}
      <button
        type="button"
        className="boton-principal tocable exportar-boton"
        disabled={!datos || !rangoValido || ocupado !== null}
        aria-busy={ocupado === 'xlsx'}
        onClick={() => void exportar('xlsx')}
      >
        <Download size={20} aria-hidden="true" />
        {ocupado === 'xlsx' ? 'Preparando…' : 'Exportar a Excel'}
      </button>
      <button
        type="button"
        className="boton-texto tocable exportar-csv"
        disabled={!datos || !rangoValido || ocupado !== null}
        aria-busy={ocupado === 'csv'}
        onClick={() => void exportar('csv')}
      >
        <FileText size={18} aria-hidden="true" />
        {ocupado === 'csv' ? 'Preparando…' : 'Mejor en CSV'}
      </button>
      <p className="secundario exportar-aviso" role="status" aria-live="polite">
        {aviso}
      </p>
    </section>
  );
}
