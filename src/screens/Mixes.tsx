import { useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { appleMusicSearchUrl, buildMixes, mixToText } from '../lib/affinity'
import type { Mix } from '../lib/affinity'
import { fmtInt } from '../lib/format'
import { Artwork } from '../components/Artwork'
import { RowBar } from '../components/RowBar'
import { Mark } from '../components/Icons'

const PREVIEW_ROWS = 6

function MixCard({ mix, showToast }: { mix: Mix; showToast: (msg: string) => void }) {
  const { artFor } = useApp()
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? mix.tracks : mix.tracks.slice(0, PREVIEW_ROWS)
  // rows are ordered by score, so the bar shows score too (count stays as text)
  const maxScore = mix.tracks[0]?.score || 1

  async function copy() {
    try {
      await navigator.clipboard.writeText(mixToText(mix))
      showToast(`Copied ${mix.tracks.length} songs`)
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
    <div className="card">
      <div className="mix-head">
        <div>
          <div className="mix-title">{mix.title}</div>
          <div className="mix-blurb">{mix.blurb}</div>
        </div>
      </div>
      <div className="rank-list">
        {rows.map((t, i) => (
          <a
            className="rank-row"
            key={`${t.artist}|${t.name}`}
            href={appleMusicSearchUrl(t)}
            target="_blank"
            rel="noreferrer"
            aria-label={`${t.name} by ${t.artist} — open in Apple Music`}
          >
            <div className="row-body">
              <RowBar ratio={t.score / maxScore} />
              <div className="rank-num">{i + 1}</div>
              <Artwork name={t.name} url={artFor(t.artist, t.album, t.name)} />
              <div className="rank-main">
                <div className="rank-name">{t.name}</div>
                <div className="rank-sub">{t.artist}</div>
              </div>
            </div>
            <div className="rank-count">
              {fmtInt(t.count)}
              <span className="unit">{mix.unit}</span>
            </div>
          </a>
        ))}
      </div>
      {mix.tracks.length > PREVIEW_ROWS && (
        <button className="mix-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show all ${mix.tracks.length}`}
        </button>
      )}
      <div className="share-actions">
        <button className="btn secondary" onClick={copy}>
          Copy list
        </button>
        <button className="btn secondary" onClick={share}>
          Share
        </button>
      </div>
    </div>
  )
}

export function Mixes({ showToast }: { showToast: (msg: string) => void }) {
  const { plays, durations, artists } = useApp()
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
              back to a song. Give it a couple of weeks of data (or import your Apple Music CSV) and
              they’ll appear here.
            </p>
          </div>
        ) : (
          <>
            {mixes.map((m) => (
              <MixCard key={m.key} mix={m} showToast={showToast} />
            ))}
            <div className="card">
              <div className="card-title">Make it a real playlist</div>
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
            </div>
          </>
        )}
      </main>
    </>
  )
}
