import type { Play } from './types'

/**
 * Synthetic listening history for demo mode: invented artists, about six
 * months of plays with skips, shaped so every screen has something to show
 * (Heavy Rotation, On the Rise, Old Flames, No Skips, a live streak).
 *
 * Deterministic for a given (now, seed). Kept in memory only, never written
 * to IndexedDB.
 */

export const DEMO_DAYS = 182
export const DEMO_ID_PREFIX = 'demo:'

const ARTISTS = [
  'Mira Okafor',
  'The Velvet Static',
  'Juniper Coast',
  'Sol Navarro',
  'Paper Lanterns Club',
  'Kestrel Bay',
  'Ines Halvorsen',
  'Low Orbit Radio',
  'Tomasz Wren',
  'Glass Harbor',
  'Neon Almanac',
  'Aster Vale',
  'Midnight Cartographers',
  'Yuki Brandt',
  'Saltwater Hymns',
  'Odessa Lane',
  'Copper Moth',
  'Felix Arden',
  'Blue Hour Society',
  'Lumen Drive',
]

const ADJ = [
  'Silver', 'Quiet', 'Golden', 'Paper', 'Electric', 'Slow', 'Northern', 'Hollow', 'Velvet', 'Bright',
  'Distant', 'Wild', 'Little', 'Midnight', 'Open', 'Glass', 'Summer', 'Static', 'Gentle', 'Neon',
]
const NOUN = [
  'Afternoon', 'Rivers', 'Signal', 'Lanterns', 'Weather', 'Harbor', 'Satellites', 'Gardens', 'Echo',
  'Highway', 'Letters', 'Tides', 'Mirrors', 'Fever', 'Orchard', 'Skyline', 'Postcards', 'Engines',
  'Comets', 'Hours',
]
const ALBUM_WORDS = ['Tapes', 'Sessions', 'Atlas', 'Season', 'Room', 'Maps', 'Light', 'Coast', 'Static', 'Weather']

/** Small, fast, seedable PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Role = 'favorite' | 'heavy' | 'rising' | 'flame' | 'filler'

interface DemoTrack {
  artist: string
  track: string
  album: string
  ms: number
  weight: number
  skipP: number
  /** active window, in days before today (inclusive) */
  fromDay: number
  toDay: number
}

function buildCatalog(rand: () => number): DemoTrack[] {
  const tracks: DemoTrack[] = []
  const usedTitles = new Set<string>()
  const title = () => {
    for (;;) {
      const t = `${ADJ[Math.floor(rand() * ADJ.length)]} ${NOUN[Math.floor(rand() * NOUN.length)]}`
      if (!usedTitles.has(t)) {
        usedTitles.add(t)
        return t
      }
    }
  }

  // role mix per catalog; counts chosen so every mix clears its 5-track floor
  const roles: Role[] = [
    ...Array<Role>(10).fill('favorite'),
    ...Array<Role>(10).fill('heavy'),
    ...Array<Role>(8).fill('rising'),
    ...Array<Role>(9).fill('flame'),
    ...Array<Role>(110).fill('filler'),
  ]

  roles.forEach((role, i) => {
    const artist = ARTISTS[i % ARTISTS.length]
    const albumNo = Math.floor(rand() * 2)
    const album = `${ADJ[(i * 7 + albumNo) % ADJ.length]} ${ALBUM_WORDS[(artist.length + albumNo) % ALBUM_WORDS.length]}`
    const ms = Math.round((150 + rand() * 170) * 1000)
    const base = { artist, track: title(), album, ms }
    switch (role) {
      case 'favorite': // the whole period, never skipped
        tracks.push({ ...base, weight: 4 + rand() * 3, skipP: 0, fromDay: DEMO_DAYS - 1, toDay: 0 })
        break
      case 'heavy': // the last eight weeks, on repeat
        tracks.push({ ...base, weight: 7 + rand() * 4, skipP: 0.04, fromDay: 50, toDay: 0 })
        break
      case 'rising': // brand new, played a lot
        tracks.push({ ...base, weight: 10 + rand() * 4, skipP: 0.03, fromDay: 12, toDay: 0 })
        break
      case 'flame': // big months ago, silent since
        tracks.push({ ...base, weight: 7 + rand() * 3, skipP: 0.05, fromDay: DEMO_DAYS - 1, toDay: 75 })
        break
      default: // long tail, skipped more often
        tracks.push({
          ...base,
          weight: 0.4 + rand() * 1.4,
          skipP: 0.12 + rand() * 0.25,
          fromDay: Math.floor(rand() * DEMO_DAYS),
          toDay: 0,
        })
    }
  })
  return tracks
}

function pickWeighted<T extends { weight: number }>(items: T[], total: number, r: number): T {
  let x = r * total
  for (const it of items) {
    x -= it.weight
    if (x <= 0) return it
  }
  return items[items.length - 1]
}

/** Session start hours (local), weighted toward commute, lunch and evening. */
const SESSION_HOURS = [7, 8, 8, 9, 12, 13, 13, 17, 18, 19, 20, 20, 21, 22, 23]

export function generateDemoPlays(now = Date.now(), seed = 20251111): Play[] {
  const rand = rng(seed)
  const catalog = buildCatalog(rand)
  const today = new Date(now)
  const plays: Play[] = []
  let seq = 0

  for (let daysAgo = DEMO_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo)
    const weekend = dayStart.getDay() === 0 || dayStart.getDay() === 6
    // occasional quiet days, but never in the last two weeks (keeps a streak alive)
    if (daysAgo > 14 && rand() < 0.08) continue

    const active = catalog.filter((t) => t.fromDay >= daysAgo && t.toDay <= daysAgo)
    const total = active.reduce((s, t) => s + t.weight, 0)
    const sessions = 1 + Math.floor(rand() * 3) + (weekend ? 1 : 0)

    for (let s = 0; s < sessions; s++) {
      const hour = SESSION_HOURS[Math.floor(rand() * SESSION_HOURS.length)]
      let ts = dayStart.getTime() + hour * 3_600_000 + Math.floor(rand() * 50) * 60_000
      const length = 4 + Math.floor(rand() * (weekend ? 14 : 9))
      for (let k = 0; k < length; k++) {
        if (ts > now) break
        const t = pickWeighted(active, total, rand())
        const skipped = rand() < t.skipP
        const ms = skipped ? Math.round((4 + rand() * 20) * 1000) : t.ms
        plays.push({
          id: `${DEMO_ID_PREFIX}${seq++}`,
          ts,
          track: t.track,
          artist: t.artist,
          album: t.album,
          ms,
          ...(skipped ? { skip: true as const } : {}),
          source: 'csv',
        })
        ts += ms + 2_000
      }
    }
  }

  plays.sort((a, b) => b.ts - a.ts)
  return plays
}
