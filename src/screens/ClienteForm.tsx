import { useId, useMemo, useState, type ReactNode } from 'react';
import { BookUser, ChevronDown, MapPin, X } from 'lucide-react';
import { Dialogo } from '../components/Dialogo';
import { useDeshacer } from '../components/Deshacer';
import { crearCliente, editarCliente, normalizarTelefono, type DatosCliente } from '../db/repo';
import { TIPOS_TRABAJO, type Cliente, type Frecuencia, type Modalidad, type Servicio, type TipoTrabajo } from '../domain/tipos';
import { centimosATexto, formatearMientrasEscribe, parsearImporte } from '../lib/dinero';
import { useCerrojo } from '../lib/hooks';
import '../styles/clientes.css';

// Formulario Nuevo / Editar cliente (§10.4.3). No tiene maqueta: hoja modal a pantalla completa con el estilo
// de la hoja Registrar (PDF p. 2, docs/maqueta.md §1.2 y componentes C9, C14, C16), como SaldoInicial.

type TipoCliente = Cliente['tipo'];

const TIPOS: { id: TipoCliente; nombre: string }[] = [
  { id: 'particular', nombre: 'Particular' },
  { id: 'comunidad', nombre: 'Comunidad' },
  { id: 'empresa', nombre: 'Empresa' },
];
const SERVICIOS: { id: Servicio; nombre: string }[] = [
  { id: 'jardin', nombre: 'Jardín' },
  { id: 'piscina', nombre: 'Piscina' },
];
const MODALIDADES: { id: Modalidad; nombre: string }[] = [
  { id: 'abono', nombre: 'Abono' },
  { id: 'puntual', nombre: 'Puntual' },
];
const FRECUENCIAS: { id: Frecuencia; nombre: string }[] = [
  { id: 'semanal', nombre: 'Semanal' },
  { id: 'quincenal', nombre: 'Quincenal' },
  { id: 'mensual', nombre: 'Mensual' },
  { id: 'personalizada', nombre: 'Personalizada' },
];
// 0 = domingo (como Date.getDay); la semana empieza en lunes.
const DIAS: { id: number; corto: string; largo: string }[] = [
  { id: 1, corto: 'Lun', largo: 'Lunes' },
  { id: 2, corto: 'Mar', largo: 'Martes' },
  { id: 3, corto: 'Mié', largo: 'Miércoles' },
  { id: 4, corto: 'Jue', largo: 'Jueves' },
  { id: 5, corto: 'Vie', largo: 'Viernes' },
  { id: 6, corto: 'Sáb', largo: 'Sábado' },
  { id: 0, corto: 'Dom', largo: 'Domingo' },
];

interface Borrador {
  nombre: string;
  tipo: TipoCliente;
  telefono: string;
  telefono_2: string;
  contacto: string;
  direccion: string;
  municipio: string;
  servicios: Servicio[];
  modalidad: Modalidad | null;
  cuota: string;
  dia_cobro: string;
  frecuencia: Frecuencia | null;
  dias: number[];
  hora: string;
  tipos_trabajo: TipoTrabajo[];
  duracion: string;
  precio: string;
  furgoneta: boolean;
  ayudantes: number;
  notas: string;
}

/** "+34611566779" → "611 566 779"; otros prefijos se dejan como están. */
function telefonoLegible(e164: string | null): string {
  if (!e164) return '';
  const m = /^\+34(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164;
}

function inicial(c?: Cliente): Borrador {
  return {
    nombre: c?.nombre ?? '',
    tipo: c?.tipo ?? 'particular',
    telefono: telefonoLegible(c?.telefono ?? null),
    telefono_2: telefonoLegible(c?.telefono_2 ?? null),
    contacto: c?.contacto ?? '',
    direccion: c?.direccion ?? '',
    municipio: c?.municipio ?? '',
    servicios: c?.servicios ?? [],
    modalidad: c?.modalidad ?? null,
    cuota: c?.cuota_abono ? centimosATexto(c.cuota_abono) : '',
    dia_cobro: String(c?.dia_cobro_abono ?? 1),
    frecuencia: c?.frecuencia_visitas ?? null,
    dias: c?.dias_preferidos ?? [],
    hora: c?.hora_preferida ?? '',
    tipos_trabajo: c?.tipos_trabajo_habituales ?? [],
    duracion: String(c?.duracion_habitual ?? 120),
    precio: c?.precio_habitual ? centimosATexto(c.precio_habitual) : '',
    furgoneta: c?.requiere_vehiculo_por_defecto ?? false,
    ayudantes: c?.ayudantes_por_defecto ?? 0,
    notas: c?.notas ?? '',
  };
}

/** Identificador válido para aria-labelledby (sin espacios ni signos). */
const sinAcentosId = (t: string) => t.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-');

/** Teléfono escrito → E.164; '' si está vacío; null si no es válido. */
const telefonoE164 = (t: string): string | null => (t.trim() ? normalizarTelefono(t) : '');

interface Contacto {
  name?: string[];
  tel?: string[];
}
type SelectorContactos = { select?: (props: string[], opciones?: { multiple?: boolean }) => Promise<Contacto[]> };

function selectorContactos(): SelectorContactos['select'] | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const api = (navigator as Navigator & { contacts?: SelectorContactos }).contacts;
  return typeof api?.select === 'function' ? api.select.bind(api) : undefined;
}

