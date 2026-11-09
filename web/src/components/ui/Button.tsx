import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, iconOnly = false, className, children, disabled, type = "button", ...rest },
  ref,
) {
  const cls = [
    "al-btn",
    `al-btn--${variant}`,
    `al-btn--${size}`,
    iconOnly ? "al-btn--icon" : "",
    loading ? "is-loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? (
        <Loader2 className="al-btn-spin" size={16} strokeWidth={2.2} aria-hidden />
      ) : icon ? (
        <span className="al-btn-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      {iconOnly ? null : children}
    </button>
  );
});
