import type { ReactNode } from 'react'
import { fmtCompact } from '../lib/format'
import { RowBar } from './RowBar'

interface Props {
  /** rank number; omitted on plain rows (Recent) */
  num?: number
  art: ReactNode
  name: string
  sub?: string
  /** 0..1 against the first row; omitted = no bar */
  ratio?: number
  /** the big figure on the right */
  count?: number
  unit?: string
  /** the figure is context, not the ranking: shown small and grey */
  quiet?: boolean
  /** quiet text on the right instead of a figure ("4h ago") */
  aside?: string
  /** makes the row a link (Mixes rows open the song in the music app) */
  href?: string
  label?: string
}

/**
 * The one list row used on every screen: number, artwork, name (with an
 * optional second line and bar), and a figure or a quiet note on the right.
 * The hairline between rows starts after the artwork.
 */
export function Row({ num, art, name, sub, ratio, count, unit, quiet, aside, href, label }: Props) {
  const inner = (
    <>
      {num !== undefined && <div className="row-num">{num}</div>}
      {art}
      <div className="row-main">
        <div className="row-text">
          <div className="row-name">{name}</div>
          {sub && <div className="row-sub">{sub}</div>}
          {ratio !== undefined && <RowBar ratio={ratio} />}
        </div>
        {count !== undefined && (
          <div className={`row-count${quiet ? ' quiet' : ''}`}>
            <div className="row-figure">{fmtCompact(count)}</div>
            {unit && <div className="row-unit">{unit}</div>}
          </div>
        )}
        {aside && <div className="row-aside">{aside}</div>}
      </div>
    </>
  )
  return href ? (
    <a className="row" href={href} target="_blank" rel="noreferrer" aria-label={label}>
      {inner}
    </a>
  ) : (
    <div className="row">{inner}</div>
  )
}
