import { useMemo, useRef, useState } from 'react'
import { pulse, useGrowOnShow } from '../lib/motion'
import { IconCheck } from '../components/Icons'
import { useApp } from '../state/store'
import { buildMixes, mixToText, searchUrl } from '../lib/affinity'
import { SERVICE_NAME, serviceOf } from '../lib/types'
import type { Mix } from '../lib/affinity'
import { Cover } from '../components/Cover'
import { Row } from '../components/Row'
import { Mark } from '../components/Icons'

const PREVIEW_ROWS = 6

function MixCard({ mix, showToast }: { mix: Mix; showToast: (msg: string) => void }) {
  const { settings } = useApp()
  const service = serviceOf(settings)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef(0)
  const copyBtn = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useGrowOnShow(listRef, '.row-bar', mix.key, 'scaleX(0)')
  const rows = expanded ? mix.tracks : mix.tracks.slice(0, PREVIEW_ROWS)
  const maxScore = mix.tracks[0]?.score || 1

  async function copy() {
    try {
      await navigator.clipboard.writeText(mixToText(mix))
      setCopied(true)
      pulse(copyBtn.current)
      clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      showToast('Copy failed')
    }
  }

  async function share() {
    const text = `${mix.title} — from Rotation\n\n${mixToText(mix)}`
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch {
        /* user dismissed the sheet */
      }
    } else {
      await copy()
    }
  }

  return (
    <section className="block">
      <div className="section-head stacked">
        <h2>{mix.title}</h2>
        <p className="section-blurb">{mix.blurb}</p>
      </div>
      <div className="list" ref={listRef}>
        {rows.map((t, i) => (
          <Row
            key={`${t.artist}|${t.name}`}
            href={searchUrl(service, t)}
            label={`${t.name} by ${t.artist} — open in ${SERVICE_NAME[service]}`}
            num={i + 1}
            art={<Cover kind="track" name={t.name} artist={t.artist} album={t.album} track={t.name} />}
            name={t.name}
            sub={t.artist}
            // rows are ordered by score, so the bar shows score; the count is a quiet note
            ratio={t.score / maxScore}
            count={t.count}
            unit={mix.unit}
            quiet
          />
        ))}
        {mix.tracks.length > PREVIEW_ROWS && (
          <button className="list-more" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : `Show all ${mix.tracks.length}`}
          </button>
        )}
      </div>
      <div className="actions">
        <button className="btn secondary copy-btn" onClick={copy} ref={copyBtn} aria-live="polite">
          {copied ? (
            <>
              <IconCheck size={17} />
              Copied
            </>
          ) : (
            'Copy list'
          )}
        </button>
        <button className="btn secondary" onClick={share}>
          Share
        </button>
      </div>
    </section>
  )
}

export function Mixes({ showToast }: { showToast: (msg: string) => void }) {
  const { plays, durations, artists, settings } = useApp()
  const service = serviceOf(settings)
  const mixes = useMemo(() => buildMixes(plays, durations, Date.now(), artists), [plays, durations, artists])

  return (
    <>
      <header className="screen-header">
        <h1>Mixes</h1>
      </header>
      <main>
        {mixes.length === 0 ? (
          <div className="empty">
            <Mark size={64} />
            <h2>Not enough plays yet</h2>
            <p>
              Mixes are built from your listening patterns — plays, skips, and how often you come
              back to a song. Give it a couple of weeks of data (or import your{' '}
              {SERVICE_NAME[service]} history in Settings) and they’ll appear here.
            </p>
          </div>
        ) : (
          <>
            {mixes.map((m) => (
              <MixCard key={m.key} mix={m} showToast={showToast} />
            ))}
            <section className="block">
              <div className="section-head">
                <h2>Make it a real playlist</h2>
              </div>
              <div className="card">
              {service === 'spotify' ? (
                <div className="note" style={{ marginTop: 0 }}>
                  Rotation never signs in to your Spotify account, so it can’t create the playlist
                  itself. Instead:
                  <ol>
                    <li>Tap a song to open it in Spotify and add it from there, or</li>
                    <li>
                      <strong>Copy list</strong> and paste the “Artist - Song” lines into a
                      playlist importer that accepts text; it builds the playlist for you.
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="note" style={{ marginTop: 0 }}>
                  Apple doesn’t let web apps write to your Music library, so Rotation hands the list
                  over instead:
                  <ol>
                    <li>Tap a song to open it in Apple Music and add it from there, or</li>
                    <li>
                      <strong>Copy list</strong>, then run a playlist-importer shortcut (search
                      “playlist importer” in the Shortcuts app gallery or on RoutineHub) — it reads
                      the copied “Artist - Song” lines and builds the playlist for you.
                    </li>
                  </ol>
                </div>
              )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  )
}
