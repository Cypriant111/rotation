import { useEffect, useRef, useState } from 'react'
import { useApp } from './state/store'
import { applyUpdate, onUpdateReady } from './lib/sw'
import { promptInstall, useInstall } from './lib/install'
import { ScreenActiveProvider, usePresence } from './lib/motion'
import { Home } from './screens/Home'
import { Top } from './screens/Top'
import { Mixes } from './screens/Mixes'
import { Recap } from './screens/Recap'
import { Settings } from './screens/Settings'
import { IconCharts, IconHome, IconMixes, IconRecap, IconSettings } from './components/Icons'

type Tab = 'home' | 'top' | 'mixes' | 'recap' | 'settings'

const TABS: { key: Tab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  { key: 'home', label: 'Home', icon: () => <IconHome /> },
  { key: 'top', label: 'Top', icon: () => <IconCharts /> },
  { key: 'mixes', label: 'Mixes', icon: () => <IconMixes /> },
  { key: 'recap', label: 'Recap', icon: () => <IconRecap /> },
  { key: 'settings', label: 'Settings', icon: () => <IconSettings /> },
]

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* private mode: the banner simply comes back next time */
  }
}

/** `?demo` in the URL opens straight into demo mode (README / shared links). */
function wantsDemo(): boolean {
  return new URLSearchParams(window.location.search).has('demo')
}

function dropDemoParam() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('demo')) return
  url.searchParams.delete('demo')
  history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export default function App() {
  const { ready, demo, startDemo, exitDemo } = useApp()
  const install = useInstall()
  const [tab, setTab] = useState<Tab>('home')
  const [toast, setToast] = useState('')
  const [installDismissed, setInstallDismissed] = useState(() => readFlag('installDismissed'))
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    onUpdateReady(() => setUpdateReady(true))
    if (wantsDemo()) startDemo()
  }, [startDemo])

  const showInstall =
    !installDismissed &&
    !install.standalone &&
    (install.platform === 'ios' || (install.platform === 'android' && install.canPrompt))

  function dismissInstall() {
    writeFlag('installDismissed')
    setInstallDismissed(true)
  }

  function leaveDemo() {
    exitDemo()
    dropDemoParam()
  }

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(id)
  }, [toast])

  // the toast fades out instead of vanishing; keep its text through the exit
  const [toastMounted, toastVisible] = usePresence(Boolean(toast), 200)
  const lastToast = useRef('')
  if (toast) lastToast.current = toast

  if (!ready) return null

  return (
    <div className={`app${demo ? ' has-demo' : ''}`}>
      {demo && (
        <div className="demo-bar" role="status">
          <span>
            <strong>Demo data</strong> · nothing is saved
          </span>
          <button onClick={leaveDemo}>Exit demo</button>
        </div>
      )}
      {showInstall && (
        <div style={{ padding: '0 16px' }}>
          <div
            className="install-banner"
            style={demo ? undefined : { marginTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
          >
            {install.platform === 'ios' ? (
              <div>
                <strong>Add Rotation to your Home Screen first.</strong> Tap the share button in Safari,
                then “Add to Home Screen” — the installed app keeps its own data, so connect your
                sources in there.
              </div>
            ) : (
              <div className="install-banner-main">
                <div>
                  <strong>Install Rotation</strong> to open it from your home screen like any other app.
                </div>
                <button
                  className="btn"
                  onClick={async () => {
                    if (await promptInstall()) dismissInstall()
                  }}
                >
                  Install
                </button>
              </div>
            )}
            <button className="dismiss" aria-label="Dismiss" onClick={dismissInstall}>
              ✕
            </button>
          </div>
        </div>
      )}
      <div hidden={tab !== 'home'}>
        <ScreenActiveProvider active={tab === 'home'}>
          <Home goToSettings={() => setTab('settings')} />
        </ScreenActiveProvider>
      </div>
      <div hidden={tab !== 'top'}>
        <ScreenActiveProvider active={tab === 'top'}>
          <Top />
        </ScreenActiveProvider>
      </div>
      <div hidden={tab !== 'mixes'}>
        <ScreenActiveProvider active={tab === 'mixes'}>
          <Mixes showToast={setToast} />
        </ScreenActiveProvider>
      </div>
      <div hidden={tab !== 'recap'}>
        <ScreenActiveProvider active={tab === 'recap'}>
          <Recap showToast={setToast} />
        </ScreenActiveProvider>
      </div>
      <div hidden={tab !== 'settings'}>
        <Settings showToast={setToast} />
      </div>
      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.key} aria-current={tab === t.key} onClick={() => setTab(t.key)}>
              {t.icon(tab === t.key)}
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      {toastMounted && (
        <div className="toast" role="status" aria-live="polite" data-open={toastVisible}>
          {toast || lastToast.current}
        </div>
      )}
      {updateReady && (
        <button className="update-pill" onClick={applyUpdate}>
          Update ready — tap to reload
        </button>
      )}
    </div>
  )
}
