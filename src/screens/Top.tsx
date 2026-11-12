import { useMemo, useRef, useState } from 'react'
import { useFadeOnChange } from '../lib/motion'
import { useApp } from '../state/store'
import type { PeriodKey } from '../lib/stats'
import { PERIODS, periodStart, playsIn, topAlbums, topArtists, topTracks } from '../lib/stats'
import { RankList } from '../components/RankList'
import { Chips, Segmented } from '../components/Segmented'

type Kind = 'artists' | 'tracks' | 'albums'

export function Top() {
  const { plays, durations, artists } = useApp()
  const [kind, setKind] = useState<Kind>('artists')
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const listRef = useRef<HTMLDivElement>(null)
  useFadeOnChange(listRef, `${kind}|${period}`)

  const periodPlays = useMemo(() => playsIn(plays, periodStart(period)), [plays, period])

  const items = useMemo(() => {
    if (kind === 'artists') return topArtists(periodPlays, durations, 50, artists)
    if (kind === 'tracks') return topTracks(periodPlays, durations, 50, artists)
    return topAlbums(periodPlays, durations, 50, artists)
  }, [kind, periodPlays, durations, artists])

  return (
    <>
      <header className="screen-header">
        <h1>Top</h1>
      </header>
      <main>
        <Segmented
          options={[
            { value: 'artists', label: 'Artists' },
            { value: 'tracks', label: 'Songs' },
            { value: 'albums', label: 'Albums' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Chips
          options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
          value={period}
          onChange={setPeriod}
        />
        <div ref={listRef}>
          {items.length === 0 ? (
            <div className="empty">
              <p>Nothing in this period yet.</p>
            </div>
          ) : (
            <div className="card">
              <RankList
                items={items}
                kind={kind === 'artists' ? 'artist' : kind === 'tracks' ? 'track' : 'album'}
                animateKey={`${kind}|${period}`}
              />
            </div>
          )}
        </div>
      </main>
    </>
  )
}
