import { describe, expect, it } from 'vitest'
import type { Play } from './types'
import { makeArtistKeyer } from './artists'
import {
  albumAttempts,
  albumCoverKey,
  buildArtistTopTracks,
  isFreshMiss,
  MISS_TTL_MS,
  simplifyTitle,
  trackAttempts,
  trackCoverKey,
} from './covers'
import { pickImage } from './lastfm'

function play(artist: string, track: string, n: number, extra: Partial<Play> = {}): Play {
  return { id: `${artist}|${track}|${n}`, ts: n, track, artist, album: '', ms: 200_000, source: 'csv', ...extra }
}

describe('simplifyTitle', () => {
  it('drops featured-artist and version suffixes', () => {
    expect(simplifyTitle('Patoreakcja (feat. Malik Montana)')).toBe('Patoreakcja')
    expect(simplifyTitle('Come Together - Remastered 2009')).toBe('Come Together')
    expect(simplifyTitle('Hurt [Live]')).toBe('Hurt')
  })
  it('keeps a title that would otherwise vanish', () => {
    expect(simplifyTitle('(Intro)')).toBe('(Intro)')
    expect(simplifyTitle('Plain')).toBe('Plain')
  })
})

describe('lookup attempts', () => {
  const plays = [play('Mata', 'Solo', 1), play('Mata & DJ Flip', 'Duet (feat. X)', 2)]
  const ak = makeArtistKeyer(plays)

  it('tries the lead artist, then a plainer title, then the full credit', () => {
    expect(trackAttempts(ak, 'Mata & DJ Flip', 'Duet (feat. X)')).toEqual([
      { artist: 'Mata', title: 'Duet (feat. X)' },
      { artist: 'Mata', title: 'Duet' },
      { artist: 'Mata & DJ Flip', title: 'Duet (feat. X)' },
    ])
  })
  it('does not repeat an identical attempt', () => {
    expect(trackAttempts(ak, 'Mata', 'Solo')).toEqual([{ artist: 'Mata', title: 'Solo' }])
    expect(albumAttempts(ak, 'Mata', '100 dni do matury')).toEqual([{ artist: 'Mata', title: '100 dni do matury' }])
  })
  it('tries the album without its " - Single" suffix first', () => {
    expect(albumAttempts(ak, 'Mata', 'Kiss cam - Single')).toEqual([
      { artist: 'Mata', title: 'Kiss cam' },
      { artist: 'Mata', title: 'Kiss cam - Single' },
    ])
  })
  it('keys a collaboration under its lead artist', () => {
    expect(trackCoverKey(ak, 'Mata & DJ Flip', 'Duet')).toBe(trackCoverKey(ak, 'Mata', 'duet'))
    expect(albumCoverKey(ak, 'Mata & DJ Flip', 'X - EP')).toBe(albumCoverKey(ak, 'Mata', 'x'))
  })
})

describe('isFreshMiss', () => {
  it('retries a miss only after the TTL', () => {
    const now = 1_000_000_000_000
    expect(isFreshMiss({ k: now - 1000 }, 'k', now)).toBe(true)
    expect(isFreshMiss({ k: now - MISS_TTL_MS - 1 }, 'k', now)).toBe(false)
    expect(isFreshMiss({}, 'k', now)).toBe(false)
  })
})

describe('buildArtistTopTracks', () => {
  it('orders an artist’s songs by plays, ignores skips, folds collaborations', () => {
    const plays = [
      play('Mata', 'A', 1),
      play('Mata', 'B', 2),
      play('Mata', 'B', 3, { album: 'Album B', source: 'lastfm' }),
      play('Mata & DJ Flip', 'C', 4),
      play('Mata & DJ Flip', 'C', 5),
      play('Mata & DJ Flip', 'C', 6),
      play('Mata', 'A', 7, { skip: true }),
      play('Mata', 'D', 8),
    ]
    const ak = makeArtistKeyer(plays)
    const top = buildArtistTopTracks(plays, ak).get(ak.key('Mata'))!
    expect(top.map((t) => t.track)).toEqual(['C', 'B', 'A', 'D'])
    expect(top[1].album).toBe('Album B')
  })
})

describe('pickImage', () => {
  const img = (size: string, url: string) => ({ size, '#text': url })
  it('prefers the large size', () => {
    expect(pickImage([img('small', 's'), img('large', 'l'), img('extralarge', 'xl')])).toBe('l')
  })
  it('treats the Last.fm placeholder and empty URLs as no image', () => {
    expect(pickImage([img('large', 'https://x/174s/2a96cbd8b46e442fc41c2b86b821562f.png')])).toBeUndefined()
    expect(pickImage([img('large', '')])).toBeUndefined()
    expect(pickImage(undefined)).toBeUndefined()
  })
})
