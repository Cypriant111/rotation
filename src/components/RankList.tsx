import type { RankedItem } from '../lib/stats'
import { albumArtKey } from '../lib/lastfm'
import { fmtInt } from '../lib/format'
import { Artwork } from './Artwork'

interface Props {
  items: RankedItem[]
  kind: 'artist' | 'track' | 'album'
  albumArt: Record<string, string>
}

export function RankList({ items, kind, albumArt }: Props) {
  if (items.length === 0) return null
  const max = items[0].plays

  return (
    <div className="rank-list">
      {items.map((item, i) => {
        const art =
          kind === 'artist'
            ? item.album
              ? albumArt[albumArtKey(item.artist, item.album)]
              : undefined
            : item.album
              ? albumArt[albumArtKey(item.artist, item.album)]
              : undefined
        return (
          <div className="rank-row" key={`${item.name}|${item.sub}`}>
            <div
              className="row-bar"
              style={{ width: `${Math.max(4, (item.plays / max) * 100)}%` }}
            />
            <div className="rank-num">{i + 1}</div>
            <Artwork
              name={item.name}
              url={kind === 'artist' ? undefined : art}
              round={kind === 'artist'}
            />
            <div className="rank-main">
              <div className="rank-name">{item.name}</div>
              {item.sub && <div className="rank-sub">{item.sub}</div>}
            </div>
            <div className="rank-count">
              {fmtInt(item.plays)}
              <span className="unit">plays</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
