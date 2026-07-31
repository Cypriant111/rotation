import { useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { daySeries, periodStart, playsIn, totals } from '../lib/stats'
import { fmtAgo, fmtInt, msToMin } from '../lib/format'
import { BarChart } from '../components/BarChart'
import { Segmented } from '../components/Segmented'
import { Artwork } from '../components/Artwork'
import { Mark } from '../components/Icons'
import { albumArtKey } from '../lib/lastfm'

type HomePeriod = '7d' | '30d'

export function Home({ goToSettings }: { goToSettings: () => void }) {
  const { plays, durations, albumArt, sync, syncNow, settings } = useApp()
  const [period, setPeriod] = useState<HomePeriod>('7d')

  const from = periodStart(period)
  const periodPlays = useMemo(() => playsIn(plays, from), [plays, from])
  const t = useMemo(() => totals(periodPlays, durations), [periodPlays, durations])
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
          <div className="empty">
            <Mark size={64} />
            <h2>No listening data yet</h2>
            <p>
              Connect Last.fm for automatic tracking, or import your Apple&nbsp;Music history from an
              Apple privacy export.
            </p>
            <button className="btn" onClick={goToSettings}>
              Get set up
            </button>
          </div>
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
              <BarChart points={series} />
            </div>
            {recent.length > 0 && (
              <div className="card">
                <div className="card-title">Recent</div>
                {recent.map((p) => (
                  <div className="recent-row" key={p.id}>
                    <Artwork
                      name={p.track}
                      url={p.album ? albumArt[albumArtKey(p.artist, p.album)] : undefined}
                    />
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
