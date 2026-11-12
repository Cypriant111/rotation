import { useSyncExternalStore } from 'react'

/**
 * Install support across platforms.
 *  - iOS Safari: no install API; the user goes through Share ▸ Add to Home
 *    Screen, and the installed app gets storage separate from the Safari tab.
 *  - Chrome on Android (and desktop Chromium): `beforeinstallprompt` hands
 *    us a deferred prompt we can trigger from our own Install button.
 *
 * `initInstall()` must run before React mounts: the event can fire early.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type Platform = 'ios' | 'android' | 'other'

export interface InstallState {
  platform: Platform
  standalone: boolean
  /** a native install prompt is available (Chromium) */
  canPrompt: boolean
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
let snapshot: InstallState | null = null

function notify() {
  snapshot = null
  listeners.forEach((l) => l())
}

export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  // iPadOS reports a desktop Mac user agent
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

function isStandalone(): boolean {
  return (
    installed ||
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own banner instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

function getSnapshot(): InstallState {
  if (!snapshot) {
    snapshot = {
      platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
      standalone: isStandalone(),
      canPrompt: deferred !== null,
    }
  }
  return snapshot
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useInstall(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Shows the native install prompt. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const e = deferred
  deferred = null // a prompt can only be used once
  notify()
  await e.prompt()
  const choice = await e.userChoice
  return choice.outcome === 'accepted'
}
