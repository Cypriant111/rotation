import type { RankedItem } from '../lib/stats'
import { fmtInt } from '../lib/format'
import { useApp } from '../state/store'
import { Artwork } from './Artwork'
import { RowBar } from './RowBar'
import { useRef } from 'react'
import { useGrowOnShow } from '../lib/motion'

interface Props {
  items: RankedItem[]
  kind: 'artist' | 'track' | 'album'
  /** bars grow from zero when this changes (and on first show) */
  animateKey?: unknown
}

export function RankList({ items, kind, animateKey }: Props) {
  const { artFor } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  useGrowOnShow(ref, '.row-bar', animateKey, 'scaleX(0)')
  if (items.length === 0) return null
  const max = items[0].plays

  return (
    <div className="rank-list" ref={ref}>
      {items.map((item, i) => (
        <div className="rank-row" key={`${item.name}|${item.sub}`}>
          <div className="row-body">
            <RowBar ratio={item.plays / max} />
            <div className="rank-num">{i + 1}</div>
            <Artwork
              name={item.name}
              url={
                kind === 'artist'
                  ? undefined
                  : artFor(item.artist, item.album, kind === 'track' ? item.name : undefined)
              }
              round={kind === 'artist'}
            />
            <div className="rank-main">
              <div className="rank-name">{item.name}</div>
              {item.sub && <div className="rank-sub">{item.sub}</div>}
            </div>
          </div>
          <div className="rank-count">
            {fmtInt(item.plays)}
            <span className="unit">plays</span>
          </div>
        </div>
      ))}
    </div>
  )
}
