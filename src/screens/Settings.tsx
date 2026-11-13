import { useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { fmtAgo, fmtInt } from '../lib/format'
import type { ImportResult } from '../lib/csv'
import type { SpotifyImportResult } from '../lib/spotify'
import type { Source } from '../lib/types'
import { serviceOf } from '../lib/types'
import { ServicePicker } from '../components/ServicePicker'
import { useInstall } from '../lib/install'

/** Daily Tracks is a few MB even for a decade of listening; Play Activity runs to hundreds. */
const LARGE_FILE_BYTES = 50 * 1_048_576

export function Settings({ showToast }: { showToast: (msg: string) => void }) {
  const app = useApp()
  // Settings always manages the user's own data, even while the demo is on
  const { settings, ownPlays: plays, sync } = app

  const [user, setUser] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [importProgress, setImportProgress] = useState<{ rows: number; kept: number } | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const spotifyRef = useRef<HTMLInputElement>(null)
  const [spotifyProgress, setSpotifyProgress] = useState<{ read: number; of: number } | null>(null)
  const [spotifyResult, setSpotifyResult] = useState<SpotifyImportResult | null>(null)
  const [spotifyError, setSpotifyError] = useState('')
  const service = serviceOf(settings)
  const isIOS = useInstall().platform === 'ios'

  const counts = useMemo(() => {
    const c = { lastfm: 0, csv: 0, spotify: 0, skips: 0 }
    for (const p of plays) {
      if (p.skip) c.skips++
      else c[p.source]++
    }
    return c
  }, [plays])

  const connected = Boolean(settings.lastfmUser)

  async function connect() {
    setConnectError('')
    if (!user.trim() || !apiKey.trim()) {
      setConnectError('Enter both your Last.fm username and an API key.')
      return
    }
    setConnecting(true)
    try {
      const info = await app.connect(user, apiKey)
      showToast(`Connected — importing ${fmtInt(info.playcount)} scrobbles`)
    } catch (e) {
      setConnectError((e as Error).message)
    } finally {
      setConnecting(false)
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > LARGE_FILE_BYTES) {
      const mb = Math.round(file.size / 1_048_576)
      const ok = window.confirm(
        `This file is ${fmtInt(mb)} MB, which looks like the big “Play Activity” file. Recent exports of it have no artist names, so most plays can’t be matched. “Apple Music - Play History Daily Tracks.csv” from the same folder works better. Import this file anyway?`,
      )
      if (!ok) {
        if (fileRef.current) fileRef.current.value = ''
        return
      }
    }
    setImportError('')
    setImportResult(null)
    setImportProgress({ rows: 0, kept: 0 })
    try {
      const result = await app.importCsv(file, (rows, kept) => setImportProgress({ rows, kept }))
      setImportResult(result)
      showToast(`Imported ${fmtInt(result.imported)} plays`)
    } catch (e) {
      setImportError((e as Error).message)
    } finally {
      setImportProgress(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onSpotifyFiles(list: FileList | null) {
    const files = list ? [...list] : []
    if (files.length === 0) return
    setSpotifyError('')
    setSpotifyResult(null)
    setSpotifyProgress({ read: 0, of: files.length })
    try {
      const result = await app.importSpotify(files, (read) => setSpotifyProgress({ read, of: files.length }))
      setSpotifyResult(result)
      showToast(`Imported ${fmtInt(result.imported)} plays`)
    } catch (e) {
      setSpotifyError((e as Error).message)
    } finally {
      setSpotifyProgress(null)
      if (spotifyRef.current) spotifyRef.current.value = ''
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(plays)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rotation-plays-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }

  async function clearSource(source: Source) {
    const label = { lastfm: 'Last.fm', csv: 'imported Apple Music', spotify: 'imported Spotify' }[source]
    if (!window.confirm(`Delete ${fmtInt(counts[source])} ${label} plays from this device?`)) return
    await app.clearSource(source)
    showToast('Deleted')
  }

  return (
    <>
      <header className="screen-header">
        <h1>Settings</h1>
      </header>
      <main>
        <h2 className="section-title">Your music service</h2>
        <div className="card">
          <ServicePicker />
          <div className="note">
            Steers the setup steps below, where song links in Mixes open, and the footer on recap
            cards.
          </div>
        </div>

        <h2 className="section-title">Last.fm — automatic tracking</h2>
        <div className="card">
          {!connected ? (
            <>
              <input
                className="field"
                style={{ marginTop: 0 }}
                placeholder="Last.fm username"
                autoCapitalize="none"
                autoCorrect="off"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
              <input
                className="field"
                placeholder="Last.fm API key"
                autoCapitalize="none"
                autoCorrect="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              {connectError && <div className="inline-error">{connectError}</div>}
              <div className="actions">
                <button className="btn full" onClick={connect} disabled={connecting}>
                  {connecting ? 'Checking…' : 'Connect'}
                </button>
              </div>
              {service === 'spotify' ? (
              <div className="note">
                One-time setup, a few minutes:
                <ol>
                  <li>
                    Create a free account at <a href="https://www.last.fm/join" target="_blank" rel="noreferrer">last.fm/join</a>.
                  </li>
                  <li>
                    On last.fm open{' '}
                    <a href="https://www.last.fm/settings/applications" target="_blank" rel="noreferrer">
                      Settings ▸ Applications
                    </a>{' '}
                    and connect <strong>Spotify Scrobbling</strong>. Spotify then reports every play itself,
                    from all your devices; the Last.fm phone app isn’t needed.
                  </li>
                  <li>
                    While signed in, open{' '}
                    <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">
                      last.fm/api/account/create
                    </a>
                    , enter any app name (say, Rotation), submit, and copy the <strong>API key</strong> here.
                    Keys are free and instant — the shared secret is not needed.
                  </li>
                </ol>
              </div>
              ) : (
              <div className="note">
                One-time setup, about five minutes:
                <ol>
                  <li>
                    Create a free account at <a href="https://www.last.fm/join" target="_blank" rel="noreferrer">last.fm/join</a>, then install the
                    Last.fm app from the App Store and sign in.
                  </li>
                  <li>
                    In iPhone Settings ▸ Music, turn on <strong>Use Listening History</strong>. Give the
                    Last.fm app access to Apple Music when it asks, and allow Background App Refresh.
                  </li>
                  <li>
                    While signed in on last.fm, open{' '}
                    <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">
                      last.fm/api/account/create
                    </a>
                    , enter any app name (say, Rotation), submit, and copy the <strong>API key</strong> here.
                    Keys are free and instant — the shared secret is not needed.
                  </li>
                </ol>
                Open the Last.fm app every day or two; iOS only lets it read your play history while it
                runs. Every play it records shows up here on the next sync.
              </div>
              )}
            </>
          ) : (
            <>
              <div className="settings-row">
                <div>
                  <div>{settings.lastfmUser}</div>
                  <div className="hint">
                    {fmtInt(counts.lastfm)} plays synced
                    {sync.state === 'idle' && sync.lastSyncAt ? ` · ${fmtAgo(sync.lastSyncAt)}` : ''}
                  </div>
                </div>
                <button
                  className="trailing"
                  style={{ color: 'var(--accent)', fontWeight: 600 }}
                  onClick={app.syncNow}
                  disabled={sync.state === 'syncing'}
                >
                  {sync.state === 'syncing' ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
              {sync.state === 'syncing' && (
                <div className="progress-line">
                  <span className="spin" />
                  {sync.totalPages > 1
                    ? `page ${sync.page} of ${sync.totalPages} — ${fmtInt(sync.fetched)} plays`
                    : 'checking for new plays'}
                </div>
              )}
              {sync.state === 'error' && <div className="inline-error">{sync.message}</div>}
              <div className="settings-row">
                <div>
                  Sync automatically
                  <div className="hint">when the app opens</div>
                </div>
                <button
                  className="toggle"
                  role="switch"
                  aria-checked={settings.autoSync}
                  onClick={() => app.saveSettings({ autoSync: !settings.autoSync })}
                >
                  <span className="knob" />
                </button>
              </div>
              <div className="settings-row">
                <button style={{ color: 'var(--danger)' }} onClick={app.disconnect}>
                  Disconnect
                </button>
              </div>
            </>
          )}
        </div>

        {service === 'spotify' && (
          <>
            <h2 className="section-title">Spotify export — full history</h2>
            <div className="card">
              <input
                ref={spotifyRef}
                type="file"
                multiple
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => onSpotifyFiles(e.target.files)}
              />
              <button
                className="btn secondary full"
                onClick={() => spotifyRef.current?.click()}
                disabled={app.importing}
              >
                {app.importing ? 'Importing…' : 'Import JSON files'}
              </button>
              {spotifyProgress && (
                <div className="progress-line">
                  <span className="spin" />
                  reading file {fmtInt(spotifyProgress.read)} of {fmtInt(spotifyProgress.of)}
                </div>
              )}
              {spotifyError && <div className="inline-error">{spotifyError}</div>}
              {spotifyResult && (
                <div className="inline-ok">
                  Imported {fmtInt(spotifyResult.imported)} plays
                  {spotifyResult.skipEvents > 0 ? ` and ${fmtInt(spotifyResult.skipEvents)} skips` : ''} from{' '}
                  {fmtInt(spotifyResult.files)} {spotifyResult.files === 1 ? 'file' : 'files'}
                  {spotifyResult.duplicates > 0 ? `, skipped ${fmtInt(spotifyResult.duplicates)} already tracked` : ''}
                  {spotifyResult.firstTs
                    ? ` (${new Date(spotifyResult.firstTs).getFullYear()}–${new Date(spotifyResult.lastTs!).getFullYear()})`
                    : ''}
                  .
                  {spotifyResult.kinds.length === 1 && spotifyResult.kinds[0] === 'account'
                    ? ' This is the one-year account data file, which has no skip information; the extended history gives you everything.'
                    : ''}
                </div>
              )}
              <div className="note">
                Spotify will send you your full listening history:
                <ol>
                  <li>
                    On{' '}
                    <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer">
                      spotify.com/account/privacy
                    </a>{' '}
                    tick <strong>Extended streaming history</strong> and request the data.
                  </li>
                  <li>Spotify emails a download link, usually within a few days and at most 30.</li>
                  <li>
                    Unzip the download (on iPhone, tap it in the Files app), then select all the{' '}
                    <strong>Streaming_History_Audio</strong> files here at once. Podcasts and videos are
                    left out. The one-year <strong>StreamingHistory_music</strong> files from “Account
                    data” work too, without skips.
                  </li>
                </ol>
                Everything stays on this device — the files are never uploaded anywhere.
              </div>
            </div>
          </>
        )}

        {service === 'apple' && (
          <>
        <h2 className="section-title">Apple Music export — full history</h2>
        <div className="card">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button
            className="btn secondary full"
            onClick={() => fileRef.current?.click()}
            disabled={app.importing}
          >
            {app.importing ? 'Importing…' : 'Import CSV'}
          </button>
          {importProgress && (
            <div className="progress-line">
              <span className="spin" />
              {fmtInt(importProgress.rows)} rows read · {fmtInt(importProgress.kept)} plays kept
            </div>
          )}
          {importError && <div className="inline-error">{importError}</div>}
          {importResult && (
            <div className="inline-ok">
              Imported {fmtInt(importResult.imported)} plays
              {importResult.skipEvents > 0 ? ` and ${fmtInt(importResult.skipEvents)} skips` : ''}
              {importResult.duplicates > 0 ? `, skipped ${fmtInt(importResult.duplicates)} already tracked` : ''}
              {importResult.firstTs
                ? ` (${new Date(importResult.firstTs).getFullYear()}–${new Date(importResult.lastTs!).getFullYear()})`
                : ''}
              .
            </div>
          )}
          <div className="note">
            Apple will send you your full listening history:
            <ol>
              <li>
                Go to <a href="https://privacy.apple.com" target="_blank" rel="noreferrer">privacy.apple.com</a> ▸ Get a copy of your data ▸ select{' '}
                <strong>Apple Media Services information</strong>.
              </li>
              <li>Apple prepares the download in up to 7 days and emails you.</li>
              <li>
                In the download, open the <strong>Apple Music Activity</strong> folder and import{' '}
                <strong>Apple Music - Play History Daily Tracks.csv</strong> here.
              </li>
            </ol>
            Everything stays on this device — the file is never uploaded anywhere.
          </div>
        </div>
          </>
        )}

        <h2 className="section-title">Data</h2>
        <div className="card">
          <div className="settings-row">
            <div className="settings-main">
              All plays
              <div className="hint">
                {fmtInt(counts.lastfm + counts.csv + counts.spotify)} plays · {fmtInt(counts.lastfm)} Last.fm
                {counts.csv > 0 || service === 'apple' ? ` · ${fmtInt(counts.csv)} Apple Music` : ''}
                {counts.spotify > 0 || service === 'spotify' ? ` · ${fmtInt(counts.spotify)} Spotify` : ''}
                {counts.skips > 0 ? ` · ${fmtInt(counts.skips)} skips` : ''}
              </div>
            </div>
            <button className="trailing" style={{ color: 'var(--accent)', fontWeight: 600 }} onClick={exportJson}>
              Export
            </button>
          </div>
          {counts.csv > 0 && (
            <div className="settings-row">
              <button style={{ color: 'var(--danger)' }} onClick={() => clearSource('csv')}>
                Delete imported Apple Music plays
              </button>
            </div>
          )}
          {counts.spotify > 0 && (
            <div className="settings-row">
              <button style={{ color: 'var(--danger)' }} onClick={() => clearSource('spotify')}>
                Delete imported Spotify plays
              </button>
            </div>
          )}
          {counts.lastfm > 0 && (
            <div className="settings-row">
              <button style={{ color: 'var(--danger)' }} onClick={() => clearSource('lastfm')}>
                Delete Last.fm plays
              </button>
            </div>
          )}
        </div>

        <div className="note outside">
          Rotation keeps all data in this app’s local storage.
          {isIOS
            ? ' If you use it in Safari and then add it to your Home Screen, the installed app starts fresh — set up your sources from inside the installed app.'
            : ''}
        </div>

        <h2 className="section-title">About</h2>
        <div className="card about">
          <p>
            <strong>Your data stays on this device.</strong> Listening history, settings and your
            Last.fm key are kept in this browser’s storage. Nothing is uploaded: no account, no
            analytics, no ads.
          </p>
          <p>
            <strong>Network connections.</strong> The Last.fm API (ws.audioscrobbler.com), with
            your own key: to fetch your scrobbles, and to look up covers for the songs and albums
            on screen, which sends their artist and title. Last.fm’s image server
            (lastfm.freetls.fastly.net) for the cover pictures. Without a Last.fm key none of this
            happens. The app itself loads from GitHub Pages.
          </p>
          <p>Rotation is not affiliated with Apple, Spotify or Last.fm.</p>
          <p>
            Source code:{' '}
            <a href="https://github.com/Cypriant111/rotation" target="_blank" rel="noreferrer">
              github.com/Cypriant111/rotation
            </a>
          </p>
        </div>
      </main>
    </>
  )
}
