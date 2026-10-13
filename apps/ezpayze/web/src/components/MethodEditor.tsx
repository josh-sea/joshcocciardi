// "How do you like to get paid?" Big toggle tiles, then one simple field per
// chosen method with an example and a "Where do I find this?" helper.

import { useId } from 'react';
import { METHOD_CATALOG, normalizeMethodValue } from '@shared/methods';
import type { CheckDetails, PaymentMethod, PaymentMethodType } from '@shared/types';

export interface MethodDraft {
  on: boolean;
  value: string;
  payableTo: string;
  address: string;
}
export type Drafts = Record<PaymentMethodType, MethodDraft>;

export function draftsFromMethods(methods: PaymentMethod[]): Drafts {
  const out = {} as Drafts;
  for (const info of METHOD_CATALOG) {
    const m = methods.find((x) => x.type === info.type);
    const check = (m?.value ?? {}) as CheckDetails;
    out[info.type] = {
      on: !!m && m.enabled !== false,
      value: typeof m?.value === 'string' ? m.value : '',
      payableTo: check.payableTo ?? '',
      address: check.address ?? '',
    };
  }
  return out;
}

export function methodsFromDrafts(drafts: Drafts, otherLabel = 'Other'): { methods: PaymentMethod[] } | { errors: Partial<Record<PaymentMethodType, string>> } {
  const methods: PaymentMethod[] = [];
  const errors: Partial<Record<PaymentMethodType, string>> = {};
  for (const info of METHOD_CATALOG) {
    const d = drafts[info.type];
    if (!d?.on) continue;
    const raw = info.kind === 'check' ? { payableTo: d.payableTo, address: d.address } : d.value;
    const res = normalizeMethodValue(info.type, raw);
    if ('error' in res) errors[info.type] = res.error;
    else methods.push({ type: info.type, label: info.type === 'other' ? otherLabel : info.label, value: res.value, enabled: true });
  }
  if (!methods.length && !Object.keys(errors).length) return { errors: { other: 'Pick at least one way to get paid.' } };
  return Object.keys(errors).length ? { errors } : { methods };
}

export function MethodEditor({ drafts, onChange, errors, defaultType, onDefaultChange }: {
  drafts: Drafts;
  onChange: (d: Drafts) => void;
  errors: Partial<Record<PaymentMethodType, string>>;
  defaultType: string | null;
  onDefaultChange: (t: string) => void;
}) {
  const base = useId();
  const set = (type: PaymentMethodType, patch: Partial<MethodDraft>) => onChange({ ...drafts, [type]: { ...drafts[type], ...patch } });
  const chosen = METHOD_CATALOG.filter((m) => drafts[m.type]?.on);

  return (
    <div>
      <fieldset>
        <legend>Tap every way you accept money</legend>
        <div className="tiles">
          {METHOD_CATALOG.map((m) => (
            <div className="tile" key={m.type}>
              <input
                type="checkbox"
                id={`${base}-${m.type}`}
                checked={drafts[m.type]?.on ?? false}
                onChange={(e) => set(m.type, { on: e.target.checked })}
              />
              <label htmlFor={`${base}-${m.type}`}>
                <span className="box" aria-hidden="true" />
                {m.label}
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      {chosen.map((m) => {
        const id = `${base}-${m.type}-value`;
        const err = errors[m.type];
        const d = drafts[m.type];
        return (
          <div className="card tint" key={m.type}>
            <h3>{m.label}</h3>
            {m.kind === 'check' ? (
              <>
                <div className="field">
                  <label htmlFor={`${id}-to`}>Make checks out to</label>
                  <p className="hint" id={`${id}-to-hint`}>Example: Smith Plumbing LLC</p>
                  <input id={`${id}-to`} type="text" value={d.payableTo} aria-describedby={`${id}-to-hint`} aria-invalid={err && !d.payableTo ? true : undefined} onChange={(e) => set(m.type, { payableTo: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`${id}-addr`}>Mail checks to</label>
                  <p className="hint" id={`${id}-addr-hint`}>Example: 12 Main St, Springfield, NY 10001</p>
                  <textarea id={`${id}-addr`} rows={3} style={{ minHeight: 110 }} value={d.address} aria-describedby={`${id}-addr-hint`} aria-invalid={err && !d.address ? true : undefined} onChange={(e) => set(m.type, { address: e.target.value })} />
                </div>
              </>
            ) : (
              <div className="field">
                <label htmlFor={id}>{m.ask}</label>
                <p className="hint" id={`${id}-hint`}>Example: {m.example}</p>
                <input
                  id={id}
                  type="text"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={d.value}
                  aria-describedby={`${id}-hint${err ? ` ${id}-err` : ''}`}
                  aria-invalid={err ? true : undefined}
                  onChange={(e) => set(m.type, { value: e.target.value })}
                />
              </div>
            )}
            {err && <p className="error-text" id={`${id}-err`}>{err}</p>}
            <details className="help">
              <summary>Where do I find this?</summary>
              <p>
                {m.help}
                {m.setupGuide && (
                  <>
                    {' '}Don't have one yet?{' '}
                    <a href={m.setupGuide} target="_blank" rel="noreferrer">Here's how to set one up (opens a new tab)</a>.
                    It goes straight to you. EzPayze never holds your money.
                  </>
                )}
              </p>
            </details>
          </div>
        );
      })}
      {errors.other && !drafts.other?.on && <p className="error-text" role="alert">{errors.other}</p>}

      {chosen.length > 1 && (
        <fieldset>
          <legend>Which one should we show first?</legend>
          <div className="tiles stack">
            {chosen.map((m) => (
              <div className="tile" key={m.type}>
                <input type="radio" name={`${base}-default`} id={`${base}-def-${m.type}`} checked={defaultType === m.type} onChange={() => onDefaultChange(m.type)} />
                <label htmlFor={`${base}-def-${m.type}`}>
                  <span className="box" aria-hidden="true" />
                  {m.label}
                </label>
              </div>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
