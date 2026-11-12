import type { DurationMap, Play, Service } from './types'
import { SKIP_AWARE_SOURCES, norm, resolvePlayMs } from './types'
import { localDayStart } from './stats'
import type { ArtistKeyer } from './artists'
import { PLAIN_ARTISTS, cleanAlbum } from './artists'

/**
 * Affinity scoring: turns the raw play/skip log into "what you actually
 * like" and builds playlist-shaped mixes from it.
 *
 * The signals, per track:
 *  - recency-weighted plays  exp(-age / tau) per play, so last week counts
 *    more than last month (tau = 21 days for Heavy Rotation)
 *  - completion              plays / (plays + skips), Laplace-smoothed so a
 *    single skip doesn't nuke a 2-play track
 *  - consistency             distinct listening days, so one binge afternoon
 *    doesn't outrank a song you reach for every day
 */

const DAY = 86_400_000

export interface TrackAgg {
  key: string
  name: string
  artist: string
  album: string
  plays: number
  skips: number
  /** plays from sources that report skips (Apple CSV, Spotify); No Skips needs these */
  skipAwarePlays: number
  ms: number
  daysPlayed: number
  firstTs: number
  lastTs: number
  /** recency-weighted plays, tau = 21 days */
  rw21: number
  /** plays in the last 14 days */
  p14: number
  /** plays in the last 56 days */
  p56: number
  /** plays in the 15-74 day window (baseline for trend detection) */
  pPrior: number
}

export function aggregateTracks(
  plays: Play[],
  durations: DurationMap,
  now = Date.now(),
  ak: ArtistKeyer = PLAIN_ARTISTS,
): TrackAgg[] {
  const map = new Map<string, TrackAgg & { daySet: Set<number> }>()
  for (const p of plays) {
    const key = ak.key(p.artist) + '\0' + norm(p.track)
    let a = map.get(key)
    if (!a) {
      a = {
        key,
        name: p.track,
        artist: p.artist,
        album: cleanAlbum(p.album),
        plays: 0,
        skips: 0,
        skipAwarePlays: 0,
        ms: 0,
        daysPlayed: 0,
        firstTs: Infinity,
        lastTs: 0,
        rw21: 0,
        p14: 0,
        p56: 0,
        pPrior: 0,
        daySet: new Set<number>(),
      }
      map.set(key, a)
    }
    if (!a.album && p.album) a.album = cleanAlbum(p.album)
    if (p.skip) {
      a.skips++
      continue
    }
    a.plays++
    if (SKIP_AWARE_SOURCES.has(p.source) && !p.noSkipData) a.skipAwarePlays++
    a.ms += resolvePlayMs(p, durations)
    if (p.ts < a.firstTs) a.firstTs = p.ts
    if (p.ts > a.lastTs) a.lastTs = p.ts
    a.daySet.add(localDayStart(p))
    const ageDays = Math.max(0, (now - p.ts) / DAY)
    a.rw21 += Math.exp(-ageDays / 21)
    if (ageDays <= 14) a.p14++
    if (ageDays <= 56) a.p56++
    if (ageDays > 14 && ageDays <= 74) a.pPrior++
  }
  const out: TrackAgg[] = []
  for (const a of map.values()) {
    const { daySet, ...rest } = a
    out.push({ ...rest, daysPlayed: daySet.size })
  }
  return out
}

/** plays / started, smoothed: one skip on a rarely-played track isn't damning */
export function completionFactor(a: Pick<TrackAgg, 'plays' | 'skips'>): number {
  return (a.plays + 1) / (a.plays + a.skips + 2)
}

export interface MixTrack {
  name: string
  artist: string
  album: string
  /** context-dependent count shown in the row (window plays, lifetime plays, or skips) */
  count: number
  score: number
}

export interface Mix {
  key: string
  title: string
  blurb: string
  /** what the per-row count means */
  unit: string
  tracks: MixTrack[]
}

const MIX_SIZE = 25

function toMixTrack(a: TrackAgg, count: number, score: number): MixTrack {
  return { name: a.name, artist: a.artist, album: a.album, count, score }
}

function top(tracks: MixTrack[]): MixTrack[] {
  return tracks.sort((x, y) => y.score - x.score || y.count - x.count).slice(0, MIX_SIZE)
}

