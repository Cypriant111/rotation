import { useState } from 'react'
import { initials } from '../lib/format'

/* Muted avatar palette; decoration only, never data encoding */
const MONO_COLORS = [
  '#8e6c88', '#5b7a99', '#6f8f6b', '#a8825f',
  '#7a6f9b', '#5f8f8b', '#9b6b6b', '#6b7f5f',
]

function pick(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return MONO_COLORS[Math.abs(h) % MONO_COLORS.length]
}

interface Props {
  name: string
  url?: string
  round?: boolean
}

export function Artwork({ name, url, round }: Props) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      <img
        className={`artwork${round ? ' round' : ''}`}
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div className={`monogram${round ? ' round' : ''}`} style={{ background: pick(name) }} aria-hidden>
      {initials(name)}
    </div>
  )
}
