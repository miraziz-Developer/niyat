import { useId } from 'react'

type Option<T extends string> = { value: T; label: string }

/** Native radio group styled as a segmented control, so arrow keys and screen readers work without extra code. */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Option<T>[]; onChange: (value: T) => void }) {
  const name = useId()
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label" style={{ marginBottom: 9 }}>{label}</legend>
      <div className="segmented">
        {options.map(option => (
          <label key={option.value}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
