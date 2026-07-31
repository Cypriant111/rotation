import { describe, expect, it } from 'vitest'
import type { DurationMap, Play } from './types'
import {
  aggregateTracks,
  buildMixes,
  completionFactor,
  heavyRotation,
  mixToText,
  noSkips,
  oldFlames,
  onTheRise,
} from './affinity'

const noDur: DurationMap = new Map()
const NOW = new Date(2026, 6, 31, 12).getTime()
const DAY = 86_400_000

let seq = 0
function p(track: string, daysAgo: number, over: Partial<Play> = {}): Play {
  return {
    id: `t:${seq++}`,
    ts: NOW - daysAgo * DAY,
    track,
    artist: over.artist ?? 'Artist',
    album: over.album ?? '',
    ms: over.ms ?? 200_000,
    source: 'csv',
    ...(over.skip ? { skip: true } : {}),
  }
}

/** n plays of a track, one per day starting `startDaysAgo` */
function daily(track: string, n: number, startDaysAgo: number, over: Partial<Play> = {}): Play[] {
  return Array.from({ length: n }, (_, i) => p(track, startDaysAgo + i, over))
}

describe('aggregateTracks', () => {
  it('separates plays from skips and counts distinct days', () => {
    const aggs = aggregateTracks(
      [p('X', 1), p('X', 1.01), p('X', 3), p('X', 5, { skip: true })],
      noDur,
      NOW,
    )
    expect(aggs).toHaveLength(1)
    expect(aggs[0].plays).toBe(3)
    expect(aggs[0].skips).toBe(1)
    expect(aggs[0].daysPlayed).toBe(2)
  })
})

describe('completionFactor', () => {
  it('smooths so one skip is not damning but a pattern is', () => {
    expect(completionFactor({ plays: 2, skips: 1 })).toBeGreaterThan(0.5)
    expect(completionFactor({ plays: 2, skips: 10 })).toBeLessThan(0.25)
    expect(completionFactor({ plays: 10, skips: 0 })).toBeGreaterThan(0.9)
  })
})

describe('heavyRotation', () => {
  it('prefers recent, spread-out, completed listening', () => {
    const plays = [
      ...daily('Recent Fav', 8, 1), // 8 plays, last week
      ...daily('Old Binge', 8, 50), // same count, 7 weeks ago
      ...daily('Skipper', 8, 1, { artist: 'B' }),
      ...Array.from({ length: 12 }, (_, i) => p('Skipper', 1 + i, { artist: 'B', skip: true })),
    ]
    const ranked = heavyRotation(aggregateTracks(plays, noDur, NOW))
    expect(ranked[0].name).toBe('Recent Fav')
    const names = ranked.map((t) => t.name)
    expect(names.indexOf('Recent Fav')).toBeLessThan(names.indexOf('Skipper'))
  })

  it('requires minimum recent activity and day spread', () => {
    const oneBinge = [p('Binge', 2), p('Binge', 2.01), p('Binge', 2.02)] // one day only
    expect(heavyRotation(aggregateTracks(oneBinge, noDur, NOW))).toHaveLength(0)
  })
})

describe('onTheRise', () => {
  it('detects a surge against a quiet baseline', () => {
    const plays = [
      ...daily('Surging', 6, 1), // 6 plays in the last week, nothing before
      ...daily('Steady', 4, 2, { artist: 'C' }),
      ...daily('Steady', 20, 20, { artist: 'C' }), // long steady history
    ]
    const ranked = onTheRise(aggregateTracks(plays, noDur, NOW), NOW)
    expect(ranked.map((t) => t.name)).toContain('Surging')
    expect(ranked.map((t) => t.name)).not.toContain('Steady')
  })
})

describe('oldFlames', () => {
  it('finds heavily played tracks gone quiet', () => {
    const plays = [
      ...daily('Dormant Fav', 12, 90),
      ...daily('Current Fav', 12, 1),
      ...daily('Barely Played', 3, 90, { artist: 'D' }),
    ]
    const names = oldFlames(aggregateTracks(plays, noDur, NOW), NOW).map((t) => t.name)
    expect(names).toContain('Dormant Fav')
    expect(names).not.toContain('Current Fav')
    expect(names).not.toContain('Barely Played')
  })
})

describe('noSkips', () => {
  it('only includes never-skipped tracks with enough plays', () => {
    const plays = [
      ...daily('Clean', 6, 1),
      ...daily('Skipped Once', 6, 1, { artist: 'E' }),
      p('Skipped Once', 3, { artist: 'E', skip: true }),
      ...daily('Thin', 2, 1, { artist: 'F' }),
    ]
    const names = noSkips(aggregateTracks(plays, noDur, NOW)).map((t) => t.name)
    expect(names).toContain('Clean')
    expect(names).not.toContain('Skipped Once')
    expect(names).not.toContain('Thin')
  })
})

describe('buildMixes', () => {
  it('drops mixes with under 5 tracks and gates No Skips on skip data', () => {
    // 6 distinct recent favorites, no skip data at all
    const plays = Array.from({ length: 6 }, (_, k) =>
      daily(`Song ${k}`, 6, 1, { artist: `A${k}` }),
    ).flat()
    const mixes = buildMixes(plays, noDur, NOW)
    expect(mixes.map((m) => m.key)).toContain('heavy')
    expect(mixes.map((m) => m.key)).not.toContain('noskips')

    const withSkips = buildMixes([...plays, p('Song 0', 2, { artist: 'A0', skip: true })], noDur, NOW)
    expect(withSkips.map((m) => m.key)).toContain('noskips')
  })

  it('mixToText emits importer-friendly lines', () => {
    const plays = Array.from({ length: 6 }, (_, k) =>
      daily(`Song ${k}`, 6, 1, { artist: `A${k}` }),
    ).flat()
    const mixes = buildMixes(plays, noDur, NOW)
    const text = mixToText(mixes[0])
    expect(text.split('\n')[0]).toMatch(/^A\d - Song \d$/)
  })
})
