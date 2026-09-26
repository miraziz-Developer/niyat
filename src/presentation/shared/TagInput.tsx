import { useId, useState, type KeyboardEvent } from 'react'

type TagInputProps = {
  label: string
  hint: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder: string
  max?: number
  tone?: 'accent' | 'warm'
}

/** Chip input: Enter or comma commits a tag, Backspace on an empty field removes the last one, paste splits on commas. */
export function TagInput({ label, hint, values, onChange, placeholder, max = 8, tone = 'accent' }: TagInputProps) {
  const id = useId()
  const [text, setText] = useState('')
  const full = values.length >= max

  function commit(raw: string) {
    const additions = raw.split(',').map(item => item.trim()).filter(Boolean)
    const next = [...values]
    for (const item of additions) {
      if (next.length >= max) break
      if (item.length <= 80 && !next.some(existing => existing.toLocaleLowerCase() === item.toLocaleLowerCase())) next.push(item)
    }
    if (next.length !== values.length) onChange(next)
    setText('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === 'Enter' || event.key === ',') && text.trim()) {
      event.preventDefault()
      commit(text)
    } else if (event.key === 'Enter') {
      event.preventDefault()
    } else if (event.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}<small>{hint}</small></label>
      <div className="tag-input" onClick={() => document.getElementById(id)?.focus()}>
        {values.map(value => (
          <span className={`chip${tone === 'warm' ? ' warm' : ''}`} key={value}>
            {value}
            <button type="button" aria-label={`${value} ni olib tashlash`} onClick={() => onChange(values.filter(item => item !== value))}>×</button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          disabled={full}
          placeholder={full ? `Ko‘pi bilan ${max} ta` : values.length ? 'Yana qo‘shish…' : placeholder}
          onChange={event => event.target.value.includes(',') ? commit(event.target.value) : setText(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && commit(text)}
          aria-describedby={`${id}-hint`}
        />
      </div>
      <p className="field-hint" id={`${id}-hint`}>Enter yoki vergul bilan qo‘shing · {values.length}/{max}</p>
    </div>
  )
}
