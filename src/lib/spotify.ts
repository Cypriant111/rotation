import type { Play } from './types'
import { norm } from './types'
import { dedupeKey, hash } from './csv'

/**
 * Spotify privacy export -> Play[].
 *
 * Two shapes, both JSON arrays (field names checked against open parsers of
 * real exports; Spotify's own page only says the times are UTC):
 *
 *  - Extended streaming history, `Streaming_History_Audio_*.json` (older:
 *    `endsong_*.json`): `ts` (ISO, UTC, when the stream ENDED), `ms_played`,
 *    `master_metadata_track_name`, `master_metadata_album_artist_name`,
 *    `master_metadata_album_album_name`, `reason_end`, `skipped`
 *    (true/false/null). Podcasts and audiobooks have null track names.
 *  - Account data, past year only, `StreamingHistory_music_*.json` (older:
 *    `StreamingHistory*.json`): `endTime` ("YYYY-MM-DD HH:MM", UTC),
 *    `artistName`, `trackName`, `msPlayed`. No skip information at all.
 *
 * Rules: a play counts from 30 s, as for the other sources. Start = end
 * minus ms played. A shorter row is a skip event when `skipped` is true or
 * `reason_end` is "fwdbtn" (moved on to the next track); anything else that
 * short (paused and closed, errors) is dropped.
 */

export const MIN_PLAY_MS = 30_000
const SKIP_REASONS = new Set(['fwdbtn'])
// streaming history before Spotify's own launch is noise
const MIN_TS = Date.UTC(2008, 0, 1)

export type SpotifyKind = 'extended' | 'account'

type Rec = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v)) || 0

export function detectSpotifyKind(sample: unknown): SpotifyKind | null {
  if (!sample || typeof sample !== 'object') return null
  const r = sample as Rec
  if ('ts' in r && 'ms_played' in r) return 'extended'
  if ('endTime' in r && 'msPlayed' in r) return 'account'
  return null
}

function makePlay(
  artist: string,
  track: string,
  album: string,
  endTs: number,
  ms: number,
  skip: boolean,
  noSkipData: boolean,
): Play {
  const ts = endTs - ms
  return {
    id: `${skip ? 'spts' : 'spt'}:${ts}:${hash(norm(artist) + '\0' + norm(track))}`,
    ts,
    track,
    artist: artist || 'Unknown Artist',
    album,
    ms,
    ...(skip ? { skip: true as const } : {}),
    ...(noSkipData ? { noSkipData: true as const } : {}),
    source: 'spotify',
  }
}

export function parseExtendedRow(r: Rec): Play | null {
  const track = str(r.master_metadata_track_name)
  if (!track) return null // podcast episode, audiobook, or a row without metadata
  const end = Date.parse(str(r.ts))
  if (!Number.isFinite(end) || end < MIN_TS) return null
  const ms = Math.max(0, num(r.ms_played))
  if (ms <= 0) return null
  const isPlay = ms >= MIN_PLAY_MS
  const isSkip = !isPlay && (r.skipped === true || SKIP_REASONS.has(str(r.reason_end)))
  if (!isPlay && !isSkip) return null
  return makePlay(
    str(r.master_metadata_album_artist_name),
    track,
    str(r.master_metadata_album_album_name),
    end,
    ms,
    isSkip,
    false,
  )
}

/** "2023-01-15 21:33" (UTC) -> epoch ms */
export function parseAccountTime(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim())
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0)
}

export function parseAccountRow(r: Rec): Play | null {
  const track = str(r.trackName)
  if (!track) return null
  const end = parseAccountTime(str(r.endTime))
  if (!Number.isFinite(end) || end < MIN_TS) return null
  const ms = Math.max(0, num(r.msPlayed))
  // this format can't tell a skip from a pause, so short rows are just dropped
  if (ms < MIN_PLAY_MS) return null
  return makePlay(str(r.artistName), track, '', end, ms, false, true)
}

export interface SpotifyImportResult {
  files: number
  imported: number
  skipEvents: number
  duplicates: number
  /** podcast/audiobook rows, too-short rows, rows without a time */
  ignored: number
  kinds: SpotifyKind[]
  firstTs: number | null
  lastTs: number | null
}

/**
 * Parses already-loaded JSON arrays (one per file). `existing` holds dedupe
 * keys of plays already stored (Last.fm, Apple CSV, earlier Spotify imports)
 * and grows as rows are accepted, so overlapping files don't double-count.
 */
export function parseSpotifyFiles(
  arrays: { name: string; data: unknown }[],
  existing: Set<string>,
  artistKey: (a: string) => string = norm,
): { plays: Play[]; result: SpotifyImportResult } {
  const plays: Play[] = []
  const result: SpotifyImportResult = {
    files: arrays.length,
    imported: 0,
    skipEvents: 0,
    duplicates: 0,
    ignored: 0,
    kinds: [],
    firstTs: null,
    lastTs: null,
  }
  for (const { name, data } of arrays) {
    if (!Array.isArray(data)) throw new Error(`${name} is not a Spotify streaming history file.`)
    if (data.length === 0) continue
    const kind = detectSpotifyKind(data[0])
    if (!kind) {
      throw new Error(
        `${name} doesn't look like Spotify listening history. Use the Streaming_History_Audio files (extended history) or StreamingHistory_music files (account data).`,
      )
    }
    if (!result.kinds.includes(kind)) result.kinds.push(kind)
    for (const row of data) {
      const p = row && typeof row === 'object' ? (kind === 'extended' ? parseExtendedRow(row as Rec) : parseAccountRow(row as Rec)) : null
      if (!p) {
        result.ignored++
        continue
      }
      if (!p.skip) {
        const k = dedupeKey(p.artist, p.track, p.ts, artistKey)
        if (existing.has(k)) {
          result.duplicates++
          continue
        }
        // mark this play's bucket and its neighbours, like buildDedupeIndex does
        const bucket = Math.round(p.ts / 300_000)
        const base = k.slice(0, k.lastIndexOf('|') + 1)
        existing.add(base + (bucket - 1))
        existing.add(base + bucket)
        existing.add(base + (bucket + 1))
        result.imported++
      } else {
        result.skipEvents++
      }
      plays.push(p)
      if (result.firstTs === null || p.ts < result.firstTs) result.firstTs = p.ts
      if (result.lastTs === null || p.ts > result.lastTs) result.lastTs = p.ts
    }
  }
  return { plays, result }
}
