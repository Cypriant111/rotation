import { describe, expect, it } from 'vitest'
import type { DurationMap, Play } from './types'
import { DEFAULT_TRACK_MS, durationKey, resolvePlayMs } from './types'
import {
  dayKey,
  daySeries,
  hourMatrix,
  localDayStart,
  monthRange,
  periodStart,
  streaks,
  topArtists,
  topTracks,
  totals,
} from './stats'
import {
  buildArtistIndex,
  buildDedupeIndex,
  countsAsPlay,
  dedupeKey,
  detectKind,
  parseDailyTracksRow,
  parsePlayActivityRow,
} from './csv'
import { parseRecentTrack } from './lastfm'

const noDur: DurationMap = new Map()

function play(over: Partial<Play>): Play {
  return {
    id: over.id ?? `t:${Math.random()}`,
    ts: over.ts ?? Date.UTC(2026, 6, 15, 12, 0, 0),
    track: over.track ?? 'Song A',
    artist: over.artist ?? 'Artist X',
    album: over.album ?? 'Album 1',
    ms: over.ms ?? 200_000,
    source: over.source ?? 'csv',
    ...(over.off !== undefined ? { off: over.off } : {}),
  }
}

describe('resolvePlayMs', () => {
  it('uses real ms when present', () => {
    expect(resolvePlayMs(play({ ms: 123 }), noDur)).toBe(123)
  })
  it('falls back to duration map, then default', () => {
    const durations: DurationMap = new Map([[durationKey('Artist X', 'Song A'), 180_000]])
    expect(resolvePlayMs(play({ ms: 0 }), durations)).toBe(180_000)
    expect(resolvePlayMs(play({ ms: 0, track: 'Other' }), durations)).toBe(DEFAULT_TRACK_MS)
  })
  it('duration key matching is case- and diacritic-insensitive', () => {
    const durations: DurationMap = new Map([[durationKey('Beyoncé', 'HALO'), 60_000]])
    expect(resolvePlayMs(play({ ms: 0, artist: 'beyonce', track: 'Halo' }), durations)).toBe(60_000)
  })
})

describe('totals', () => {
  it('counts uniques and sums ms', () => {
    const t = totals(
      [
        play({ ms: 100, artist: 'A', track: 'x' }),
        play({ ms: 200, artist: 'a', track: 'y' }), // same artist, case-insensitive
        play({ ms: 300, artist: 'B', track: 'x' }),
      ],
      noDur,
    )
    expect(t.plays).toBe(3)
    expect(t.ms).toBe(600)
    expect(t.artists).toBe(2)
    expect(t.tracks).toBe(3) // per-artist tracks
    expect(t.estimated).toBe(false)
  })
  it('flags estimates when ms unknown', () => {
    expect(totals([play({ ms: 0 })], noDur).estimated).toBe(true)
  })
  it('handles empty input', () => {
    const t = totals([], noDur)
    expect(t.plays).toBe(0)
    expect(t.ms).toBe(0)
  })
})

describe('daySeries', () => {
  it('zero-fills missing days and buckets by local day', () => {
    const now = new Date(2026, 6, 10, 18, 0).getTime()
    const from = new Date(2026, 6, 8, 0, 0).getTime()
    const series = daySeries(
      [
        play({ ts: new Date(2026, 6, 8, 9, 0).getTime(), ms: 60_000 }),
        play({ ts: new Date(2026, 6, 8, 22, 0).getTime(), ms: 60_000 }),
        play({ ts: new Date(2026, 6, 10, 1, 0).getTime(), ms: 30_000 }),
      ],
      from,
      noDur,
      now,
    )
    expect(series).toHaveLength(3)
    expect(series[0].ms).toBe(120_000)
    expect(series[0].plays).toBe(2)
    expect(series[1].ms).toBe(0)
    expect(series[2].plays).toBe(1)
  })
})

describe('top lists', () => {
  it('ranks artists by plays then ms', () => {
    const items = topArtists(
      [
        play({ artist: 'A', ms: 100 }),
        play({ artist: 'B', ms: 500 }),
        play({ artist: 'B', ms: 500 }),
        play({ artist: 'C', ms: 9000 }),
      ],
      noDur,
    )
    expect(items[0].name).toBe('B')
    expect(items[0].plays).toBe(2)
    expect(items[1].name).toBe('C') // ties on plays broken by ms
  })
  it('groups tracks per artist', () => {
    const items = topTracks(
      [
        play({ artist: 'A', track: 'Same' }),
        play({ artist: 'B', track: 'Same' }),
      ],
      noDur,
    )
    expect(items).toHaveLength(2)
  })
})

describe('hourMatrix', () => {
  it('uses stored UTC offset when present', () => {
    // 23:30 UTC with +120min offset = 01:30 next local day
    const p = play({ ts: Date.UTC(2026, 6, 15, 23, 30), off: 120, ms: 60_000 })
    const m = hourMatrix([p], noDur)
    // Jul 15 2026 is a Wednesday; +2h pushes to Thursday 01:00 bucket
    expect(m[3][1]).toBe(60_000)
  })
})

