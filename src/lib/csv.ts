import Papa from 'papaparse'
import type { Play } from './types'
import { norm } from './types'

/**
 * Apple Media Services privacy export -> Play[].
 *
 * Files supported (from "Apple Music Activity/" in the export):
 *  - "Apple Music - Play History Daily Tracks.csv"  RECOMMENDED: stable schema,
 *    full history since ~2015, play counts closest to Apple Music Replay.
 *  - "Apple Music Play Activity.csv"  per-event log; schema drifts yearly
 *    (Jan-2026 exports dropped the Artist Name column entirely).
 *
 * Header names shift across export vintages, so all lookups go through an
 * alias map keyed on normalized (lowercase, alphanumeric-only) header names,
 * which also neutralizes Apple's Unicode-apostrophe headers.
 */

type Field =
  | 'track'
  | 'artist'
  | 'containerArtist'
  | 'album'
  | 'playMs'
  | 'mediaMs'
  | 'eventStart'
  | 'eventEnd'
  | 'eventType'
  | 'endReason'
  | 'utcOffsetS'
  | 'mediaType'
  | 'trackDescription'
  | 'datePlayed'
  | 'hours'
  | 'playCount'
  | 'skipCount'

const ALIASES: Record<Field, string[]> = {
  track: ['songname', 'contentname', 'trackname', 'title'],
  artist: ['artistname'],
  containerArtist: ['containerartistname'],
  album: ['albumname', 'containeralbumname'],
  playMs: ['playdurationmilliseconds'],
  mediaMs: ['mediadurationinmilliseconds'],
  eventStart: ['eventstarttimestamp', 'eventtimestamp'],
  eventEnd: ['eventendtimestamp', 'eventreceivedtimestamp'],
  eventType: ['eventtype'],
  endReason: ['endreasontype'],
  utcOffsetS: ['utcoffsetinseconds'],
  mediaType: ['mediatype'],
  trackDescription: ['trackdescription'],
  datePlayed: ['dateplayed'],
  hours: ['hours'],
  playCount: ['playcount'],
  skipCount: ['skipcount'],
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function buildHeaderMap(headers: string[]): Partial<Record<Field, string>> {
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]))
  const map: Partial<Record<Field, string>> = {}
  for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
    for (const a of aliases) {
      const original = byNorm.get(a)
      if (original !== undefined) {
        map[field] = original
        break
      }
    }
  }
  return map
}

export type CsvKind = 'play-activity' | 'daily-tracks' | 'unknown'

export function detectKind(headers: string[]): CsvKind {
  const m = buildHeaderMap(headers)
  if (m.trackDescription && m.datePlayed) return 'daily-tracks'
  if (m.playMs && (m.eventStart || m.eventEnd)) return 'play-activity'
  return 'unknown'
}

/** Scrobble-style keep rule: >=30s listened, or >=50% of the track. */
export function countsAsPlay(playMs: number, mediaMs: number): boolean {
  if (playMs >= 30_000) return true
  if (mediaMs > 0 && playMs >= mediaMs / 2) return true
  return false
}

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

interface Row {
  [key: string]: string
}

// Apple Music predates 2015; anything older is iTunes-era noise
const MIN_TS = Date.UTC(2013, 0, 1)

