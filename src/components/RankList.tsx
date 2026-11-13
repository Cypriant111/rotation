import { useRef } from 'react'
import type { RankedItem } from '../lib/stats'
import { useGrowOnShow } from '../lib/motion'
import { Cover } from './Cover'
import { Row } from './Row'

interface Props {
  items: RankedItem[]
  kind: 'artist' | 'track' | 'album'
  unit?: string
  /** bars grow from zero when this changes (and on first show) */
  animateKey?: unknown
}

export function RankList({ items, kind, unit = 'plays', animateKey }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useGrowOnShow(ref, '.row-bar', animateKey, 'scaleX(0)')
  if (items.length === 0) return null
  const max = items[0].plays

  return (
    <div className="list" ref={ref}>
      {items.map((item, i) => (
        <Row
          key={`${item.name}|${item.sub}`}
          num={i + 1}
          art={
            <Cover
              kind={kind}
              name={item.name}
              artist={item.artist}
              album={item.album}
              track={kind === 'track' ? item.name : undefined}
            />
          }
          name={item.name}
          sub={item.sub || undefined}
          ratio={item.plays / max}
          count={item.plays}
          unit={unit}
        />
      ))}
    </div>
  )
}
