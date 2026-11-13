import { useMemo, useRef, useState } from 'react'
import { useFadeOnChange } from '../lib/motion'
import { useApp } from '../state/store'
import { daySeries, periodStart, playsIn, totals } from '../lib/stats'
import { fmtAgo, fmtInt, msToMin } from '../lib/format'
import { BarChart } from '../components/BarChart'
import { Segmented } from '../components/Segmented'
import { Cover } from '../components/Cover'
import { Row } from '../components/Row'
import { FirstRun } from '../components/FirstRun'

type HomePeriod = '7d' | '30d'

export function Home({ goToSettings }: { goToSettings: () => void }) {
  const { plays, durations, artists, sync, syncNow, settings } = useApp()
  const [period, setPeriod] = useState<HomePeriod>('7d')
  const periodRef = useRef<HTMLDivElement>(null)
  useFadeOnChange(periodRef, period)

  const from = periodStart(period)
  const periodPlays = useMemo(() => playsIn(plays, from), [plays, from])
  const t = useMemo(() => totals(periodPlays, durations, artists), [periodPlays, durations, artists])
  const series = useMemo(() => daySeries(periodPlays, from, durations), [periodPlays, from, durations])
  const recent = useMemo(() => plays.filter((p) => !p.skip).slice(0, 10), [plays])

  const hasAnything = plays.length > 0
  const connected = Boolean(settings.lastfmUser)

  return (
    <>
      <header className="screen-header">
        <h1>Rotation</h1>
        <div className={`header-status${sync.state === 'error' ? ' error' : ''}`}>
          {sync.state === 'syncing' ? (
            <>
              <span className="spin" />
              {sync.fetched > 0 ? `${fmtInt(sync.fetched)} plays` : 'syncing'}
            </>
          ) : sync.state === 'error' ? (
            <button onClick={syncNow}>Sync failed — retry</button>
          ) : connected && sync.lastSyncAt ? (
            `synced ${fmtAgo(sync.lastSyncAt)}`
          ) : null}
        </div>
      </header>
      <main>
        {!hasAnything ? (
          <FirstRun goToSettings={goToSettings} />
        ) : (
          <>
            <Segmented
              options={[
                { value: '7d', label: 'Last 7 days' },
                { value: '30d', label: 'Last 30 days' },
              ]}
              value={period}
              onChange={setPeriod}
            />
            <div ref={periodRef} className="stack">
              <div className="hero">
                <div className="hero-line">
                  <span className="hero-num underlined">{fmtInt(msToMin(t.ms))}</span>
                  <span className="hero-label">minutes{t.estimated ? ' (est.)' : ''}</span>
                </div>
                <div className="hero-stats">
                  <div className="hero-stat">
                    <span className="num">{fmtInt(t.plays)}</span>
                    <span className="label">plays</span>
                  </div>
                  <div className="hero-stat">
                    <span className="num">{fmtInt(t.artists)}</span>
                    <span className="label">artists</span>
                  </div>
                </div>
              </div>
              <BarChart title="Minutes by day" points={series} animateKey={period} />
            </div>
            {recent.length > 0 && (
              <section className="block">
                <div className="section-head">
                  <h2>Recent</h2>
                </div>
                <div className="list">
                  {recent.map((p) => (
                    <Row
                      key={p.id}
                      art={<Cover kind="track" name={p.track} artist={p.artist} album={p.album} track={p.track} />}
                      name={p.track}
                      sub={p.artist}
                      aside={fmtAgo(p.ts)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}
