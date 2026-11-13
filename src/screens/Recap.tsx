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
import { fmtCompact, fmtInt, msToMin } from '../lib/format'
import { Heatmap } from '../components/Heatmap'
import { Segmented } from '../components/Segmented'
import { RankList } from '../components/RankList'
import { Cover } from '../components/Cover'
import { Row } from '../components/Row'
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
        <Segmented
          options={[
            { value: 'this-month', label: 'This month' },
            { value: 'last-month', label: 'Last month' },
            { value: 'this-year', label: 'This year' },
            { value: 'all', label: 'All time' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <div ref={contentRef} className="stack">
        {empty ? (
          <div className="empty">
            <p>No plays in {range.label}.</p>
          </div>
        ) : (
          <>
            <div className="hero">
              <div className="hero-period">{range.label}</div>
              <div className="hero-line">
                <span className="hero-num big">{fmtInt(msToMin(t.ms))}</span>
                <span className="hero-label">minutes listened{t.estimated ? ' (est.)' : ''}</span>
              </div>
            </div>
            <div className="card strip">
              <div className="strip-cell">
                <div className="v">{fmtCompact(t.plays)}</div>
                <div className="l">plays</div>
              </div>
              <div className="strip-cell">
                <div className="v">{fmtInt(t.artists)}</div>
                <div className="l">artists</div>
              </div>
              <div className="strip-cell">
                <div className="v">{fmtInt(t.tracks)}</div>
                <div className="l">songs</div>
              </div>
              {ps.value > 1 && (
                <div className="strip-cell">
                  <div className="v">{ps.value}</div>
                  <div className="l">{ps.label}</div>
                </div>
              )}
            </div>
            <div className="actions">
              <button className="btn" onClick={() => openPreview('story')}>
                Share card
              </button>
              <button className="btn secondary" onClick={() => openPreview('square')}>
                Square
              </button>
            </div>
            {artists.length > 0 && (
              <section className="block">
                <div className="section-head">
                  <h2>On repeat</h2>
                </div>
                <RankList items={artists.slice(0, 3)} kind="artist" animateKey={period} />
              </section>
            )}
            <Heatmap title="When you listen" matrix={matrix} />
            {sk.skips > 0 && (
              <section className="block">
                <div className="section-head">
                  <h2>Skipped</h2>
                  <div className="section-aside">{Math.round(sk.skipRate * 100)}% of starts</div>
                </div>
                <div className="list">
                  {sk.topSkipped.map((item, i) => (
                    <Row
                      key={`${item.sub}|${item.name}`}
                      num={i + 1}
                      art={<Cover kind="track" name={item.name} artist={item.artist} album={item.album} track={item.name} />}
                      name={item.name}
                      sub={item.sub}
                      count={item.plays}
                      unit="skips"
                    />
                  ))}
                </div>
                <div className="note outside">
                  {fmtInt(sk.skips)} skips against {fmtInt(sk.plays)} full plays in {range.label}.
                </div>
              </section>
            )}
            <section className="block">
              <div className="section-head">
                <h2>Streaks</h2>
              </div>
              <div className="card strip">
                <div className="strip-cell">
                  <div className="v">{s.current}</div>
                  <div className="l">current days</div>
                </div>
                <div className="strip-cell">
                  <div className="v">{s.longest}</div>
                  <div className="l">longest run</div>
                </div>
                <div className="strip-cell">
                  <div className="v">{fmtInt(t.days)}</div>
                  <div className="l">days with music</div>
                </div>
              </div>
            </section>
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
            <div className="actions">
              <button className="btn" onClick={doShare} autoFocus>
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
