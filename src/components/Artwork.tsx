import { useState } from 'react'
import { initials } from '../lib/format'

interface Props {
  name: string
  url?: string
  round?: boolean
}

/** A cover, or a neutral tile with initials when there is none. */
export function Artwork({ name, url, round }: Props) {
  const [failedUrl, setFailedUrl] = useState('')
  if (url && url !== failedUrl) {
    return (
      <img
        className={`artwork${round ? ' round' : ''}`}
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailedUrl(url)}
      />
    )
  }
  return (
    <div className={`monogram${round ? ' round' : ''}`} aria-hidden>
      {initials(name)}
    </div>
  )
}
