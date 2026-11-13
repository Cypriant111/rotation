import type { Play } from './types'
import { norm } from './types'
import type { ArtistKeyer } from './artists'
import { cleanAlbum } from './artists'
import { albumArtKey } from './lastfm'

/**
 * Covers looked up one at a time, for rows that the bulk "top albums" fetch
 * leaves bare: imported history has no album names (Apple) or albums the
 * Last.fm account never scrobbled (Spotify export).
 *
 * key -> image URL. Keys: "t:" + song, "a:" + album.
 */
export type CoverCache = Record<string, string>
/** key -> when Last.fm last had nothing for it; retried after MISS_TTL_MS */
export type CoverMisses = Record<string, number>

export const MISS_TTL_MS = 30 * 86_400_000

export type CoverKind = 'track' | 'album' | 'artist'

export function trackCoverKey(ak: ArtistKeyer, artist: string, track: string): string {
  return 't:' + ak.key(artist) + '\0' + norm(track)
}

export function albumCoverKey(ak: ArtistKeyer, artist: string, album: string): string {
  return 'a:' + albumArtKey(ak.display(artist), cleanAlbum(album))
}

export function isFreshMiss(misses: CoverMisses, key: string, now = Date.now()): boolean {
  const at = misses[key]
  return at !== undefined && now - at < MISS_TTL_MS
}

/**
 * "Song (feat. X)" -> "Song", "Song - Remastered 2011" -> "Song",
 * "Song [Live]" -> "Song". Streaming titles carry these; Last.fm's often don't.
 */
export function simplifyTitle(title: string): string {
  const t = title
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t || title
}

export interface Attempt {
  artist: string
  /** song or album title, depending on the lookup */
  title: string
}

function unique(attempts: Attempt[]): Attempt[] {
  const seen = new Set<string>()
  return attempts.filter((a) => {
    const k = norm(a.artist) + '\0' + norm(a.title)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Lead artist first ("Mata", not "Mata & DJ Flip"), then a plainer title, then the full credit. */
export function trackAttempts(ak: ArtistKeyer, artist: string, track: string): Attempt[] {
  const lead = ak.display(artist)
  return unique([
    { artist: lead, title: track },
    { artist: lead, title: simplifyTitle(track) },
    { artist, title: track },
  ])
}

export function albumAttempts(ak: ArtistKeyer, artist: string, album: string): Attempt[] {
  const lead = ak.display(artist)
  return unique([
    { artist: lead, title: cleanAlbum(album) },
    { artist: lead, title: album },
  ])
}

export interface TopTrack {
  artist: string
  track: string
  album: string
}

/** songs kept per artist: any of them with a known cover can stand in for the artist */
const TOP_TRACKS_PER_ARTIST = 8
/** songs actually looked up for an artist tile before giving up on a picture */
export const ARTIST_LOOKUPS = 3

/**
 * artist key -> their most-played songs. Last.fm no longer serves artist
 * photos, so an artist's tile shows the cover of what you play most by them.
 */
export function buildArtistTopTracks(plays: Play[], ak: ArtistKeyer): Map<string, TopTrack[]> {
  const byArtist = new Map<string, Map<string, TopTrack & { n: number }>>()
  for (const p of plays) {
    if (p.skip) continue
    const a = ak.key(p.artist)
    let tracks = byArtist.get(a)
    if (!tracks) byArtist.set(a, (tracks = new Map()))
    const t = norm(p.track)
    const cur = tracks.get(t)
    if (cur) {
      cur.n++
      if (!cur.album && p.album) cur.album = p.album
    } else {
      tracks.set(t, { artist: p.artist, track: p.track, album: p.album, n: 1 })
    }
  }
  const out = new Map<string, TopTrack[]>()
  for (const [a, tracks] of byArtist) {
    out.set(
      a,
      [...tracks.values()]
        .sort((x, y) => y.n - x.n)
        .slice(0, TOP_TRACKS_PER_ARTIST)
        .map(({ artist, track, album }) => ({ artist, track, album })),
    )
  }
  return out
}