describe('localDayStart with offset', () => {
  it('shifts across midnight correctly', () => {
    const p = play({ ts: Date.UTC(2026, 6, 15, 23, 30), off: 120 })
    const d = new Date(localDayStart(p))
    expect(d.getUTCDate()).toBe(16)
  })

  it('offset and offset-less plays on the same local day share one day key', () => {
    // a Last.fm play at browser-local Jul 15 10:00
    const localTs = new Date(2026, 6, 15, 10, 0).getTime()
    const lastfmPlay = play({ ts: localTs })
    // a CSV play whose play-local calendar date is also Jul 15
    const csvPlay = play({ ts: Date.UTC(2026, 6, 15, 10, 0), off: 0 })
    expect(localDayStart(lastfmPlay)).toBe(Date.UTC(2026, 6, 15))
    expect(localDayStart(csvPlay)).toBe(Date.UTC(2026, 6, 15))
    expect(localDayStart(lastfmPlay)).toBe(dayKey(localTs))
  })
})

describe('periodStart', () => {
  it('aligns to local calendar days: a 7-day window is exactly 7 whole days', () => {
    const now = new Date(2026, 6, 30, 15, 0).getTime()
    const from = periodStart('7d', now)
    expect(new Date(from).getHours()).toBe(0)
    expect(new Date(from).getDate()).toBe(24) // 6 days before the 30th
    const series = daySeries([], from, noDur, now)
    expect(series).toHaveLength(7)
  })
})

describe('streaks', () => {
  const day = (d: number, h = 10) => play({ ts: new Date(2026, 6, d, h).getTime() })
  it('computes current and longest', () => {
    const now = new Date(2026, 6, 10, 12).getTime()
    const s = streaks([day(3), day(4), day(5), day(9), day(10)], now)
    expect(s.longest).toBe(3)
    expect(s.current).toBe(2)
  })
  it('keeps streak alive if today not yet played', () => {
    const now = new Date(2026, 6, 10, 8).getTime()
    const s = streaks([day(8), day(9)], now)
    expect(s.current).toBe(2)
  })
  it('empty input', () => {
    expect(streaks([], Date.now())).toEqual({ current: 0, longest: 0 })
  })
})

describe('monthRange', () => {
  it('labels and bounds a month', () => {
    const now = new Date(2026, 6, 30, 12).getTime()
    const r = monthRange(0, now)
    expect(r.label).toBe('July 2026')
    expect(new Date(r.from).getDate()).toBe(1)
    const prev = monthRange(-1, now)
    expect(prev.label).toBe('June 2026')
  })
})

describe('csv helpers', () => {
  it('countsAsPlay thresholds', () => {
    expect(countsAsPlay(30_000, 0)).toBe(true)
    expect(countsAsPlay(29_999, 0)).toBe(false)
    expect(countsAsPlay(20_000, 40_000)).toBe(true) // half the track
    expect(countsAsPlay(10_000, 40_000)).toBe(false)
  })
  it('detectKind recognizes both files and rejects others', () => {
    expect(
      detectKind(['Track Description', 'Date Played', 'Play Count', 'Play Duration Milliseconds']),
    ).toBe('daily-tracks')
    expect(
      detectKind(['Song Name', 'Event Type', 'Event Start Timestamp', 'Play Duration Milliseconds']),
    ).toBe('play-activity')
    expect(detectKind(['Name', 'Email'])).toBe('unknown')
  })
  it('dedupe keys bucket to 5 minutes and neighbors match via index', () => {
    const base = play({ artist: 'A', track: 'T', ts: 1_000_000_000 })
    const index = buildDedupeIndex([base])
    expect(index.has(dedupeKey('a', 't', base.ts + 200_000))).toBe(true)
    expect(index.has(dedupeKey('a', 't', base.ts + 3_600_000))).toBe(false)
  })
  it('artist index recovers titles', () => {
    const idx = buildArtistIndex([play({ artist: 'Radiohead', track: 'Weird Fishes' })])
    expect(idx.get('weird fishes')).toBe('Radiohead')
  })
})

