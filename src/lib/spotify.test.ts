import { describe, expect, it } from 'vitest'
import type { Play } from './types'
import { detectSpotifyKind, parseAccountRow, parseAccountTime, parseExtendedRow, parseSpotifyFiles } from './spotify'
import { buildDedupeIndex } from './csv'
import { aggregateTracks, noSkips } from './affinity'

/** synthetic extended-history row, shaped like Streaming_History_Audio_*.json */
function ext(over: Record<string, unknown> = {}) {
  return {
    ts: '2024-03-02T20:15:30Z',
    platform: 'ios',
    ms_played: 200_000,
    conn_country: 'PL',
    master_metadata_track_name: 'Kiss cam',
    master_metadata_album_artist_name: 'Mata',
    master_metadata_album_album_name: 'Kiss cam - Single',
    spotify_track_uri: 'spotify:track:xyz',
    episode_name: null,
    episode_show_name: null,
    spotify_episode_uri: null,
    reason_start: 'trackdone',
    reason_end: 'trackdone',
    shuffle: false,
    skipped: false,
    offline: false,
    offline_timestamp: null,
    incognito_mode: false,
    ...over,
  }
}

/** synthetic account-data row, shaped like StreamingHistory_music_*.json */
function acct(over: Record<string, unknown> = {}) {
  return { endTime: '2024-03-02 20:15', artistName: 'Mata', trackName: 'Kiss cam', msPlayed: 200_000, ...over }
}

describe('detectSpotifyKind', () => {
  it('tells the two formats apart and rejects other JSON', () => {
    expect(detectSpotifyKind(ext())).toBe('extended')
    expect(detectSpotifyKind(acct())).toBe('account')
    expect(detectSpotifyKind({ podcastName: 'x', endTime: 'y' })).toBeNull()
    expect(detectSpotifyKind(null)).toBeNull()
  })
})

describe('extended history rows', () => {
  it('treats ts as the END of playback: start = ts - ms_played', () => {
    const p = parseExtendedRow(ext())!
    expect(p.ts).toBe(Date.UTC(2024, 2, 2, 20, 15, 30) - 200_000)
    expect(p).toMatchObject({ track: 'Kiss cam', artist: 'Mata', album: 'Kiss cam - Single', ms: 200_000, source: 'spotify' })
    expect(p.skip).toBeUndefined()
  })

  it('counts a play from 30 s', () => {
    expect(parseExtendedRow(ext({ ms_played: 30_000 }))).not.toBeNull()
    expect(parseExtendedRow(ext({ ms_played: 29_999, reason_end: 'endplay', skipped: false }))).toBeNull()
  })

  it('a short row is a skip when skipped is true or the user pressed next', () => {
    expect(parseExtendedRow(ext({ ms_played: 5_000, skipped: true }))!.skip).toBe(true)
    expect(parseExtendedRow(ext({ ms_played: 5_000, skipped: null, reason_end: 'fwdbtn' }))!.skip).toBe(true)
    expect(parseExtendedRow(ext({ ms_played: 5_000, skipped: null, reason_end: 'logout' }))).toBeNull()
    // a long play flagged as skipped still counts as a listen
    expect(parseExtendedRow(ext({ ms_played: 150_000, skipped: true }))!.skip).toBeUndefined()
  })

  it('drops podcasts, audiobooks and broken rows', () => {
    expect(
      parseExtendedRow(
        ext({ master_metadata_track_name: null, master_metadata_album_artist_name: null, episode_name: 'Ep 1', episode_show_name: 'Show' }),
      ),
    ).toBeNull()
    expect(parseExtendedRow(ext({ ts: 'garbage' }))).toBeNull()
    expect(parseExtendedRow(ext({ ms_played: 0 }))).toBeNull()
  })

  it('gives stable ids, distinct for plays and skips', () => {
    expect(parseExtendedRow(ext())!.id).toBe(parseExtendedRow(ext())!.id)
    expect(parseExtendedRow(ext({ ms_played: 3_000, skipped: true }))!.id.startsWith('spts:')).toBe(true)
  })
})

describe('account-data rows', () => {
  it('parses endTime as UTC minutes', () => {
    expect(parseAccountTime('2024-03-02 20:15')).toBe(Date.UTC(2024, 2, 2, 20, 15))
    expect(parseAccountTime('nope')).toBeNaN()
  })
  it('counts from 30 s, never invents skips, and is marked as having no skip data', () => {
    const p = parseAccountRow(acct())!
    expect(p.ts).toBe(Date.UTC(2024, 2, 2, 20, 15) - 200_000)
    expect(p.noSkipData).toBe(true)
    expect(parseAccountRow(acct({ msPlayed: 4_000 }))).toBeNull()
    expect(parseAccountRow(acct({ trackName: '' }))).toBeNull()
  })
})

describe('parseSpotifyFiles', () => {
  it('reads several files, dedupes overlaps and plays already stored', () => {
    const lastfm: Play = {
      id: 'lfm:1',
      ts: Date.UTC(2024, 2, 2, 20, 15, 30) - 200_000 + 40_000, // Last.fm stamp, a little off
      track: 'Kiss cam',
      artist: 'Mata',
      album: '',
      ms: 0,
      source: 'lastfm',
    }
    const existing = buildDedupeIndex([lastfm])
    const { plays, result } = parseSpotifyFiles(
      [
        {
          name: 'Streaming_History_Audio_2024_0.json',
          data: [
            ext(), // already scrobbled -> duplicate
            ext({ ts: '2024-03-03T10:00:00Z', master_metadata_track_name: 'Patointeligencja' }),
            ext({ ts: '2024-03-03T10:05:00Z', ms_played: 4_000, skipped: true }),
            ext({ master_metadata_track_name: null, episode_name: 'Podcast' }),
          ],
        },
        // the yearly file repeats the same Patointeligencja play, minute precision
        { name: 'StreamingHistory_music_0.json', data: [acct({ endTime: '2024-03-03 10:00', trackName: 'Patointeligencja' })] },
      ],
      existing,
    )
    expect(result).toMatchObject({ files: 2, imported: 1, skipEvents: 1, duplicates: 2, ignored: 1 })
    expect(result.kinds).toEqual(['extended', 'account'])
    expect(plays.map((p) => p.track)).toEqual(['Patointeligencja', 'Kiss cam'])
  })

  it('explains what is wrong with a file that is not listening history', () => {
    expect(() => parseSpotifyFiles([{ name: 'Userdata.json', data: [{ username: 'x' }] }], new Set())).toThrow(/Streaming_History_Audio/)
    expect(() => parseSpotifyFiles([{ name: 'Userdata.json', data: { username: 'x' } }], new Set())).toThrow()
  })
})

describe('No Skips with Spotify', () => {
  const NOW = Date.UTC(2024, 5, 1)
  it('counts extended-history plays but not yearly-file plays', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ext({ ts: `2024-05-0${i + 1}T10:00:00Z` }))
    const fromExtended = rows.map((r) => parseExtendedRow(r)!)
    const fromAccount = Array.from({ length: 5 }, (_, i) => parseAccountRow(acct({ endTime: `2024-05-0${i + 1} 10:00` }))!)
    expect(noSkips(aggregateTracks(fromExtended, new Map(), NOW))).toHaveLength(1)
    expect(noSkips(aggregateTracks(fromAccount, new Map(), NOW))).toHaveLength(0)
  })
})
