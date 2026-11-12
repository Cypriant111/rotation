import { describe, expect, it } from 'vitest'
import type { Play } from './types'
import { longestRun, monthRange, periodStreak, yearRange } from './stats'
import { aggregateTracks, buildMixes, noSkips } from './affinity'

const NOW = new Date(2026, 10, 12, 18).getTime()
const DAY = 86_400_000

let seq = 0
function at(daysAgo: number, over: Partial<Play> = {}): Play {
  return {
    id: `t:${seq++}`,
    ts: NOW - daysAgo * DAY,
    track: over.track ?? 'Song',
    artist: over.artist ?? 'Artist',
    album: '',
    ms: 200_000,
    source: over.source ?? 'csv',
    ...(over.skip ? { skip: true as const } : {}),
  }
}

describe('No Skips only trusts skip-aware sources', () => {
  it('ignores Last.fm plays, which never report skips', () => {
    const plays = [
      ...Array.from({ length: 9 }, (_, i) => at(i, { track: 'Scrobbled', source: 'lastfm' })),
      at(1, { track: 'Other', skip: true }), // some skip data exists
    ]
    expect(noSkips(aggregateTracks(plays, new Map(), NOW))).toHaveLength(0)
  })

  it('needs five plays from CSV with no skips at all', () => {
    const plays = [
      ...Array.from({ length: 4 }, (_, i) => at(i, { track: 'Four', source: 'csv' })),
      ...Array.from({ length: 6 }, (_, i) => at(i, { track: 'Four', source: 'lastfm' })),
      ...Array.from({ length: 5 }, (_, i) => at(i, { track: 'Five' })),
      ...Array.from({ length: 7 }, (_, i) => at(i, { track: 'Skipped' })),
      at(2, { track: 'Skipped', skip: true }),
    ]
    const names = noSkips(aggregateTracks(plays, new Map(), NOW)).map((t) => t.name)
    expect(names).toEqual(['Five'])
  })

  it('buildMixes keeps No Skips off when only Last.fm data exists', () => {
    const plays = Array.from({ length: 60 }, (_, i) => at(i % 20, { track: `T${i % 6}`, source: 'lastfm' }))
    expect(buildMixes(plays, new Map(), NOW).some((m) => m.key === 'noskips')).toBe(false)
  })
})

describe('periodStreak', () => {
  // listened every day for the last 5 days, and Oct 3..9 (7 days)
  const oct = (d: number) => new Date(2026, 9, d, 12).getTime()
  const plays: Play[] = [
    ...Array.from({ length: 5 }, (_, i) => at(i)),
    ...Array.from({ length: 7 }, (_, i) => ({ ...at(0), id: `o${i}`, ts: oct(3 + i) })),
    { ...at(0), id: 'o-late', ts: oct(20) },
  ]

  it('shows the live streak for a period that includes today', () => {
    expect(periodStreak(plays, monthRange(0, NOW), NOW)).toEqual({ value: 5, label: 'day streak' })
    expect(periodStreak(plays, yearRange(0, NOW), NOW)).toEqual({ value: 5, label: 'day streak' })
    expect(periodStreak(plays, { from: 0, to: Infinity }, NOW).label).toBe('day streak')
  })

  it('shows the best run inside a finished period', () => {
    expect(periodStreak(plays, monthRange(-1, NOW), NOW)).toEqual({ value: 7, label: 'best run' })
  })

  it('longestRun ignores skips', () => {
    expect(longestRun([at(1), at(2, { skip: true }), at(3)])).toBe(1)
    expect(longestRun([])).toBe(0)
  })
})