describe('csv row parsers', () => {
  const dailyMap = {
    trackDescription: 'Track Description',
    datePlayed: 'Date Played',
    hours: 'Hours',
    playMs: 'Play Duration Milliseconds',
    playCount: 'Play Count',
  }
  const dailyRow = {
    'Track Description': 'Fontaines D.C. - Starburster',
    'Date Played': '20260715',
    Hours: '18, 19',
    'Play Duration Milliseconds': '400000',
    'Play Count': '2',
  }

  it('daily row expands to Play Count plays, splitting the row-total duration', () => {
    const plays = parseDailyTracksRow(dailyRow, dailyMap, new Map(), 1)
    expect(plays).toHaveLength(2)
    expect(plays[0].artist).toBe('Fontaines D.C.')
    expect(plays[0].track).toBe('Starburster')
    expect(plays[0].ms + plays[1].ms).toBe(400_000)
  })

  it('skip-only rows (Play Count 0) produce no plays', () => {
    expect(
      parseDailyTracksRow({ ...dailyRow, 'Play Count': '0' }, dailyMap, new Map(), 1),
    ).toHaveLength(0)
  })

  it('identical rollup rows get distinct ids via the row sequence', () => {
    const a = parseDailyTracksRow(dailyRow, dailyMap, new Map(), 1)
    const b = parseDailyTracksRow(dailyRow, dailyMap, new Map(), 2)
    expect(a[0].id).not.toBe(b[0].id)
  })

  const activityMap = {
    track: 'Song Name',
    artist: 'Artist Name',
    playMs: 'Play Duration Milliseconds',
    mediaMs: 'Media Duration In Milliseconds',
    eventStart: 'Event Start Timestamp',
    eventType: 'Event Type',
    endReason: 'End Reason Type',
    utcOffsetS: 'UTC Offset In Seconds',
  }
  const activityRow = {
    'Song Name': 'Romance',
    'Artist Name': 'Fontaines D.C.',
    'Play Duration Milliseconds': '210000',
    'Media Duration In Milliseconds': '225000',
    'Event Start Timestamp': '2026-07-15T18:30:00.000Z',
    'Event Type': 'PLAY_END',
    'UTC Offset In Seconds': '7200',
  }

  it('activity rows parse with the play-time offset in minutes', () => {
    const p = parsePlayActivityRow(activityRow, activityMap, new Map())
    expect(p?.off).toBe(120)
    expect(p?.ms).toBe(210_000)
  })

  it('blank UTC offset stays unknown instead of becoming UTC', () => {
    const p = parsePlayActivityRow(
      { ...activityRow, 'UTC Offset In Seconds': '' },
      activityMap,
      new Map(),
    )
    expect(p?.off).toBeUndefined()
  })

  it('PLAY_START rows are not counted', () => {
    expect(
      parsePlayActivityRow({ ...activityRow, 'Event Type': 'PLAY_START' }, activityMap, new Map()),
    ).toBeNull()
  })

  it('cut-short skipped tracks become skip events, other short stops are dropped', () => {
    const short = {
      ...activityRow,
      'Play Duration Milliseconds': '9000',
      'End Reason Type': 'TRACK_SKIPPED_FORWARDS',
    }
    const skip = parsePlayActivityRow(short, activityMap, new Map())
    expect(skip?.skip).toBe(true)
    expect(skip?.id.startsWith('csvs:')).toBe(true)

    const paused = { ...short, 'End Reason Type': 'PLAYBACK_MANUALLY_PAUSED' }
    expect(parsePlayActivityRow(paused, activityMap, new Map())).toBeNull()

    // a full listen that ends with a skip near the end is still a play
    const lateSkip = { ...activityRow, 'End Reason Type': 'TRACK_SKIPPED_FORWARDS' }
    expect(parsePlayActivityRow(lateSkip, activityMap, new Map())?.skip).toBeUndefined()
  })

  it('daily rows emit skip events, including skip-only rows', () => {
    const skipMap = { ...dailyMap, skipCount: 'Skip Count' }
    const skipOnly = parseDailyTracksRow(
      { ...dailyRow, 'Play Count': '0', 'Skip Count': '2' },
      skipMap,
      new Map(),
      1,
    )
    expect(skipOnly).toHaveLength(2)
    expect(skipOnly.every((r) => r.skip)).toBe(true)

    const mixed = parseDailyTracksRow({ ...dailyRow, 'Skip Count': '1' }, skipMap, new Map(), 1)
    expect(mixed.filter((r) => !r.skip)).toHaveLength(2)
    expect(mixed.filter((r) => r.skip)).toHaveLength(1)
  })

  it('skip events are excluded from listening totals', () => {
    const t = totals(
      [play({ ms: 100 }), { ...play({ ms: 0 }), skip: true as const }],
      noDur,
    )
    expect(t.plays).toBe(1)
    expect(t.ms).toBe(100)
  })
})

describe('lastfm parsing', () => {
  it('parses a scrobble and skips now-playing', () => {
    const p = parseRecentTrack({
      name: 'Song',
      artist: { '#text': 'Artist' },
      album: { '#text': 'Album' },
      date: { uts: '1753800000' },
    })
    expect(p?.ts).toBe(1_753_800_000_000)
    expect(p?.source).toBe('lastfm')
    expect(
      parseRecentTrack({ name: 'Song', artist: { '#text': 'A' }, '@attr': { nowplaying: 'true' } }),
    ).toBeNull()
  })
  it('handles extended artist objects', () => {
    const p = parseRecentTrack({
      name: 'Song',
      artist: { name: 'Extended Artist' },
      date: { uts: '1753800000' },
    })
    expect(p?.artist).toBe('Extended Artist')
  })
})
