import type { DurationMap, Play } from './types'
import { durationKey, norm } from './types'

const API = 'https://ws.audioscrobbler.com/2.0/'
const PAGE_SIZE = 200
/** Backfill safety cap: 500 pages x 200 = 100k scrobbles per run */
const MAX_PAGES = 500

export class LastfmError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

type Params = Record<string, string>

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** everything the API returns is stringly-typed; lists of one item come back as bare objects */
function asArray<T>(x: T | T[] | undefined | null): T[] {
  return Array.isArray(x) ? x : x ? [x] : []
}

const FRIENDLY: Record<number, string> = {
  10: 'That API key was rejected by Last.fm. Double-check it (last.fm/api/accounts).',
  6: 'Last.fm does not know that username.',
  17: 'Your Last.fm privacy setting "Hide recent listening information" blocks syncing. Uncheck it at last.fm/settings/privacy and try again.',
  29: 'Last.fm rate limit hit. Wait a minute and try again.',
  26: 'This API key has been suspended by Last.fm.',
}

async function call<T>(params: Params, apiKey: string): Promise<T> {
  const q = new URLSearchParams({ ...params, api_key: apiKey, format: 'json' })
  // error 29 = rate limited, error 8 = transient backend failure; both retryable
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(`${API}?${q}`)
    } catch (e) {
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1))
        continue
      }
      throw new LastfmError(0, `Could not reach Last.fm (${(e as Error).message}). Are you online?`)
    }
    let data: unknown
    try {
      data = await res.json()
    } catch {
      // maintenance/5xx pages come back as HTML; treat as transient
      if (attempt < 2) {
        await sleep(2000 * (attempt + 1))
        continue
      }
      throw new LastfmError(0, `Last.fm returned a non-JSON response (HTTP ${res.status})`)
    }
    const err = data as { error?: number; message?: string }
    if (err.error) {
      if ((err.error === 29 || err.error === 8) && attempt < 2) {
        await sleep(err.error === 29 ? 5000 : 1500)
        continue
      }
      throw new LastfmError(err.error, FRIENDLY[err.error] ?? err.message ?? `Last.fm error ${err.error}`)
    }
    if (!res.ok) throw new LastfmError(0, `Last.fm HTTP ${res.status}`)
    return data as T
  }
}

/* ---------- recent tracks ---------- */

interface RtArtist {
  '#text'?: string
  name?: string
}
interface RtTrack {
  name: string
  artist?: RtArtist
  album?: { '#text'?: string }
  date?: { uts: string }
  image?: { size: string; '#text': string }[]
  '@attr'?: { nowplaying?: string }
}
interface RecentTracksResp {
  recenttracks: {
    track?: RtTrack | RtTrack[]
    '@attr'?: { page: string; totalPages: string; total: string }
  }
}

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function parseRecentTrack(t: RtTrack): Play | null {
  if (t['@attr']?.nowplaying === 'true') return null
  const uts = Number(t.date?.uts)
  if (!Number.isFinite(uts) || uts <= 0) return null
  const artist = (t.artist?.name ?? t.artist?.['#text'] ?? '').trim()
  const track = (t.name ?? '').trim()
  if (!artist || !track) return null
  const album = (t.album?.['#text'] ?? '').trim()
  return {
    id: `lfm:${uts}:${hash(norm(artist) + '\0' + norm(track))}`,
    ts: uts * 1000,
    track,
    artist,
    album,
    ms: 0, // resolved via duration map at stats time
    source: 'lastfm',
  }
}

export interface SyncProgress {
  page: number
  totalPages: number
  fetched: number
}

export interface SyncResult {
  plays: Play[]
  newestUts: number
  capped: boolean
}

/**
 * Fetch scrobbles newer than `sinceUts` (seconds), newest-first pagination.
 * Pass sinceUts=0 for a full backfill. `beforeUts` bounds the window from
 * above (used to continue a capped backfill into older history).
 */
export async function fetchScrobbles(
  user: string,
  apiKey: string,
  sinceUts: number,
  onProgress?: (p: SyncProgress) => void,
  signal?: { cancelled: boolean },
  beforeUts?: number,
): Promise<SyncResult> {
  const plays: Play[] = []
  let newestUts = sinceUts
  let page = 1
  let totalPages = 1
  do {
    const params: Params = {
      method: 'user.getrecenttracks',
      user,
      limit: String(PAGE_SIZE),
      page: String(page),
    }
    if (sinceUts > 0) params.from = String(sinceUts + 1)
    if (beforeUts) params.to = String(beforeUts)
    const data = await call<RecentTracksResp>(params, apiKey)
    const rt = data.recenttracks
    totalPages = Math.max(1, Number(rt['@attr']?.totalPages ?? 1))
    const tracks = asArray(rt.track)
    for (const t of tracks) {
      const p = parseRecentTrack(t)
      if (!p) continue
      plays.push(p)
      const uts = Math.floor(p.ts / 1000)
      if (uts > newestUts) newestUts = uts
    }
    onProgress?.({ page, totalPages, fetched: plays.length })
    page++
    if (signal?.cancelled) break
    if (page <= totalPages) await sleep(350) // stay well under Last.fm's rate limits
  } while (page <= totalPages && page <= MAX_PAGES)
  return { plays, newestUts, capped: totalPages > MAX_PAGES }
}

