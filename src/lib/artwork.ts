import type { Play } from './types'
import { norm } from './types'
import type { ArtistKeyer } from './artists'
import { cleanAlbum } from './artists'
import { albumArtKey } from './lastfm'

/** song (lead-artist key + title) -> album name, from Last.fm plays. CSV daily
 *  tracks carry no album, so their rows borrow it from here. */
export function buildTrackAlbums(plays: Play[], ak: ArtistKeyer): Map<string, string> {
  const m = new Map<string, string>()
  for (const p of plays) {
    if (p.source === 'lastfm' && p.album) m.set(ak.key(p.artist) + '\0' + norm(p.track), p.album)
  }
  return m
}

/**
 * Artwork for a row. Tries the lead artist first ("Mata", not "Mata & DJ
 * Flip"), then the full credit; the album both cleaned ("X - Single" -> "X")
 * and as written. With no album, borrows the song's album from Last.fm.
 */
export function findArtwork(
  albumArt: Record<string, string>,
  ak: ArtistKeyer,
  trackAlbums: Map<string, string>,
  artist: string,
  album: string,
  track?: string,
): string | undefined {
  let alb = album
  if (!alb && track) alb = trackAlbums.get(ak.key(artist) + '\0' + norm(track)) ?? ''
  if (!alb) return undefined
  const lead = ak.display(artist)
  const clean = cleanAlbum(alb)
  for (const a of lead === artist ? [artist] : [lead, artist]) {
    const url = albumArt[albumArtKey(a, clean)] ?? albumArt[albumArtKey(a, alb)]
    if (url) return url
  }
  return undefined
}
