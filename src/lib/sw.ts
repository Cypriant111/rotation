/** Tiny bridge between the SW registration (main.tsx) and the UI (App.tsx):
 *  updates apply when the user asks, never mid-import via a forced reload. */

let applyFn: (() => void) | null = null
let notify: (() => void) | null = null

export function announceUpdate(apply: () => void): void {
  applyFn = apply
  notify?.()
}

export function onUpdateReady(cb: () => void): void {
  notify = cb
  if (applyFn) cb()
}

export function applyUpdate(): void {
  applyFn?.()
}
