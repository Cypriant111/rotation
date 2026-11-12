import { norm } from './types'

/**
 * Collaborations and album-name noise.
 *
 * "Mata & DJ Flip" counts as "Mata" only when "Mata" also appears in the data
 * as a solo artist; that keeps real duo names ("Simon & Garfunkel") intact.
 * Separators: " & ", ", ", " feat. ", " ft. " (case-insensitive).
 *
 * The same key is used by Top (artists, songs, albums), Mixes, the totals and
 * cross-source dedupe, so a play never counts under two spellings.
 */

const SEPARATOR = /\s+&\s+|,\s+|\s+(?:feat|ft)\.\s+/i

export function splitArtists(artist: string): string[] {
  return artist
    .split(SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Normalized names of artists that appear on their own, without a separator. */
export function soloArtists(artists: Iterable<string>): Set<string> {
  const solo = new Set<string>()
  for (const a of artists) {
    if (!SEPARATOR.test(a)) solo.add(norm(a))
  }
  return solo
}

/** Display name of the lead artist when it is a known solo artist, else the full credit. */
export function primaryArtist(artist: string, solo: Set<string>): string {
  if (!SEPARATOR.test(artist)) return artist
  const first = splitArtists(artist)[0]
  return first && solo.has(norm(first)) ? first : artist
}

export interface ArtistKeyer {
  /** grouping key: normalized lead artist (or full credit) */
  key: (artist: string) => string
  /** display name for that key */
  display: (artist: string) => string
}

/** Identity keyer (no collaboration folding); the default for pure functions. */
export const PLAIN_ARTISTS: ArtistKeyer = { key: norm, display: (a) => a }

/** Builds a memoized keyer from every artist credit in the data. */
export function makeArtistKeyer(plays: Iterable<{ artist: string }>): ArtistKeyer {
  const credits = new Set<string>()
  for (const p of plays) credits.add(p.artist)
  const solo = soloArtists(credits)
  const cache = new Map<string, string>()
  const display = (artist: string) => {
    let d = cache.get(artist)
    if (d === undefined) {
      d = primaryArtist(artist, solo)
      cache.set(artist, d)
    }
    return d
  }
  return { key: (a) => norm(display(a)), display }
}

const ALBUM_SUFFIX = /\s+-\s+(?:single|ep)\s*$/i

/** "Song - Single" -> "Song"; "Name - EP" -> "Name". */
export function cleanAlbum(album: string): string {
  return album.replace(ALBUM_SUFFIX, '').trim()
}
