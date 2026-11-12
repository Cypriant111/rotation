import type { RankedItem } from '../lib/stats'
import { fmtInt } from '../lib/format'
import { useApp } from '../state/store'
import { Artwork } from './Artwork'
import { RowBar } from './RowBar'

interface Props {
  items: RankedItem[]
  kind: 'artist' | 'track' | 'album'
}

export function RankList({ items, kind }: Props) {
  const { artFor } = useApp()
  if (items.length === 0) return null
  const max = items[0].plays

  return (
    <div className="rank-list">
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
