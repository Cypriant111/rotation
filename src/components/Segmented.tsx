interface Props<T extends string> {
  options: { value: T; label: string }[]
  /** a value outside `options` (e.g. '') shows no segment selected */
  value: T | ''
  onChange: (v: T) => void
}

/** Equal-width segments with one highlight that slides between them. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const idx = options.findIndex((o) => o.value === value)
  return (
    <div className="segmented" role="group">
      {idx >= 0 && (
        <span
          className="segmented-thumb"
          aria-hidden
          style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
        />
      )}
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="chips" role="group">
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
