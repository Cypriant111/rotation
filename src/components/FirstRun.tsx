import type { ReactNode } from 'react'
import { useState } from 'react'
import { useApp } from '../state/store'
import { promptInstall, useInstall } from '../lib/install'
import type { InstallState } from '../lib/install'
import { Mark } from './Icons'

interface Step {
  key: string
  title: string
  body: ReactNode
  done?: boolean
  action?: ReactNode
}

function installStep(install: InstallState, onPrompt: () => void): Step {
  const { platform, standalone, canPrompt } = install
  if (standalone) {
    return { key: 'install', title: 'Add Rotation to your Home Screen', body: 'Done, you’re in the installed app.', done: true }
  }
  if (platform === 'ios') {
    return {
      key: 'install',
      title: 'Add Rotation to your Home Screen',
      body: (
        <>
          In Safari, tap the share button, then <strong>Add to Home Screen</strong>. Do the next steps
          inside the installed app: it keeps its own storage, separate from this tab.
        </>
      ),
    }
  }
  if (platform === 'android') {
    return {
      key: 'install',
      title: 'Install Rotation',
      body: canPrompt ? (
        'One tap, and it opens like a regular app.'
      ) : (
        <>
          In Chrome, open the <strong>⋮</strong> menu and tap <strong>Install app</strong> (or{' '}
          <strong>Add to Home screen</strong>).
        </>
      ),
      action: canPrompt ? (
        <button className="btn" onClick={onPrompt}>
          Install
        </button>
      ) : undefined,
    }
  }
  return {
    key: 'install',
    title: 'Put it on your phone',
    body: 'Rotation is made for a phone. Open this page on your iPhone or Android phone and add it to the Home Screen.',
    action: canPrompt ? (
      <button className="btn secondary" onClick={onPrompt}>
        Install here
      </button>
    ) : undefined,
  }
}

/**
 * The empty Home screen: what Rotation is, a way to try it right now, and
 * the three steps to real stats. Steps are plain data so more sources
 * (e.g. a streaming-service choice) can slot in without a rewrite.
 */
export function FirstRun({ goToSettings }: { goToSettings: () => void }) {
  const { startDemo } = useApp()
  const install = useInstall()
  const [loading, setLoading] = useState(false)

  const steps: Step[] = [
    installStep(install, () => void promptInstall()),
    {
      key: 'apple',
      title: 'Ask Apple for your history, today',
      body: (
        <>
          Apple takes up to 7 days to prepare it, so start now: on{' '}
          <a href="https://privacy.apple.com" target="_blank" rel="noreferrer">
            privacy.apple.com
          </a>{' '}
          choose <strong>Get a copy of your data</strong> ▸ <strong>Apple Media Services information</strong>.
          When the email arrives, import the file in Settings.
        </>
      ),
    },
    {
      key: 'lastfm',
      title: 'Connect Last.fm',
      body: 'Free, about five minutes. From then on new plays show up on their own.',
      action: (
        <button className="btn secondary" onClick={goToSettings}>
          Set up in Settings
        </button>
      ),
    },
  ]

  async function demo() {
    setLoading(true)
    try {
      await startDemo()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="first-run">
      <div className="first-run-hero">
        <Mark size={56} />
        <h2>Your Apple Music listening, in numbers</h2>
        <p>
          Minutes, top artists and songs, mixes of what you really like, and recap cards to share.
          Everything stays on this device.
        </p>
        <button className="btn" onClick={demo} disabled={loading}>
          {loading ? 'Loading…' : 'See it with sample data'}
        </button>
      </div>

      <div className="section-label">Get your own stats in 3 steps</div>
      <ol className="steps">
        {steps.map((s, i) => (
          <li className={`card step${s.done ? ' done' : ''}`} key={s.key}>
            <div className="step-num" aria-hidden>
              {s.done ? '✓' : i + 1}
            </div>
            <div className="step-main">
              <div className="step-title">
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
              </div>
              <div className="step-body">{s.body}</div>
              {s.action && <div className="step-action">{s.action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
