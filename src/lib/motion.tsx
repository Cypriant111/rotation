/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'

/**
 * Motion rules (U3): CSS and the Web Animations API only, no springs or
 * bounces, all of it off under prefers-reduced-motion, and every animation
 * interruptible: WAAPI runs never fill forwards, so a cancelled or finished
 * run leaves the element's real style, never a frozen halfway value.
 * (fill 'backwards' only holds the first keyframe until the run starts, so
 * the first frame can't flash the end state.)
 */

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ---------- which screen is on display ---------- */

const ScreenActive = createContext(true)

/** Screens stay mounted while hidden; this tells their charts when they show. */
export function ScreenActiveProvider({ active, children }: { active: boolean; children: ReactNode }) {
  return <ScreenActive.Provider value={active}>{children}</ScreenActive.Provider>
}

export function useScreenActive(): boolean {
  return useContext(ScreenActive)
}

function restart(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  for (const a of el.getAnimations()) a.cancel()
  el.animate(keyframes, options)
}

/**
 * Bars grow from zero the first time their screen shows, and again whenever
 * `key` changes (a new period). All bars move together: a row-by-row
 * cascade over 50 rows would take far too long.
 */
export function useGrowOnShow(
  ref: RefObject<Element | null>,
  selector: string,
  key: unknown,
  from: 'scaleX(0)' | 'scaleY(0)',
) {
  const active = useScreenActive()
  const shownKey = useRef<unknown>(Symbol('never shown'))
  useLayoutEffect(() => {
    if (!active || Object.is(shownKey.current, key)) return
    shownKey.current = key
    const root = ref.current
    if (!root || reducedMotion()) return
    root.querySelectorAll<HTMLElement | SVGElement>(selector).forEach((el) => grow(el, from))
  })
}

/**
 * Chrome doesn't apply a transform animation while it is still pending (the
 * frame before it starts), even with fill: backwards, so the end state would
 * flash for one frame. Hold the start state inline until the run takes over,
 * and drop the hold the moment it finishes or is cancelled.
 */
function grow(el: HTMLElement | SVGElement, from: 'scaleX(0)' | 'scaleY(0)') {
  for (const a of el.getAnimations()) a.cancel()
  // the end value must be the same function as the start: scaleX(0) -> matrix()
  // can't be decomposed (scale 0 is singular) and would jump halfway instead
  const r = parseFloat(getComputedStyle(el).getPropertyValue('--r'))
  const to = from === 'scaleX(0)' ? `scaleX(${Number.isFinite(r) ? r : 1})` : 'scaleY(1)'
  el.style.transform = from
  const run = el.animate([{ transform: from }, { transform: to }], {
    duration: 300,
    easing: 'ease-out',
    // holds the end value only until onfinish clears the inline hold
    fill: 'forwards',
  })
  run.oncancel = () => {
    el.style.transform = ''
  }
  run.onfinish = () => {
    el.style.transform = ''
    run.cancel()
  }
}

/** Short opacity-only cross-fade when the period changes; no layout shift. */
export function useFadeOnChange(ref: RefObject<HTMLElement | null>, key: unknown) {
  const first = useRef(true)
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = ref.current
    if (!el || reducedMotion()) return
    restart(el, [{ opacity: 0.25 }, { opacity: 1 }], { duration: 150, easing: 'ease-out', fill: 'backwards' })
  }, [key, ref])
}

/** A gentle one-off pulse (Copy list -> Copied). */
export function pulse(el: Element | null) {
  if (!el || reducedMotion()) return
  restart(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], {
    duration: 300,
    easing: 'ease-out',
  })
}

/**
 * Keeps an element mounted through its exit transition.
 * Returns [mounted, open]: render while `mounted`; set data-open from `open`.
 * Re-opening during the exit cancels it.
 */
export function usePresence(show: boolean, exitMs: number): [boolean, boolean] {
  const [mounted, setMounted] = useState(show)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (show) {
      setMounted(true)
      // next frame, so the closed state paints first and the entry transitions
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
      return () => cancelAnimationFrame(id)
    }
    setOpen(false)
    const id = setTimeout(() => setMounted(false), reducedMotion() ? 0 : exitMs)
    return () => clearTimeout(id)
  }, [show, exitMs])
  return [mounted, open]
}

/* ---------- press feedback ---------- */

const PRESSABLE = '.btn, .chips button, .segmented button, a.rank-row, .mix-more'
/** a touch that starts a scroll is cancelled well before this */
const PRESS_DELAY_MS = 80
const MOVE_SLOP_PX = 6

/**
 * Scale-on-press for buttons, period pills, segments and Mixes rows. Done in
 * JS rather than :active so that a touch that turns into a scroll never
 * scales the row under the finger: the state waits a beat, and any movement
 * or pointercancel (the browser taking over to scroll) drops it.
 */
export function initPressFeedback(): void {
  let el: HTMLElement | null = null
  let timer = 0
  let startX = 0
  let startY = 0

  const release = (flash: boolean) => {
    clearTimeout(timer)
    const target = el
    el = null
    if (!target) return
    if (flash && !target.classList.contains('is-pressed')) {
      // a quick tap: show the press briefly so the tap still registers visually
      target.classList.add('is-pressed')
      setTimeout(() => target.classList.remove('is-pressed'), 110)
    } else {
      target.classList.remove('is-pressed')
    }
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return
      const target = (e.target as Element | null)?.closest<HTMLElement>(PRESSABLE)
      if (!target || (target as HTMLButtonElement).disabled) return
      release(false)
      el = target
      startX = e.clientX
      startY = e.clientY
      timer = window.setTimeout(() => el?.classList.add('is-pressed'), PRESS_DELAY_MS)
    },
    { passive: true },
  )
  document.addEventListener(
    'pointermove',
    (e) => {
      if (el && Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_SLOP_PX) release(false)
    },
    { passive: true },
  )
  document.addEventListener('pointerup', () => release(true), { passive: true })
  document.addEventListener('pointercancel', () => release(false), { passive: true })
  document.addEventListener('scroll', () => release(false), { passive: true, capture: true })
}
