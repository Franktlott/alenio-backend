import { ChevronDown, Search, X } from "lucide-react";
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={`al-textarea${invalid ? " is-invalid" : ""}${className ? ` ${className}` : ""}`}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  invalid?: boolean;
};

/**
 * Label + one control + helper / error / character count. The single child
 * receives the id and aria wiring; pass `count` and `max` to show a counter.
 */
export function Field({
  label,
  required = false,
  optional = false,
  helper,
  error,
  count,
  max,
  className,
  htmlFor,
  children,
}: {
  label?: ReactNode;
  required?: boolean;
  optional?: boolean;
  helper?: ReactNode;
  error?: ReactNode;
  count?: number;
  max?: number;
  className?: string;
  /** Use when the child manages its own id (e.g. a composite control). */
  htmlFor?: string;
  children: ReactNode;
}) {
  const autoId = useId();
  const child = Children.only(children);
  const childId = isValidElement<FieldControlProps>(child) ? child.props.id : undefined;
  const id = htmlFor ?? childId ?? `${autoId}-control`;
  const helpId = `${autoId}-help`;
  const showFoot = Boolean(error || helper || max !== undefined);
  const control =
    isValidElement<FieldControlProps>(child) && !htmlFor
      ? cloneElement(child as ReactElement<FieldControlProps>, {
          id,
          "aria-describedby": showFoot ? helpId : undefined,
          "aria-required": required || undefined,
          ...(error ? { invalid: true } : {}),
        })
      : child;
  return (
    <div className={`al-field${className ? ` ${className}` : ""}`}>
      {label ? (
        <label className="al-field-label" htmlFor={id}>
          {label}
          {required ? (
            <span className="al-field-req" aria-hidden>
              *
            </span>
          ) : null}
          {optional ? <span className="al-field-optional">Optional</span> : null}
        </label>
      ) : null}
      {control}
      {showFoot ? (
        <div className="al-field-foot" id={helpId}>
          {error ? (
            <span className="al-field-error" role="alert">
              {error}
            </span>
          ) : helper ? (
            <span>{helper}</span>
          ) : null}
          {max !== undefined ? (
            <span className={`al-field-count${(count ?? 0) > max ? " is-over" : ""}`}>
              {count ?? 0}/{max}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`al-input${invalid ? " is-invalid" : ""}${className ? ` ${className}` : ""}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  label,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label className={`al-search${className ? ` ${className}` : ""}`}>
      <Search size={16} strokeWidth={2} aria-hidden className="al-search-icon" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {value ? (
        <button type="button" className="al-search-clear" aria-label="Clear search" onClick={() => onChange("")}>
          <X size={14} strokeWidth={2.2} />
        </button>
      ) : null}
    </label>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, children, invalid, ...rest },
  ref,
) {
  return (
    <span className={`al-select${invalid ? " is-invalid" : ""}${className ? ` ${className}` : ""}`}>
      <select ref={ref} aria-invalid={invalid || undefined} {...rest}>
        {children}
      </select>
      <ChevronDown size={16} strokeWidth={2} aria-hidden className="al-select-icon" />
    </span>
  );
});
