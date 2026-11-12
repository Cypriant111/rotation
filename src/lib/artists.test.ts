import { describe, expect, it } from 'vitest'
import type { Play } from './types'
import { cleanAlbum, makeArtistKeyer, primaryArtist, soloArtists, splitArtists } from './artists'
import { topAlbums, topArtists, topTracks, totals } from './stats'
import { aggregateTracks } from './affinity'
import { buildDedupeIndex, dedupeKey } from './csv'
import { initials } from './format'
import { buildTrackAlbums, findArtwork } from './artwork'
import { albumArtKey } from './lastfm'

let seq = 0
function p(artist: string, track: string, over: Partial<Play> = {}): Play {
  return {
    id: `t:${seq++}`,
    ts: over.ts ?? Date.UTC(2026, 9, 1, 12) + seq * 60_000,
    track,
    artist,
    album: over.album ?? '',
    ms: 200_000,
    source: over.source ?? 'csv',
  }
}

describe('splitArtists', () => {
  it('splits on &, comma, feat. and ft.', () => {
    expect(splitArtists('Mata & DJ Flip')).toEqual(['Mata', 'DJ Flip'])
    expect(splitArtists('A, B & C')).toEqual(['A', 'B', 'C'])
    expect(splitArtists('Drake feat. Rihanna')).toEqual(['Drake', 'Rihanna'])
    expect(splitArtists('Drake Ft. Rihanna')).toEqual(['Drake', 'Rihanna'])
  })
  it('leaves names without separators alone', () => {
    expect(splitArtists('AC/DC')).toEqual(['AC/DC'])
    expect(splitArtists('Earth,Wind')).toEqual(['Earth,Wind']) // no space after the comma
    expect(splitArtists('Florence + the Machine')).toEqual(['Florence + the Machine'])
  })
})

describe('primaryArtist', () => {
  const solo = soloArtists(['Mata', 'Taco Hemingway', 'Simon & Garfunkel', 'Paul Simon'])
  it('folds a collaboration into a lead artist known on their own', () => {
    expect(primaryArtist('Mata & DJ Flip', solo)).toBe('Mata')
    expect(primaryArtist('mata feat. Young Leosia', solo)).toBe('mata')
  })
  it('keeps duo names whose first part never appears alone', () => {
    expect(primaryArtist('Simon & Garfunkel', solo)).toBe('Simon & Garfunkel')
    expect(primaryArtist('Tyler, The Creator', solo)).toBe('Tyler, The Creator')
  })
})

describe('one artist key across stats, mixes and dedupe', () => {
  const plays = [
    p('Mata', 'Patointeligencja'),
    p('Mata & DJ Flip', 'Kiss cam'),
    p('Mata & DJ Flip', 'Kiss cam'),
    p('Simon & Garfunkel', 'The Boxer'),
  ]
  const ak = makeArtistKeyer(plays)

  it('Top artists counts the collaboration under the lead artist', () => {
    const top = topArtists(plays, new Map(), 50, ak)
    expect(top.map((a) => [a.name, a.plays])).toEqual([
      ['Mata', 3],
      ['Simon & Garfunkel', 1],
    ])
    expect(totals(plays, new Map(), ak).artists).toBe(2)
  })

  it('song rows keep the full credit', () => {
    const songs = topTracks(plays, new Map(), 50, ak)
    expect(songs[0]).toMatchObject({ name: 'Kiss cam', sub: 'Mata & DJ Flip', plays: 2 })
  })

  it('mixes group by the same key', () => {
    const aggs = aggregateTracks([...plays, p('Mata', 'Kiss cam')], new Map(), Date.UTC(2026, 9, 2), ak)
    const kiss = aggs.find((a) => a.name === 'Kiss cam')!
    expect(kiss.plays).toBe(3)
  })

  it('dedupe matches a Last.fm play credited to the lead artist only', () => {
    const csv = p('Mata & DJ Flip', 'Kiss cam', { ts: Date.UTC(2026, 9, 3, 20) })
    const index = buildDedupeIndex([csv], ak.key)
    expect(index.has(dedupeKey('Mata', 'Kiss cam', csv.ts + 60_000, ak.key))).toBe(true)
    // without folding, the two credits would not match
    expect(buildDedupeIndex([csv]).has(dedupeKey('Mata', 'Kiss cam', csv.ts))).toBe(false)
  })
})

describe('albums', () => {
  it('drops " - Single" and " - EP" from key and name', () => {
    expect(cleanAlbum('Kiss cam - Single')).toBe('Kiss cam')
    expect(cleanAlbum('Night Drive - EP')).toBe('Night Drive')
    expect(cleanAlbum('Single Ladies')).toBe('Single Ladies')
    expect(cleanAlbum('Self-Titled - Deluxe')).toBe('Self-Titled - Deluxe')
  })

  it('merges single and album spellings in Top albums', () => {
    const plays = [
      p('Mata', 'Kiss cam', { album: 'Kiss cam - Single' }),
      p('Mata', 'Kiss cam', { album: 'Kiss cam' }),
      p('Mata & DJ Flip', 'Kiss cam', { album: 'Kiss cam - Single' }),
    ]
    const albums = topAlbums(plays, new Map(), 50, makeArtistKeyer(plays))
    expect(albums).toHaveLength(1)
    expect(albums[0]).toMatchObject({ name: 'Kiss cam', sub: 'Mata', plays: 3 })
  })
})

describe('monogram initials', () => {
  it('uses letters and digits only', () => {
    expect(initials('G - Unit')).toBe('GU')
    expect(initials('G-Eazy')).toBe('G')
    expect(initials('(What’s The Story) Morning Glory?')).toBe('WT')
    expect(initials('50 Cent')).toBe('5C')
    expect(initials('Łzy')).toBe('Ł')
    expect(initials('— !!')).toBe('?')
  })
})

describe('findArtwork', () => {
  const plays = [
    p('Mata', 'Patointeligencja'),
    p('Mata & DJ Flip', 'Kiss cam'),
    p('Mata', 'Kiss cam', { source: 'lastfm', album: 'Kiss cam - Single' }),
  ]
  const ak = makeArtistKeyer(plays)
  const trackAlbums = buildTrackAlbums(plays, ak)
  const art = { [albumArtKey('Mata', 'Kiss cam')]: 'cover.jpg' }

  it('looks up by lead artist and cleaned album', () => {
    expect(findArtwork(art, ak, trackAlbums, 'Mata & DJ Flip', 'Kiss cam - Single')).toBe('cover.jpg')
  })
  it('borrows the album of the same song from Last.fm when the row has none', () => {
    expect(findArtwork(art, ak, trackAlbums, 'Mata & DJ Flip', '', 'Kiss cam')).toBe('cover.jpg')
    expect(findArtwork(art, ak, trackAlbums, 'Mata', '', 'Unknown song')).toBeUndefined()
  })
})