export function ClienteForm({ cliente, onCerrar }: { cliente?: Cliente; onCerrar: (guardado?: Cliente) => void }) {
  const { mostrar } = useDeshacer();
  const cerrojo = useCerrojo(); // evita crear el cliente dos veces con un doble toque
  const id = useId();
  const [original] = useState(() => inicial(cliente));
  const [b, setB] = useState<Borrador>(original);
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [descartar, setDescartar] = useState(false);
  const elegirContacto = useMemo(selectorContactos, []);

  const poner = <K extends keyof Borrador>(clave: K, valor: Borrador[K]) => setB((x) => ({ ...x, [clave]: valor }));
  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const tocar = (clave: string) => setTocados((t) => ({ ...t, [clave]: true }));

  const tel1 = telefonoE164(b.telefono);
  const tel2 = telefonoE164(b.telefono_2);
  const cuota = b.cuota ? parsearImporte(b.cuota) : null;
  const precio = b.precio ? parsearImporte(b.precio) : null;
  const dia = Number(b.dia_cobro);
  const diaValido = Number.isInteger(dia) && dia >= 1 && dia <= 28;
  const duracion = Number(b.duracion);
  const duracionValida = Number.isInteger(duracion) && duracion > 0 && duracion <= 1440;
  const esAbono = b.modalidad === 'abono';

  const valido =
    b.nombre.trim() !== '' &&
    b.servicios.length > 0 &&
    b.modalidad !== null &&
    (!esAbono || (cuota !== null && cuota > 0 && diaValido)) &&
    tel1 !== null &&
    tel2 !== null &&
    (b.precio === '' || precio !== null) &&
    duracionValida;

  const hayCambios = JSON.stringify(b) !== JSON.stringify(original);

  const cerrar = () => (hayCambios ? setDescartar(true) : onCerrar());

  const guardar = async () => {
    if (!valido || !cerrojo.tomar()) return;
    const direccion = b.direccion.trim();
    const municipio = b.municipio.trim();
    // Sin geocodificación en esta ola: si cambia la dirección, las coordenadas antiguas dejan de valer.
    const mismaDireccion = cliente && cliente.direccion === direccion && cliente.municipio === municipio;
    const datos: DatosCliente = {
      nombre: b.nombre.trim(),
      tipo: b.tipo,
      telefono: tel1 || null,
      telefono_2: tel2 || null,
      contacto: b.contacto.trim(),
      direccion,
      municipio,
      lat: mismaDireccion ? cliente.lat : null,
      lon: mismaDireccion ? cliente.lon : null,
      servicios: b.servicios,
      modalidad: b.modalidad!,
      cuota_abono: esAbono ? cuota : null,
      dia_cobro_abono: esAbono ? dia : null,
      frecuencia_visitas: esAbono ? b.frecuencia : null,
      dias_preferidos: esAbono ? [...b.dias].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)) : [],
      hora_preferida: esAbono && b.hora ? b.hora : null,
      duracion_habitual: duracion,
      tipos_trabajo_habituales: b.tipos_trabajo,
      precio_habitual: precio && precio > 0 ? precio : null,
      requiere_vehiculo_por_defecto: b.furgoneta,
      ayudantes_por_defecto: b.ayudantes,
      notas: b.notas.trim(),
      activo: cliente?.activo ?? true,
    };
    try {
      const r = cliente ? await editarCliente(cliente.id, datos) : await crearCliente(datos);
      onCerrar(r.cliente);
      mostrar('Cliente guardado', r.deshacer);
    } catch (e) {
      console.error(e);
      cerrojo.soltar();
      setError('No se pudo guardar. Lo que has escrito sigue aquí; vuelve a intentarlo.');
    }
  };

  const desdeContactos = async () => {
    if (!elegirContacto) return;
    try {
      const [c] = await elegirContacto(['name', 'tel'], { multiple: false });
      if (!c) return;
      const numero = c.tel?.[0];
      const nombre = c.name?.[0];
      setB((x) => ({
        ...x,
        telefono: numero ? telefonoLegible(normalizarTelefono(numero)) || numero : x.telefono,
        nombre: x.nombre.trim() ? x.nombre : (nombre ?? x.nombre),
      }));
      if (numero) tocar('telefono');
    } catch {
      /* el usuario cerró el selector: no pasa nada */
    }
  };

  const campoTexto = (clave: 'nombre' | 'contacto' | 'direccion' | 'municipio', etiqueta: string, extra?: { obligatorio?: boolean; autoComplete?: string }) => (
    <label className="cf-campo">
      <span className="cf-etiqueta">
        {etiqueta}
        {extra?.obligatorio && <span className="cf-obligatorio"> (obligatorio)</span>}
      </span>
      <input
        type="text"
        value={b[clave]}
        autoComplete={extra?.autoComplete ?? 'off'}
        aria-required={extra?.obligatorio || undefined}
        onChange={(e) => poner(clave, e.target.value)}
      />
    </label>
  );

  const campoTelefono = (clave: 'telefono' | 'telefono_2', etiqueta: string, valorE164: string | null) => {
    const malo = valorE164 === null && (tocados[clave] || b[clave].replace(/\D/g, '').length >= 9);
    const idError = `${id}-${clave}-error`;
    return (
      <label className="cf-campo">
        <span className="cf-etiqueta">{etiqueta}</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={b[clave]}
          aria-invalid={malo || undefined}
          aria-describedby={malo ? idError : undefined}
          onChange={(e) => poner(clave, e.target.value)}
          onBlur={() => tocar(clave)}
        />
        {malo && (
          <p className="cf-error" id={idError}>
            Revisa el teléfono
          </p>
        )}
      </label>
    );
  };

  const campoImporte = (clave: 'cuota' | 'precio', etiqueta: string, sufijo: string, obligatorio = false) => (
    <label className="cf-campo">
      <span className="cf-etiqueta">
        {etiqueta}
        {obligatorio && <span className="cf-obligatorio"> (obligatorio)</span>}
      </span>
      <span className="cf-importe">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-required={obligatorio || undefined}
          value={b[clave]}
          onChange={(e) => {
            const n = formatearMientrasEscribe(e.target.value, b[clave]);
            if (n !== null) poner(clave, n);
          }}
        />
        <span className="sufijo" aria-hidden="true">
          {sufijo}
        </span>
      </span>
    </label>
  );

  const grupoChips = <T extends string | number>(
    etiqueta: string,
    opciones: { id: T; nombre: string; largo?: string }[],
    marcado: (v: T) => boolean,
    pulsar: (v: T) => void,
    multiple: boolean,
    clase = '',
  ) => {
    const idEtiqueta = `${id}-${sinAcentosId(etiqueta)}`;
    return (
    <div className="cf-campo">
      <span className="cf-etiqueta" id={idEtiqueta}>
        {etiqueta}
      </span>
      <div className={`cf-chips ${clase}`} role={multiple ? 'group' : 'radiogroup'} aria-labelledby={idEtiqueta}>
        {opciones.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={marcado(o.id)}
            aria-label={o.largo}
            className="chip tocable"
            onClick={() => pulsar(o.id)}
          >
            {o.nombre}
          </button>
        ))}
      </div>
    </div>
    );
  };

  const titulo = cliente ? 'Editar cliente' : 'Nuevo cliente';

  return (
    <div className="capa">
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
        <header className="hoja-cabecera">
          <h1 id={`${id}-titulo`}>{titulo}</h1>
          <button type="button" className="boton-icono tocable" aria-label="Cerrar" onClick={cerrar}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>

        <div className="hoja-cuerpo">
          <Seccion titulo="Contacto">
            {campoTexto('nombre', 'Nombre', { obligatorio: true, autoComplete: 'name' })}
            {grupoChips('Tipo', TIPOS, (v) => b.tipo === v, (v) => poner('tipo', v), false)}
            {campoTelefono('telefono', 'Teléfono', tel1)}
            {elegirContacto && (
              <button type="button" className="boton-texto cf-contactos tocable" onClick={desdeContactos}>
                <BookUser size={18} aria-hidden="true" />
                Elegir de mis contactos
              </button>
            )}
            {campoTelefono('telefono_2', 'Segundo teléfono', tel2)}
            {campoTexto('contacto', 'Persona de contacto')}
            {campoTexto('direccion', 'Dirección', { autoComplete: 'street-address' })}
            {campoTexto('municipio', 'Municipio', { autoComplete: 'address-level2' })}
          </Seccion>

          <Seccion titulo="Ubicación">
            <div className="cf-mapa" role="img" aria-label="Mapa sin conectar">
              <MapPin size={28} aria-hidden="true" />
              <p>Se usa para el tiempo de cada visita.</p>
              <p className="secundario">El mapa con la chincheta llega cuando conectemos el servicio de mapas.</p>
            </div>
          </Seccion>

          <Seccion titulo="Servicio">
            {grupoChips('Servicios (obligatorio)', SERVICIOS, (v) => b.servicios.includes(v), (v) => poner('servicios', alternar(b.servicios, v)), true)}
            {grupoChips('Modalidad (obligatorio)', MODALIDADES, (v) => b.modalidad === v, (v) => poner('modalidad', v), false)}
            {esAbono && (
              <>
                {campoImporte('cuota', 'Cuota', '€/mes', true)}
                <label className="cf-campo">
                  <span className="cf-etiqueta">Día de cobro</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={28}
                    value={b.dia_cobro}
                    aria-invalid={!diaValido || undefined}
                    onChange={(e) => poner('dia_cobro', e.target.value)}
                  />
                  {!diaValido && <p className="cf-error">Elige un día del 1 al 28</p>}
                </label>
                {grupoChips('Frecuencia de visitas', FRECUENCIAS, (v) => b.frecuencia === v, (v) => poner('frecuencia', b.frecuencia === v ? null : v), false)}
                {grupoChips(
                  'Días preferidos',
                  DIAS.map((d) => ({ id: d.id, nombre: d.corto, largo: d.largo })),
                  (v) => b.dias.includes(v),
                  (v) => poner('dias', alternar(b.dias, v)),
                  true,
                  'dias',
                )}
                <label className="cf-campo">
                  <span className="cf-etiqueta">Hora preferida</span>
                  <input type="time" value={b.hora} onChange={(e) => poner('hora', e.target.value)} />
                </label>
              </>
            )}
          </Seccion>

          <Seccion titulo="Trabajo habitual">
            {grupoChips('Tipos de trabajo', TIPOS_TRABAJO, (v) => b.tipos_trabajo.includes(v), (v) => poner('tipos_trabajo', alternar(b.tipos_trabajo, v)), true)}
            <label className="cf-campo">
              <span className="cf-etiqueta">Duración (minutos)</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={15}
                value={b.duracion}
                aria-invalid={!duracionValida || undefined}
                onChange={(e) => poner('duracion', e.target.value)}
              />
              {!duracionValida && <p className="cf-error">Pon los minutos que suele durar</p>}
            </label>
            {campoImporte('precio', 'Precio habitual', '€')}
            <label className="cf-interruptor">
              <span>Necesita furgoneta</span>
              <input type="checkbox" role="switch" checked={b.furgoneta} onChange={(e) => poner('furgoneta', e.target.checked)} />
            </label>
            {grupoChips(
              'Ayudantes',
              [0, 1, 2, 3, 4, 5].map((n) => ({ id: n, nombre: String(n), largo: n === 1 ? '1 ayudante' : `${n} ayudantes` })),
              (v) => b.ayudantes === v,
              (v) => poner('ayudantes', v),
              false,
              'dias',
            )}
          </Seccion>

          <Seccion titulo="Notas">
            <label className="cf-campo">
              <span className="sr-only">Notas</span>
              <textarea
                value={b.notas}
                placeholder="Llaves, perro, lo que no hay que tocar…"
                onChange={(e) => poner('notas', e.target.value)}
              />
            </label>
          </Seccion>

          {error && (
            <p className="aviso-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="hoja-pie">
          <button type="button" className="boton-principal tocable" disabled={!valido || cerrojo.ocupado} onClick={guardar}>
            Guardar cliente
          </button>
        </footer>
      </div>

      {descartar && (
        <Dialogo
          titulo="¿Descartar los cambios?"
          principal="Descartar"
          secundario="Seguir editando"
          onPrincipal={() => onCerrar()}
          onSecundario={() => setDescartar(false)}
        />
      )}
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="cf-seccion" open>
      <summary>
        {titulo}
        <ChevronDown size={20} aria-hidden="true" />
      </summary>
      <div className="cf-cuerpo">{children}</div>
    </details>
  );
}
