import type { FieldDef } from '../lib/applicationForms';
import { FieldTag } from './Applications';

export const fieldId = (id: string) => `f-${id}`;

/** One labeled form control (text, email, link, choice or long answer) with help, counter and error text. */
export function Field({ f, value, error, onChange, onBlur }: { f: FieldDef; value: string; error?: string; onChange: (v: string) => void; onBlur: () => void }) {
  const id = fieldId(f.id);
  const describedBy = [f.help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    value,
    onBlur,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': f.required || undefined,
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-ink">
        {f.official && <span className="mr-1.5 rounded bg-[#eef6fb] px-1.5 py-0.5 text-xs text-link">From the official application</span>}
        {f.label} <FieldTag required={f.required} />
      </label>
      {f.kind === 'textarea' ? (
        <textarea {...common} rows={(f.max ?? 0) >= 1000 ? 6 : 4} maxLength={f.max} onChange={(e) => onChange(e.target.value)} className="input resize-y" />
      ) : f.kind === 'select' ? (
        <select {...common} onChange={(e) => onChange(e.target.value)} className="input">
          <option value="">Choose…</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={f.kind === 'email' ? 'email' : f.kind === 'url' ? 'url' : 'text'}
          inputMode={f.kind === 'url' ? 'url' : f.kind === 'email' ? 'email' : undefined}
          autoComplete={f.autoComplete ?? 'off'}
          placeholder={f.placeholder}
          maxLength={f.max}
          onChange={(e) => onChange(e.target.value)}
          className="input"
        />
      )}
      <div className="mt-1 flex gap-3 text-xs text-ink-soft">
        {f.help && <span id={`${id}-help`}>{f.help}</span>}
        {f.kind === 'textarea' && f.max && (
          <span className="ml-auto shrink-0 tabular-nums" aria-hidden>
            {value.length}/{f.max}
          </span>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-bold text-badge">
          {error}
        </p>
      )}
    </div>
  );
}
