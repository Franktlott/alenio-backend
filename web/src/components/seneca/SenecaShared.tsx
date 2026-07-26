export const SENECA_ICON = "/seneca-icon.png";

/** Enterprise Seneca mark is a square disc (1:1). `size` is width and height. */
type IconProps = {
  size?: number;
  className?: string;
};

export function SenecaIcon({ size = 20, className }: IconProps) {
  return (
    <img
      src={SENECA_ICON}
      alt=""
      width={size}
      height={size}
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
