import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import {
  hourMatrix,
  monthRange,
  periodStreak,
  playsIn,
  skipStats,
  streaks,
  topArtists,
  topTracks,
  totals,
  yearRange,
} from '../lib/stats'
import { fmtInt, msToMin } from '../lib/format'
import { Heatmap } from '../components/Heatmap'
import { Chips } from '../components/Segmented'
import { canvasToBlob, renderCard, shareCard } from '../lib/share'
import { useFadeOnChange, usePresence } from '../lib/motion'
import { SERVICE_NAME, serviceOf } from '../lib/types'
import type { CardData, CardFormat } from '../lib/share'

type RecapPeriod = 'this-month' | 'last-month' | 'this-year' | 'all'

function rangeFor(p: RecapPeriod): { from: number; to: number; label: string } {
  if (p === 'this-month') return monthRange(0)
  if (p === 'last-month') return monthRange(-1)
  if (p === 'this-year') return yearRange(0)
  return { from: 0, to: Infinity, label: 'All time' }
}

export function Recap({ showToast }: { showToast: (msg: string) => void }) {
  const { plays, durations, artists: ak, settings } = useApp()
  const serviceName = SERVICE_NAME[serviceOf(settings)]
  const [period, setPeriod] = useState<RecapPeriod>('this-month')
  const [preview, setPreview] = useState<{ url: string; blob: Blob; format: CardFormat } | null>(null)
  // the sheet stays mounted through its exit; `preview` is kept until then
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMounted, sheetVisible] = usePresence(sheetOpen, 200)
  const contentRef = useRef<HTMLDivElement>(null)
  useFadeOnChange(contentRef, period)
  const blobs = useRef<Partial<Record<CardFormat, Blob>>>({})

  const range = useMemo(() => rangeFor(period), [period])
  const periodPlays = useMemo(
    () => playsIn(plays, range.from, range.to),
    [plays, range],
  )
  const t = useMemo(() => totals(periodPlays, durations, ak), [periodPlays, durations, ak])
  const artists = useMemo(() => topArtists(periodPlays, durations, 5, ak), [periodPlays, durations, ak])
  const tracks = useMemo(() => topTracks(periodPlays, durations, 5, ak), [periodPlays, durations, ak])
  const matrix = useMemo(() => hourMatrix(periodPlays, durations), [periodPlays, durations])
  const s = useMemo(() => streaks(plays), [plays])
  // live streak only for periods that include today; finished ones show their best run
  const ps = useMemo(() => periodStreak(plays, range), [plays, range])
  const sk = useMemo(() => skipStats(periodPlays, 3), [periodPlays])

  const cardData: CardData = useMemo(
    () => ({
      periodLabel: range.label,
      minutes: msToMin(t.ms),
      plays: t.plays,
      artists: t.artists,
      streak: ps.value,
      streakLabel: ps.label,
      serviceName,
      topArtists: artists,
      topTracks: tracks,
      estimated: t.estimated,
    }),
    [range, t, ps, artists, tracks, serviceName],
  )

  // pre-render cards so the share tap stays inside iOS's user-gesture window
  useEffect(() => {
    blobs.current = {}
    if (periodPlays.length === 0) return
    let alive = true
    const id = setTimeout(async () => {
      for (const format of ['story', 'square'] as CardFormat[]) {
        const blob = await canvasToBlob(renderCard(cardData, format))
        if (!alive) return
        blobs.current[format] = blob
      }
    }, 80)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [cardData, periodPlays.length])

  async function openPreview(format: CardFormat) {
    const blob = blobs.current[format] ?? (await canvasToBlob(renderCard(cardData, format)))
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { url: URL.createObjectURL(blob), blob, format }
    })
    setSheetOpen(true)
  }

  // free the image once the exit transition is over
  useEffect(() => {
    if (sheetOpen || sheetMounted || !preview) return
    URL.revokeObjectURL(preview.url)
    setPreview(null)
  }, [sheetOpen, sheetMounted, preview])

  async function doShare() {
    if (!preview) return
    const outcome = await shareCard(preview.blob, cardData.periodLabel)
    if (outcome.method === 'download') showToast('Image saved')
    if (outcome.method !== 'none') closePreview()
  }

  function closePreview() {
    setSheetOpen(false)
  }

  const empty = periodPlays.length === 0

  return (
    <>
      <header className="screen-header">
        <h1>Recap</h1>
      </header>
      <main>
        <Chips
          options={[
            { value: 'this-month', label: 'This month' },
            { value: 'last-month', label: 'Last month' },
            { value: 'this-year', label: 'This year' },
            { value: 'all', label: 'All time' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <div ref={contentRef}>
        {empty ? (
          <div className="empty">
            <p>No plays in {range.label}.</p>
          </div>
        ) : (
          <>
            <div className="card recap-hero">
              <div className="period">{range.label}</div>
              <div className="big">{fmtInt(msToMin(t.ms))}</div>
              <div className="big-label">minutes listened{t.estimated ? ' (est.)' : ''}</div>
              <div className="recap-strip">
                <div className="item">
                  <div className="v">{fmtInt(t.plays)}</div>
                  <div className="l">plays</div>
                </div>
                <div className="item">
                  <div className="v">{fmtInt(t.artists)}</div>
                  <div className="l">artists</div>
                </div>
                <div className="item">
                  <div className="v">{fmtInt(t.tracks)}</div>
                  <div className="l">songs</div>
                </div>
                {ps.value > 1 && (
                  <div className="item">
                    <div className="v">{ps.value}</div>
                    <div className="l">{ps.label}</div>
                  </div>
                )}
              </div>
              <div className="share-actions">
                <button className="btn" onClick={() => openPreview('story')}>
                  Share card
                </button>
                <button className="btn secondary" onClick={() => openPreview('square')}>
                  Square
                </button>
              </div>
            </div>
            {artists.length > 0 && (
              <div className="card">
                <div className="card-title">On repeat</div>
                <div className="rank-list">
                  {artists.slice(0, 3).map((a, i) => (
                    <div className="rank-row" key={a.name}>
                      <div className="rank-num">{i + 1}</div>
                      <div className="rank-main">
                        <div className="rank-name">{a.name}</div>
                      </div>
                      <div className="rank-count">
                        {fmtInt(a.plays)}
                        <span className="unit">plays</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="card">
              <div className="card-title">When you listen</div>
              <Heatmap matrix={matrix} />
            </div>
            {sk.skips > 0 && (
              <div className="card">
                <div className="card-title">
                  Skipped
                  <span className="aside">{Math.round(sk.skipRate * 100)}% of starts</span>
                </div>
                <div className="rank-list">
                  {sk.topSkipped.map((item, i) => (
                    <div className="rank-row" key={`${item.sub}|${item.name}`}>
                      <div className="rank-num">{i + 1}</div>
                      <div className="rank-main">
                        <div className="rank-name">{item.name}</div>
                        <div className="rank-sub">{item.sub}</div>
                      </div>
                      <div className="rank-count">
                        {fmtInt(item.plays)}
                        <span className="unit">skips</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="note" style={{ marginTop: 6 }}>
                  {fmtInt(sk.skips)} skips against {fmtInt(sk.plays)} full plays in {range.label}.
                </div>
              </div>
            )}
            <div className="card">
              <div className="card-title">Streaks</div>
              <div className="recap-strip" style={{ marginTop: 4 }}>
                <div className="item">
                  <div className="v">{s.current}</div>
                  <div className="l">current days</div>
                </div>
                <div className="item">
                  <div className="v">{s.longest}</div>
                  <div className="l">longest run</div>
                </div>
                <div className="item">
                  <div className="v">{fmtInt(t.days)}</div>
                  <div className="l">days with music</div>
                </div>
              </div>
            </div>
          </>
        )}
        </div>
      </main>
      {sheetMounted && preview && (
        <div className="modal-backdrop" data-open={sheetVisible} onClick={closePreview}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Share your ${range.label} recap`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closePreview()
            }}
          >
            <img className="card-preview" src={preview.url} alt={`${range.label} recap card`} />
            <div className="share-actions">
              <button className="btn full" onClick={doShare} autoFocus>
                Share
              </button>
              <button className="btn secondary" onClick={closePreview}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
