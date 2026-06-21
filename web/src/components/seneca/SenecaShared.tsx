export const SENECA_ICON = "/seneca-icon.png";

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

export function SenecaDisclaimer() {
  return (
    <p className="seneca-disclaimer">
      Seneca can suggest coaching language. Review before saving.
    </p>
  );
}

export function SenecaBrandMark() {
  return (
    <span className="seneca-brand">
      <SenecaIcon size={20} />
      Seneca
    </span>
  );
}