export function parsePlayActivityRow(
  row: Row,
  m: Partial<Record<Field, string>>,
  knownArtists: Map<string, string>,
): Play | null {
  if (m.eventType) {
    const et = row[m.eventType]
    // one listen emits PLAY_START + PLAY_END (+ LYRIC_DISPLAY); count PLAY_END only.
    // Old exports use bare "PLAY"; pre-2020 exports lack the column entirely.
    if (et !== 'PLAY_END' && et !== 'PLAY') return null
  }
  if (m.mediaType && row[m.mediaType] && row[m.mediaType] !== 'AUDIO') return null

  const track = (m.track ? row[m.track] : '').trim()
  if (!track) return null

  let artist = (m.artist ? row[m.artist] : '').trim()
  if (!artist && m.containerArtist) artist = (row[m.containerArtist] ?? '').trim()
  if (!artist) artist = knownArtists.get(norm(track)) ?? ''

  const playMs = Number(m.playMs ? row[m.playMs] : 0) || 0
  const mediaMs = Number(m.mediaMs ? row[m.mediaMs] : 0) || 0
  if (playMs <= 0 || !countsAsPlay(playMs, mediaMs)) return null

  const startRaw = m.eventStart ? row[m.eventStart] : ''
  const endRaw = m.eventEnd ? row[m.eventEnd] : ''
  let ts = Date.parse(startRaw)
  if (!Number.isFinite(ts)) {
    const end = Date.parse(endRaw)
    ts = Number.isFinite(end) ? end - Math.max(0, playMs) : NaN
  }
  if (!Number.isFinite(ts) || ts < MIN_TS) return null

  // Number('') is 0, which would wrongly pin blank-offset rows to UTC
  const offRaw = (m.utcOffsetS ? (row[m.utcOffsetS] ?? '') : '').trim()
  const offS = offRaw === '' ? NaN : Number(offRaw)
  // Play Duration can exceed track length (repeats/stitched pauses); clamp
  const ms = Math.min(playMs, mediaMs > 0 ? mediaMs : playMs, 4 * 3_600_000)

  return {
    id: `csv:${ts}:${hash(norm(artist) + ' ' + norm(track))}`,
    ts,
    track,
    artist: artist || 'Unknown Artist',
    album: (m.album ? row[m.album] : '').trim(),
    ms,
    ...(Number.isFinite(offS) ? { off: Math.round(offS / 60) } : {}),
    source: 'csv' as const,
  }
}

export function parseDailyTracksRow(
  row: Row,
  m: Partial<Record<Field, string>>,
  knownArtists: Map<string, string>,
  rowSeq: number,
): Play[] {
  if (m.mediaType && row[m.mediaType] && row[m.mediaType] !== 'AUDIO') return []

  const desc = (m.trackDescription ? row[m.trackDescription] : '').trim()
  if (!desc) return []
  // "Artist - Title" — community convention is to split on the FIRST " - "
  const sep = desc.indexOf(' - ')
  const artist = sep > 0 ? desc.slice(0, sep).trim() : ''
  const track = sep > 0 ? desc.slice(sep + 3).trim() : desc
  if (!track) return []
  if (artist) knownArtists.set(norm(track), artist)

  const dateRaw = (m.datePlayed ? row[m.datePlayed] : '').trim() // YYYYMMDD, sometimes ISO
  const digits = dateRaw.replace(/\D/g, '')
  if (digits.length < 8) return []
  const y = Number(digits.slice(0, 4))
  const mo = Number(digits.slice(4, 6))
  const d = Number(digits.slice(6, 8))
  if (y < 2013 || mo < 1 || mo > 12 || d < 1 || d > 31) return []

  // "Hours" may be a single hour ("10") or a comma list ("18, 19")
  const hours = (m.hours ? String(row[m.hours] ?? '') : '')
    .split(',')
    .map((h) => Number(h.trim()))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
  if (hours.length === 0) hours.push(12)

  // skip-only rows carry Play Count 0 and must not fabricate a play
  const pcRaw = m.playCount ? Number(row[m.playCount]) : NaN
  if (Number.isFinite(pcRaw) && Math.round(pcRaw) <= 0) return []
  const playCount = Number.isFinite(pcRaw) ? Math.max(1, Math.round(pcRaw)) : 1
  // Treated as the row total (SamTheGeek convention), split across plays
  const totalMs = Math.max(0, Number(m.playMs ? row[m.playMs] : 0) || 0)
  const perPlayMs = totalMs > 0 ? Math.min(totalMs / playCount, 4 * 3_600_000) : 0

  const plays: Play[] = []
  for (let i = 0; i < playCount && i < 500; i++) {
    const hour = hours[i % hours.length]
    const ts = new Date(y, mo - 1, d, hour, 0, 0, i).getTime()
    if (!Number.isFinite(ts)) continue
    plays.push({
      // rowSeq keeps ids unique when the same track/day appears in several
      // rollup rows (per end-reason/source buckets), and is stable per file
      id: `csv:${ts}:${hash(norm(artist) + ' ' + norm(track))}:${rowSeq}:${i}`,
      ts,
      track,
      artist: artist || 'Unknown Artist',
      album: '',
      ms: Math.round(perPlayMs),
      source: 'csv',
    })
  }
  return plays
}

