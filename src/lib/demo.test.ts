import { describe, expect, it } from 'vitest'
import { DEMO_DAYS, DEMO_ID_PREFIX, generateDemoPlays } from './demo'
import { buildMixes } from './affinity'
import { DAY_MS, streaks, topAlbums, topArtists, totals } from './stats'

// mid-afternoon, so "today" already has listening in it
const NOW = new Date(2026, 10, 11, 16, 30).getTime()

describe('demo data generator', () => {
  const plays = generateDemoPlays(NOW)

  it('is deterministic for the same clock and seed', () => {
    const again = generateDemoPlays(NOW)
    expect(again.length).toBe(plays.length)
    expect(again.slice(0, 50)).toEqual(plays.slice(0, 50))
  })

  it('changes with the seed', () => {
    const other = generateDemoPlays(NOW, 1)
    expect(other.slice(0, 20)).not.toEqual(plays.slice(0, 20))
  })

  it('spans about six months and never runs into the future', () => {
    expect(plays.length).toBeGreaterThan(2000)
    const newest = plays[0].ts
    const oldest = plays[plays.length - 1].ts
    expect(newest).toBeLessThanOrEqual(NOW)
    expect(NOW - oldest).toBeGreaterThan((DEMO_DAYS - 10) * DAY_MS)
    expect(NOW - oldest).toBeLessThan((DEMO_DAYS + 1) * DAY_MS)
  })

  it('is sorted newest first with unique demo ids', () => {
    for (let i = 1; i < plays.length; i++) expect(plays[i - 1].ts).toBeGreaterThanOrEqual(plays[i].ts)
    const ids = new Set(plays.map((p) => p.id))
    expect(ids.size).toBe(plays.length)
    expect(plays.every((p) => p.id.startsWith(DEMO_ID_PREFIX))).toBe(true)
  })

  it('includes skip events that are short and excluded from totals', () => {
    const skips = plays.filter((p) => p.skip)
    expect(skips.length).toBeGreaterThan(50)
    expect(skips.every((p) => p.ms < 30_000)).toBe(true)
    const t = totals(plays, new Map())
    expect(t.plays).toBe(plays.length - skips.length)
    expect(t.estimated).toBe(false)
  })

  it('fills every screen: tops, albums, all four mixes, a live streak', () => {
    expect(topArtists(plays, new Map()).length).toBeGreaterThanOrEqual(15)
    expect(topAlbums(plays, new Map()).length).toBeGreaterThanOrEqual(15)
    const mixes = buildMixes(plays, new Map(), NOW)
    expect(mixes.map((m) => m.key)).toEqual(['heavy', 'rise', 'flames', 'noskips'])
    expect(streaks(plays, NOW).current).toBeGreaterThanOrEqual(14)
  })

  it('works when generated in the small hours (today still empty)', () => {
    const early = new Date(2026, 10, 12, 3, 5).getTime()
    const p = generateDemoPlays(early)
    expect(p[0].ts).toBeLessThanOrEqual(early)
    expect(streaks(p, early).current).toBeGreaterThanOrEqual(14)
  })
})