/* ---------- user info (used to validate credentials) ---------- */

interface UserInfoResp {
  user: { name: string; playcount: string; registered?: { unixtime?: string } }
}

export async function getUserInfo(user: string, apiKey: string) {
  const data = await call<UserInfoResp>({ method: 'user.getinfo', user }, apiKey)
  return {
    name: data.user.name,
    playcount: Number(data.user.playcount ?? 0),
    registeredUts: Number(data.user.registered?.unixtime ?? 0),
  }
}

/* ---------- track durations (for minutes-listened estimates) ---------- */

interface TopTracksResp {
  toptracks: {
    track?: { name: string; duration?: string; artist?: { name?: string } }[]
    '@attr'?: { totalPages: string }
  }
}

/**
 * Build artist+track -> duration(ms) map from the user's top tracks.
 * Covers the plays that dominate listening time; the long tail falls back
 * to the default average.
 */
export async function fetchDurations(
  user: string,
  apiKey: string,
  maxPages = 4,
): Promise<DurationMap> {
  const map: DurationMap = new Map()
  let totalPages = 1
  for (let page = 1; page <= Math.min(maxPages, totalPages); page++) {
    const data = await call<TopTracksResp>(
      {
        method: 'user.gettoptracks',
        user,
        period: 'overall',
        limit: '500',
        page: String(page),
      },
      apiKey,
    )
    totalPages = Math.max(1, Number(data.toptracks['@attr']?.totalPages ?? 1))
    for (const t of asArray(data.toptracks.track)) {
      const durS = Number(t.duration ?? 0)
      const artist = t.artist?.name ?? ''
      if (durS > 0 && artist && t.name) {
        map.set(durationKey(artist, t.name), durS * 1000)
      }
    }
    if (page < Math.min(maxPages, totalPages)) await sleep(350)
  }
  return map
}

/* ---------- album artwork lookup (top albums have real images) ---------- */

interface TopAlbumsResp {
  topalbums: {
    album?: {
      name: string
      artist?: { name?: string }
      image?: { size: string; '#text': string }[]
    }[]
    '@attr'?: { totalPages: string }
  }
}

/** album key -> artwork URL. Artist images were removed from the Last.fm API; albums still have them. */
export async function fetchAlbumArt(
  user: string,
  apiKey: string,
  maxPages = 2,
): Promise<Record<string, string>> {
  const art: Record<string, string> = {}
  let totalPages = 1
  for (let page = 1; page <= Math.min(maxPages, totalPages); page++) {
    const data = await call<TopAlbumsResp>(
      {
        method: 'user.gettopalbums',
        user,
        period: 'overall',
        limit: '500',
        page: String(page),
      },
      apiKey,
    )
    totalPages = Math.max(1, Number(data.topalbums['@attr']?.totalPages ?? 1))
    for (const a of asArray(data.topalbums.album)) {
      const img = a.image?.find((i) => i.size === 'large') ?? a.image?.at(-1)
      const url = img?.['#text']
      if (url && a.name) {
        art[norm(`${a.artist?.name ?? ''}\0${a.name}`)] = url
      }
    }
    if (page < Math.min(maxPages, totalPages)) await sleep(350)
  }
  return art
}

export function albumArtKey(artist: string, album: string): string {
  return norm(`${artist}\0${album}`)
}

/* ---------- single cover lookups (rows on screen that have no artwork yet) ---------- */

type LfmImage = { size: string; '#text': string }

/** Last.fm's grey-star "no image" picture; never worth showing */
const PLACEHOLDER_IMAGE = '2a96cbd8b46e442fc41c2b86b821562f'

export function pickImage(images: LfmImage[] | undefined): string | undefined {
  const list = asArray(images)
  const url = (list.find((i) => i.size === 'large') ?? list.at(-1))?.['#text']
  if (!url || url.includes(PLACEHOLDER_IMAGE)) return undefined
  return url
}

/** error 6 here means "no such track / album", which is an answer, not a failure */
async function lookup<T>(params: Params, apiKey: string): Promise<T | undefined> {
  try {
    return await call<T>(params, apiKey)
  } catch (e) {
    if (e instanceof LastfmError && e.code === 6) return undefined
    throw e
  }
}

/** Cover of the album a song is on, if Last.fm knows one. */
export async function lookupTrackImage(artist: string, track: string, apiKey: string): Promise<string | undefined> {
  const data = await lookup<{ track?: { album?: { image?: LfmImage[] } } }>(
    { method: 'track.getInfo', artist, track, autocorrect: '1' },
    apiKey,
  )
  return pickImage(data?.track?.album?.image)
}

export async function lookupAlbumImage(artist: string, album: string, apiKey: string): Promise<string | undefined> {
  const data = await lookup<{ album?: { image?: LfmImage[] } }>(
    { method: 'album.getInfo', artist, album, autocorrect: '1' },
    apiKey,
  )
  return pickImage(data?.album?.image)
}
