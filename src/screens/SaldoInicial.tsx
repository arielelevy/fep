import { useState } from 'react';
import { X } from 'lucide-react';
import { useDeshacer } from '../components/Deshacer';
import { guardarSaldoInicial } from '../db/repo';
import { formatearMientrasEscribe, parsearImporte } from '../lib/dinero';

// Saldo inicial (§9.3), paso 1 de la bienvenida de primer uso (§10.1.3).
// Construido con el estilo de la hoja Registrar (PDF p. 2): cabecera con cerrar, filas blancas, botón lima.
export function SaldoInicial({ onCerrar }: { onCerrar: () => void }) {
  const { mostrar } = useDeshacer();
  const [efectivo, setEfectivo] = useState('');
  const [banco, setBanco] = useState('');
  const [error, setError] = useState('');

  const cEfectivo = efectivo ? parsearImporte(efectivo) : 0;
  const cBanco = banco ? parsearImporte(banco) : 0;
  const valido = cEfectivo !== null && cBanco !== null && (efectivo !== '' || banco !== '');

  const guardar = async () => {
    if (!valido) return;
    try {
      const r = await guardarSaldoInicial(cEfectivo ?? 0, cBanco ?? 0);
      onCerrar();
      mostrar('Saldo guardado', r.deshacer);
    } catch (e) {
      console.error(e);
      setError('No se pudo guardar. Lo que has escrito sigue aquí; vuelve a intentarlo.');
    }
  };

  const campo = (id: string, etiqueta: string, valor: string, set: (v: string) => void, foco = false) => (
    <label className="fila" htmlFor={id}>
      <span className="nombre">{etiqueta}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={foco}
        placeholder="0 €"
        value={valor}
        onChange={(e) => {
          const n = formatearMientrasEscribe(e.target.value, valor);
          if (n !== null) set(n);
        }}
        style={{ fontWeight: 700, fontSize: '1.125rem' }}
      />
      {valor && <span aria-hidden="true" style={{ fontWeight: 700 }}>€</span>}
    </label>
  );

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby="titulo-saldo">
        <header className="hoja-cabecera">
          <h1 id="titulo-saldo">Tu dinero actual</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={onCerrar}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className="hoja-cuerpo">
          <p style={{ margin: '4px 2px 0', fontWeight: 600, fontSize: '1.0625rem' }}>¿Cuánto dinero del negocio tienes ahora?</p>
          <div className="filas">
            {campo('saldo-efectivo', 'Efectivo', efectivo, setEfectivo, true)}
            {campo('saldo-banco', 'Banco', banco, setBanco)}
          </div>
          <p className="texto-aclaratorio neutro">Es tu punto de partida. Cuenta en “En caja” pero no como ganancia.</p>
          {error && (
            <p className="aviso-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="hoja-pie">
          <button type="button" className="boton-principal tocable" disabled={!valido} onClick={guardar}>
            Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}
