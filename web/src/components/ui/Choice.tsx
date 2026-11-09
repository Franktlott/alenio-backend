import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  description?: ReactNode;
};

function ChoiceInput({ kind, label, description, className, id, ...rest }: ChoiceProps & { kind: "checkbox" | "radio" }, ref: Ref<HTMLInputElement>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const input = <input ref={ref} id={inputId} type={kind} className={`al-${kind === "checkbox" ? "check" : "radio"}`} {...rest} />;
  if (!label) return input;
  return (
    <label className={`al-choice${rest.disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`} htmlFor={inputId}>
      {input}
      <span className="al-choice-text">
        <span className="al-choice-label">{label}</span>
        {description ? <span className="al-choice-desc">{description}</span> : null}
      </span>
    </label>
  );
}

export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(function Checkbox(props, ref) {
  return ChoiceInput({ ...props, kind: "checkbox" }, ref);
});

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(function Radio(props, ref) {
  return ChoiceInput({ ...props, kind: "radio" }, ref);
});

export type RadioOption<V extends string> = { value: V; label: ReactNode; description?: ReactNode; disabled?: boolean };

export function RadioGroup<V extends string>({
  label,
  name,
  value,
  onChange,
  options,
  inline = false,
}: {
  label?: ReactNode;
  name: string;
  value: V;
  onChange: (value: V) => void;
  options: RadioOption<V>[];
  inline?: boolean;
}) {
  return (
    <fieldset className={`al-radio-group${inline ? " al-radio-group--inline" : ""}`}>
      {label ? <legend className="al-field-label">{label}</legend> : null}
      {options.map((o) => (
        <Radio
          key={o.value}
          name={name}
          value={o.value}
          checked={value === o.value}
          disabled={o.disabled}
          onChange={() => onChange(o.value)}
          label={o.label}
          description={o.description}
        />
      ))}
    </fieldset>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  testId?: string;
}) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const button = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`al-switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
      data-testid={testId}
    >
      <span className="al-switch-thumb" aria-hidden />
    </button>
  );
  if (!label) return button;
  return (
    <div className={`al-choice al-choice--switch${disabled ? " is-disabled" : ""}`}>
      <span className="al-choice-text">
        <label className="al-choice-label" htmlFor={switchId}>
          {label}
        </label>
        {description ? <span className="al-choice-desc">{description}</span> : null}
      </span>
      {button}
    </div>
  );
}
