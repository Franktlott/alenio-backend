export const SENECA_ICON = "/seneca-icon.png";

/** Public asset ratio (174×276). `size` is the rendered height. */
const SENECA_LOGO_ASPECT = 174 / 276;

type IconProps = {
  size?: number;
  className?: string;
};

export function SenecaIcon({ size = 20, className }: IconProps) {
  const height = size;
  const width = Math.round(size * SENECA_LOGO_ASPECT);

  return (
    <img
      src={SENECA_ICON}
      alt=""
      width={width}
      height={height}
      className={className ? `seneca-icon ${className}` : "seneca-icon"}
      aria-hidden
    />
  );
}

export function SenecaDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`seneca-disclaimer${compact ? " seneca-disclaimer--compact" : ""}`}>
      {compact ? "Review before saving." : "Seneca can suggest coaching language. Review before saving."}
    </p>
  );
}

export function SenecaBrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`seneca-brand${compact ? " seneca-brand--compact" : ""}`}>
      <SenecaIcon size={compact ? 18 : 20} />
      {!compact ? "Seneca" : null}
    </span>
  );
}
