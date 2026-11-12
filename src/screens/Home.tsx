import { useMemo, useRef, useState } from 'react'
import { useFadeOnChange } from '../lib/motion'
import { useApp } from '../state/store'
import { daySeries, periodStart, playsIn, totals } from '../lib/stats'
import { fmtAgo, fmtInt, msToMin } from '../lib/format'
import { BarChart } from '../components/BarChart'
import { Segmented } from '../components/Segmented'
import { Artwork } from '../components/Artwork'
import { FirstRun } from '../components/FirstRun'

type HomePeriod = '7d' | '30d'

export function Home({ goToSettings }: { goToSettings: () => void }) {
  const { plays, durations, artFor, artists, sync, syncNow, settings } = useApp()
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
            <div ref={periodRef}>
            <div className="kpi-row">
              <div className="stat-tile">
                <div className="value">{fmtInt(msToMin(t.ms))}</div>
                <div className="label">minutes{t.estimated ? ' (est.)' : ''}</div>
              </div>
              <div className="stat-tile">
                <div className="value">{fmtInt(t.plays)}</div>
                <div className="label">plays</div>
              </div>
              <div className="stat-tile">
                <div className="value">{fmtInt(t.artists)}</div>
                <div className="label">artists</div>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Minutes by day</div>
              <BarChart points={series} animateKey={period} />
            </div>
            </div>
            {recent.length > 0 && (
              <div className="card">
                <div className="card-title">Recent</div>
                {recent.map((p) => (
                  <div className="recent-row" key={p.id}>
                    <Artwork name={p.track} url={artFor(p.artist, p.album, p.track)} />
                    <div className="rank-main">
                      <div className="rank-name">{p.track}</div>
                      <div className="rank-sub">{p.artist}</div>
                    </div>
                    <div className="recent-time">{fmtAgo(p.ts)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
