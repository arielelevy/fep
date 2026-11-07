import { ChevronLeft } from 'lucide-react';
import { ExportarDatos } from './ExportarDatos';

// Ajustes › Exportar datos (§10.10.9, §15): la misma tarjeta de exportación que va al final de Informes.
export function PantallaExportar({ etiquetaVolver, onVolver }: { etiquetaVolver: string; onVolver: () => void }) {
  return (
    <main className="pantalla" aria-labelledby="titulo-pantalla-exportar">
      <button type="button" className="volver tocable" onClick={onVolver}>
        <ChevronLeft size={20} aria-hidden="true" />
        {etiquetaVolver}
      </button>
      <h1 className="titulo-pantalla" id="titulo-pantalla-exportar">
        Exportar datos
      </h1>
      <p className="secundario" style={{ margin: '2px 0 12px' }}>
        Movimientos, clientes, visitas, fianzas y préstamos, para abrir en Excel.
      </p>
      <ExportarDatos titulo="Elige las fechas" />
    </main>
  );
}
