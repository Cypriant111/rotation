import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { AppProvider } from './state/store'
import { announceUpdate } from './lib/sw'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    announceUpdate(() => updateSW(true))
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // installed iOS apps can sit resident for weeks; check on each resume
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
