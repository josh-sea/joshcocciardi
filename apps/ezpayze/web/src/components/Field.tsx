import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

/** A labeled input. The label is always visible; hints never live in placeholders. */
export function Field({ label, hint, error, id, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errId = error ? `${inputId}-err` : undefined;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {hint && <p className="hint" id={hintId}>{hint}</p>}
      <input
        id={inputId}
        aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error && <p className="error-text" id={errId}>{error}</p>}
    </div>
  );
}

export function MoneyField({ label, hint, error, value, onChange, id }: {
  label: string; hint?: ReactNode; error?: string | null; value: string; onChange: (v: string) => void; id?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errId = error ? `${inputId}-err` : undefined;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {hint && <p className="hint" id={hintId}>{hint}</p>}
      <div className="money-input">
        <span aria-hidden="true">$</span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error && <p className="error-text" id={errId}>{error}</p>}
    </div>
  );
}