export interface ImportResult {
  kind: CsvKind
  imported: number
  skipped: number
  duplicates: number
  firstTs: number | null
  lastTs: number | null
}

export interface ImportProgress {
  rows: number
  kept: number
}

/**
 * Parse an Apple Music CSV export.
 * `existingKeys` drops plays already covered by other sources (same
 * artist+track within a 5-minute bucket). `knownArtists` (normalized title ->
 * artist) recovers artists for 2026 Play Activity exports that lack the
 * Artist Name column; it is grown by daily-tracks rows during parsing.
 */
export function parseAppleCsv(
  file: File,
  existingKeys: Set<string>,
  knownArtists: Map<string, string>,
  onBatch: (plays: Play[]) => Promise<void>,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    let headerMap: Partial<Record<Field, string>> | null = null
    let kind: CsvKind = 'unknown'
    let rows = 0
    let imported = 0
    let skipped = 0
    let duplicates = 0
    let firstTs: number | null = null
    let lastTs: number | null = null
    let pending: Play[] = []
    let flushChain: Promise<void> = Promise.resolve()
    let writeError: Error | null = null

    const flush = () => {
      if (pending.length === 0) return
      const batch = pending
      pending = []
      flushChain = flushChain.then(() => onBatch(batch)).catch((e) => {
        // remember the storage failure so parsing stops instead of
        // silently producing a partial import
        if (!writeError) writeError = e instanceof Error ? e : new Error(String(e))
      })
    }

    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      chunk: (results, parser) => {
        try {
          if (writeError) {
            parser.abort()
            reject(writeError)
            return
          }
          if (!headerMap) {
            const headers = results.meta.fields ?? []
            headerMap = buildHeaderMap(headers)
            kind = detectKind(headers)
            if (kind === 'unknown') {
              parser.abort()
              reject(
                new Error(
                  'This does not look like an Apple Music listening export. Use "Apple Music - Play History Daily Tracks.csv" (recommended) or "Apple Music Play Activity.csv" from the Apple Music Activity folder.',
                ),
              )
              return
            }
          }
          for (const row of results.data) {
            rows++
            const parsed =
              kind === 'play-activity'
                ? (() => {
                    const p = parsePlayActivityRow(row, headerMap!, knownArtists)
                    return p ? [p] : []
                  })()
                : parseDailyTracksRow(row, headerMap!, knownArtists, rows)
            if (parsed.length === 0) {
              skipped++
              continue
            }
            for (const p of parsed) {
              if (existingKeys.has(dedupeKey(p.artist, p.track, p.ts))) {
                duplicates++
                continue
              }
              pending.push(p)
              imported++
              if (firstTs === null || p.ts < firstTs) firstTs = p.ts
              if (lastTs === null || p.ts > lastTs) lastTs = p.ts
            }
          }
          if (pending.length >= 4000) flush()
          onProgress?.({ rows, kept: imported })
        } catch (e) {
          parser.abort()
          reject(e)
        }
      },
      complete: () => {
        flush()
        flushChain
          .then(() => {
            if (writeError) reject(writeError)
            else resolve({ kind, imported, skipped, duplicates, firstTs, lastTs })
          })
          .catch(reject)
      },
      error: (err) => reject(err),
    })
  })
}

/** 5-minute-bucket key for cross-source dedupe. */
export function dedupeKey(artist: string, track: string, ts: number): string {
  return `${norm(artist)}|${norm(track)}|${Math.round(ts / 300_000)}`
}

/** Keys for existing plays; includes neighbor buckets so boundary cases match. */
export function buildDedupeIndex(plays: Play[]): Set<string> {
  const set = new Set<string>()
  for (const p of plays) {
    const bucket = Math.round(p.ts / 300_000)
    const base = `${norm(p.artist)}|${norm(p.track)}|`
    set.add(base + (bucket - 1))
    set.add(base + bucket)
    set.add(base + (bucket + 1))
  }
  return set
}

/** normalized title -> artist, for recovering artist-less 2026 exports */
export function buildArtistIndex(plays: Play[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of plays) {
    if (p.artist && p.artist !== 'Unknown Artist') map.set(norm(p.track), p.artist)
  }
  return map
}