/** What you keep coming back to: recency-weighted, completion-corrected. */
export function heavyRotation(aggs: TrackAgg[]): MixTrack[] {
  return top(
    aggs
      .filter((a) => a.p56 >= 3 && a.daysPlayed >= 2)
      .map((a) => toMixTrack(a, a.p56, a.rw21 * completionFactor(a) * Math.min(1, a.daysPlayed / 3))),
  )
}

/** Newer to your ears and climbing: recent rate well above the baseline. */
export function onTheRise(aggs: TrackAgg[], now = Date.now()): MixTrack[] {
  return top(
    aggs
      .filter((a) => a.p14 >= 3)
      .map((a) => {
        const rate14 = a.p14 / 14
        const ratePrior = a.pPrior / 60
        const ratio = rate14 / (ratePrior + 0.02) // +0.02 keeps brand-new tracks finite
        const isNew = now - a.firstTs <= 21 * DAY
        return { a, ratio: isNew ? Math.max(ratio, 4) : ratio }
      })
      .filter(({ ratio }) => ratio >= 2)
      .map(({ a, ratio }) => toMixTrack(a, a.p14, a.p14 * Math.min(ratio, 6) * completionFactor(a))),
  )
}

/** Favorites gone quiet: heavily played, untouched for 60+ days. */
export function oldFlames(aggs: TrackAgg[], now = Date.now()): MixTrack[] {
  return top(
    aggs
      .filter((a) => a.plays >= 8 && a.lastTs > 0 && now - a.lastTs > 60 * DAY)
      .map((a) => toMixTrack(a, a.plays, a.plays * completionFactor(a) * Math.min(1, a.daysPlayed / 5))),
  )
}

/**
 * Songs you never cut short. Last.fm doesn't report skips, so only plays
 * from skip-aware sources count toward the five: a track known only from
 * Last.fm has no evidence either way.
 */
export function noSkips(aggs: TrackAgg[]): MixTrack[] {
  return top(
    aggs
      .filter((a) => a.skipAwarePlays >= 5 && a.skips === 0)
      .map((a) => toMixTrack(a, a.plays, a.skipAwarePlays)),
  )
}

export function buildMixes(
  plays: Play[],
  durations: DurationMap,
  now = Date.now(),
  ak: ArtistKeyer = PLAIN_ARTISTS,
): Mix[] {
  const aggs = aggregateTracks(plays, durations, now, ak)
  const hasSkipData = aggs.some((a) => a.skips > 0)
  const mixes: Mix[] = [
    {
      key: 'heavy',
      title: 'Heavy Rotation',
      blurb: 'What you keep coming back to — the last eight weeks, weighted toward this week.',
      unit: 'plays',
      tracks: heavyRotation(aggs),
    },
    {
      key: 'rise',
      title: 'On the Rise',
      blurb: 'Newer to your ears and climbing fast.',
      unit: 'plays · 14 days',
      tracks: onTheRise(aggs, now),
    },
    {
      key: 'flames',
      title: 'Old Flames',
      blurb: 'Favorites you haven’t touched in a couple of months.',
      unit: 'plays all-time',
      tracks: oldFlames(aggs, now),
    },
  ]
  if (hasSkipData) {
    mixes.push({
      key: 'noskips',
      title: 'No Skips',
      blurb: 'Played at least five times, never cut short.',
      unit: 'plays all-time',
      tracks: noSkips(aggs),
    })
  }
  return mixes.filter((m) => m.tracks.length >= 5)
}

/** "Artist – Track" lines for the clipboard / share sheet / playlist importers. */
export function mixToText(mix: Mix): string {
  return mix.tracks.map((t) => `${t.artist} - ${t.name}`).join('\n')
}

export function appleMusicSearchUrl(t: Pick<MixTrack, 'name' | 'artist'>): string {
  return `https://music.apple.com/search?term=${encodeURIComponent(`${t.artist} ${t.name}`)}`
}

export function spotifySearchUrl(t: Pick<MixTrack, 'name' | 'artist'>): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${t.artist} ${t.name}`)}`
}

export function searchUrl(service: Service, t: Pick<MixTrack, 'name' | 'artist'>): string {
  return service === 'spotify' ? spotifySearchUrl(t) : appleMusicSearchUrl(t)
}
