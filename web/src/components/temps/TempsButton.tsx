import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "icon";

type Common = {
  variant?: Variant;
  children: ReactNode;
  className?: string;
};

type ButtonProps = Common &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    to?: undefined;
  };

type LinkButtonProps = Common &
  Omit<LinkProps, "className" | "children"> & {
    to: string;
    disabled?: boolean;
  };

function variantClass(variant: Variant) {
  return `temps-btn temps-btn--${variant}`;
}

export function TempsButton(props: ButtonProps | LinkButtonProps) {
  const { variant = "secondary", className, children, ...rest } = props;
  const cls = [variantClass(variant), className].filter(Boolean).join(" ");

  if ("to" in rest && rest.to) {
    const { to, disabled, ...linkRest } = rest;
    if (disabled) {
      return (
        <span className={`${cls} is-disabled`} aria-disabled>
          {children}
        </span>
      );
    }
    return (
      <Link to={to} className={cls} {...linkRest}>
        {children}
      </Link>
    );
  }

  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={cls} {...buttonRest}>
      {children}
    </button>
  );
}
