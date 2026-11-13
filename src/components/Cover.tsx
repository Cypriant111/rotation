import { useEffect, useRef } from 'react'
import { useApp } from '../state/store'
import type { CoverKind } from '../lib/covers'
import { Artwork } from './Artwork'

interface Props {
  kind: CoverKind
  /** what the monogram is made from when there is no picture */
  name: string
  artist: string
  album?: string
  track?: string
}

/**
 * Artwork for a row. If nothing is known yet, the cover is looked up once the
 * row is actually on screen (hidden tabs and rows far down the list wait).
 */
export function Cover({ kind, name, artist, album = '', track }: Props) {
  const { coverFor, wantCover, coverVersion } = useApp()
  const url = coverFor(kind, artist, album, track)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (url) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      wantCover(kind, artist, album, track)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) wantCover(kind, artist, album, track)
      },
      { rootMargin: '160px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // coverVersion: after a miss, an artist tile asks for its next song
  }, [url, kind, artist, album, track, wantCover, coverVersion])

  return (
    <span className="cover" ref={ref}>
      <Artwork name={name} url={url} round={kind === 'artist'} />
    </span>
  )
}
