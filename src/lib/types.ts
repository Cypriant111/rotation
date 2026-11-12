/** One listen of one track, from either source, normalized. */
export interface Play {
  /** Unique key: `lfm:<uts>:<hash>` or `csv:<startMs>:<hash>` */
  id: string
  /** Play start, epoch ms (UTC-absolute) */
  ts: number
  track: string
  artist: string
  album: string
  /**
   * Milliseconds actually listened. Real for CSV rows; 0 for Last.fm plays
   * (resolved at stats time via the track-duration map, falling back to a
   * default average).
   */
  ms: number
  /** Minutes east of UTC at play time, when the source knew it (CSV rows). */
  off?: number
  /**
   * A skip event, not a listen: the track was cut short (under the 30s /
   * half-track threshold). Excluded from all listening totals; feeds skip
   * analytics and the completion factor in mix scoring.
   */
  skip?: true
  /**
   * The row came from a format that can't report skips (Spotify's yearly
   * account-data file), even though its source usually can.
   */
  noSkipData?: true
  source: Source
}

export type Source = 'lastfm' | 'csv' | 'spotify'

/** The streaming service the user listens on; steers instructions and links. */
export type Service = 'apple' | 'spotify'

/** Sources whose rows say when a track was cut short. Last.fm never does. */
export const SKIP_AWARE_SOURCES: ReadonlySet<Source> = new Set<Source>(['csv', 'spotify'])

export interface Settings {
  lastfmUser: string
  lastfmApiKey: string
  /** Newest scrobble uts (seconds) we have stored, for incremental sync */
  lastSyncUts: number
  /** Set once initial deep backfill of scrobble history completed */
  backfillDone: boolean
  /**
   * Oldest scrobble uts fetched so far while a capped (>100k scrobbles)
   * backfill is still in progress; 0 when none pending. Each sync continues
   * from here until the full history is in.
   */
  backfillOldestUts: number
  autoSync: boolean
  /** chosen on first run or in Settings; '' = not chosen yet (texts fall back to Apple Music) */
  service: Service | ''
}

export const DEFAULT_SETTINGS: Settings = {
  lastfmUser: '',
  lastfmApiKey: '',
  lastSyncUts: 0,
  backfillDone: false,
  backfillOldestUts: 0,
  autoSync: true,
  service: '',
}

export function serviceOf(s: Pick<Settings, 'service'>): Service {
  return s.service || 'apple'
}

export const SERVICE_NAME: Record<Service, string> = { apple: 'Apple Music', spotify: 'Spotify' }

/** artist + NUL + track -> full track length in ms (from Last.fm metadata) */
export type DurationMap = Map<string, number>

/** Fallback track length when nothing better is known (3m30s). */
export const DEFAULT_TRACK_MS = 210_000

export function durationKey(artist: string, track: string): string {
  return `${norm(artist)}\0${norm(track)}`
}

/** Normalize names for matching across sources. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolvePlayMs(p: Play, durations: DurationMap): number {
  if (p.ms > 0) return p.ms
  return durations.get(durationKey(p.artist, p.track)) ?? DEFAULT_TRACK_MS
}
