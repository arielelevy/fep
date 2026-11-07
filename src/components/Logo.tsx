// Logo F de FERGO (mismas formas que los iconos de la PWA, scripts/generar-iconos.mjs).
export function Logo({ tam = 36 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 100 100" aria-hidden="true">
      <g fill="#12391F">
        <rect x="26" y="20" width="50" height="14" rx="7" />
        <rect x="26" y="20" width="14" height="62" rx="7" />
        <rect x="26" y="44" width="34" height="13" rx="6.5" />
      </g>
      <ellipse cx="64" cy="71" rx="15" ry="8" transform="rotate(-35 64 71)" fill="#1F5A30" />
    </svg>
  );
}
