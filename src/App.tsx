import { useEffect, useState } from 'react'
import { useApp } from './state/store'
import { applyUpdate, onUpdateReady } from './lib/sw'
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

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export default function App() {
  const { ready } = useApp()
  const [tab, setTab] = useState<Tab>('home')
  const [toast, setToast] = useState('')
  const [showInstall, setShowInstall] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    setShowInstall(isIOS() && !isStandalone() && localStorage.getItem('installDismissed') !== '1')
    onUpdateReady(() => setUpdateReady(true))
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(id)
  }, [toast])

  if (!ready) return null

  return (
    <div className="app">
      {showInstall && (
        <div style={{ padding: '0 16px' }}>
          <div className="install-banner" style={{ marginTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
            <div>
              <strong>Add Rotation to your Home Screen first.</strong> Tap the share button in Safari,
              then “Add to Home Screen” — the installed app keeps its own data, so connect your
              sources in there.
            </div>
            <button
              className="dismiss"
              aria-label="Dismiss"
              onClick={() => {
                localStorage.setItem('installDismissed', '1')
                setShowInstall(false)
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div hidden={tab !== 'home'}>
        <Home goToSettings={() => setTab('settings')} />
      </div>
      <div hidden={tab !== 'top'}>
        <Top />
      </div>
      <div hidden={tab !== 'mixes'}>
        <Mixes showToast={setToast} />
      </div>
      <div hidden={tab !== 'recap'}>
        <Recap showToast={setToast} />
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
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
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
