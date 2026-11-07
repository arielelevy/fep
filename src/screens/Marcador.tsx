import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

// Pantallas fuera de esta ola (Clientes, Agenda, Alertas, Ajustes, Informes): marcador con el estilo
// de la maqueta (título de pantalla 26 pt, tarjeta blanca, estado Vacío). Sin lógica.
export function Marcador({
  titulo,
  subtitulo,
  vacio,
  texto,
  volver,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  vacio: string;
  texto: string;
  volver?: { etiqueta: string; onVolver: () => void };
  children?: ReactNode;
}) {
  return (
    <main className="pantalla" aria-labelledby="titulo-marcador">
      {volver && (
        <button type="button" className="volver tocable" onClick={volver.onVolver}>
          <ChevronLeft size={20} aria-hidden="true" />
          {volver.etiqueta}
        </button>
      )}
      <h1 className="titulo-pantalla" id="titulo-marcador">
        {titulo}
      </h1>
      {subtitulo && <p className="secundario" style={{ margin: '2px 0 0' }}>{subtitulo}</p>}
      <div className="tarjeta tarjeta-vacia marcador">
        <p className="titulo">{vacio}</p>
        <p className="secundario" style={{ margin: 0 }}>
          {texto}
        </p>
      </div>
      {children}
    </main>
  );
}
