import { useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { fmtAgo, fmtInt } from '../lib/format'
import type { ImportResult } from '../lib/csv'

export function Settings({ showToast }: { showToast: (msg: string) => void }) {
  const app = useApp()
  const { settings, plays, sync } = app

  const [user, setUser] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [importProgress, setImportProgress] = useState<{ rows: number; kept: number } | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const counts = useMemo(() => {
    let lastfm = 0
    let csv = 0
    for (const p of plays) p.source === 'lastfm' ? lastfm++ : csv++
    return { lastfm, csv }
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

  async function clearSource(source: 'lastfm' | 'csv') {
    const n = source === 'lastfm' ? counts.lastfm : counts.csv
    if (!window.confirm(`Delete ${fmtInt(n)} ${source === 'lastfm' ? 'Last.fm' : 'imported CSV'} plays from this device?`)) return
    await app.clearSource(source)
    showToast('Deleted')
  }

  return (
    <>
      <header className="screen-header">
        <h1>Settings</h1>
      </header>
      <main>
        <div className="section-label">Last.fm — automatic tracking</div>
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
              <div className="share-actions">
                <button className="btn full" onClick={connect} disabled={connecting}>
                  {connecting ? 'Checking…' : 'Connect'}
                </button>
              </div>
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

        <div className="section-label">Apple Music export — full history</div>
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
                <strong>Apple Music - Play History Daily Tracks.csv</strong> here. (The bigger “Play
                Activity” file works too.)
              </li>
            </ol>
            Everything stays on this device — the file is never uploaded anywhere.
          </div>
        </div>

        <div className="section-label">Data</div>
        <div className="card">
          <div className="settings-row">
            <div>
              All plays
              <div className="hint">
                {fmtInt(plays.length)} total · {fmtInt(counts.lastfm)} Last.fm · {fmtInt(counts.csv)} imported
              </div>
            </div>
            <button className="trailing" style={{ color: 'var(--accent)', fontWeight: 600 }} onClick={exportJson}>
              Export
            </button>
          </div>
          {counts.csv > 0 && (
            <div className="settings-row">
              <button style={{ color: 'var(--danger)' }} onClick={() => clearSource('csv')}>
                Delete imported CSV plays
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

        <div className="note" style={{ padding: '0 4px' }}>
          Rotation keeps all data in this app’s local storage. If you use it in Safari and then add it
          to your Home Screen, the installed app starts fresh — set up your sources from inside the
          installed app.
        </div>
      </main>
    </>
  )
}
