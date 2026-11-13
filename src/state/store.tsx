/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { clearPlays, getAllPlays, kvGet, kvSet, putPlays, requestPersistence } from '../lib/db'
import { buildArtistIndex, buildDedupeIndex, dedupeKey, parseAppleCsv } from '../lib/csv'
import type { ImportResult } from '../lib/csv'
import { fetchAlbumArt, fetchDurations, fetchScrobbles, getUserInfo, lookupAlbumImage, lookupTrackImage } from '../lib/lastfm'
import type { DurationMap, Play, Settings, Source } from '../lib/types'
import type { SpotifyImportResult } from '../lib/spotify'
import { DEFAULT_SETTINGS } from '../lib/types'
import type { ArtistKeyer } from '../lib/artists'
import { makeArtistKeyer } from '../lib/artists'
import { buildTrackAlbums, findArtwork } from '../lib/artwork'
import type { Attempt, CoverCache, CoverKind, CoverMisses } from '../lib/covers'
import { albumAttempts, albumCoverKey, ARTIST_LOOKUPS, buildArtistTopTracks, isFreshMiss, trackAttempts, trackCoverKey } from '../lib/covers'

export type SyncStatus =
  | { state: 'idle'; lastSyncAt: number | null }
  | { state: 'syncing'; fetched: number; page: number; totalPages: number }
  | { state: 'error'; message: string }

/** Refetch this much history on every incremental sync so scrobbles
 *  submitted late (offline devices, delayed scrobblers) are not lost.
 *  Ids are stable, so the overlap is idempotent. */
const OVERLAP_S = 7 * 86_400
/** Refresh track durations / album art this often. */
const META_TTL_MS = 7 * 86_400_000
/** Pause between single cover lookups: about three a second, well inside Last.fm's limit. */
const COVER_GAP_MS = 300
/** Lookup results reach the screen in batches, not one re-render per cover. */
const COVER_FLUSH_MS = 900

interface CoverJob {
  key: string
  kind: 'track' | 'album'
  attempts: Attempt[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface AppState {
  ready: boolean
  /** what the screens show: demo plays while demo mode is on, else the user's own */
  plays: Play[]
  /** the user's own stored plays, regardless of demo mode */
  ownPlays: Play[]
  /** demo mode: synthetic plays in memory only, nothing written to IndexedDB */
  demo: boolean
  startDemo: () => Promise<void>
  exitDemo: () => void
  settings: Settings
  durations: DurationMap
  albumArt: Record<string, string>
  /** collaboration-aware artist keys over the plays on screen */
  artists: ArtistKeyer
  /** artwork URL for a row: lead artist + cleaned album, with the album of the
   *  same song from Last.fm when the row has none (CSV plays) */
  artFor: (artist: string, album: string, track?: string) => string | undefined
  /** cover for a row: a song, an album, or an artist (the cover of what you play most by them) */
  coverFor: (kind: CoverKind, artist: string, album: string, track?: string) => string | undefined
  /** ask for a missing cover to be looked up on Last.fm; cheap to call again, does nothing
   *  in demo mode or without a Last.fm key */
  wantCover: (kind: CoverKind, artist: string, album: string, track?: string) => void
  /** changes whenever a batch of lookups lands (hits or misses) */
  coverVersion: number
  sync: SyncStatus
  importing: boolean
  connect: (user: string, apiKey: string) => Promise<{ playcount: number }>
  disconnect: () => Promise<void>
  syncNow: () => Promise<void>
  importCsv: (file: File, onProgress?: (rows: number, kept: number) => void) => Promise<ImportResult>
  importSpotify: (files: File[], onProgress?: (filesRead: number) => void) => Promise<SpotifyImportResult>
  clearSource: (source: Source) => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>
}

const NO_ART: Record<string, string> = {}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [plays, setPlays] = useState<Play[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [durations, setDurations] = useState<DurationMap>(new Map())
  const [albumArt, setAlbumArt] = useState<Record<string, string>>({})
  const [covers, setCovers] = useState<CoverCache>({})
  const [coverMisses, setCoverMisses] = useState<CoverMisses>({})
  const [coverVersion, setCoverVersion] = useState(0)
  const [sync, setSync] = useState<SyncStatus>({ state: 'idle', lastSyncAt: null })
  const [importing, setImporting] = useState(false)
  const [demoPlays, setDemoPlays] = useState<Play[] | null>(null)
  const syncing = useRef(false)
  // bumped by disconnect/clearSource so an in-flight sync discards its results
  const syncGen = useRef(0)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const playsRef = useRef(plays)
  playsRef.current = plays

  // boot: load everything from IndexedDB
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [stored, savedSettings, savedDurations, savedArt, lastSyncAt, savedCovers, savedMisses] = await Promise.all([
        getAllPlays(),
        kvGet<Settings>('settings'),
        kvGet<[string, number][]>('durations'),
        kvGet<Record<string, string>>('albumArt'),
        kvGet<number>('lastSyncAt'),
        kvGet<CoverCache>('covers'),
        kvGet<CoverMisses>('coverMisses'),
      ])
      if (!alive) return
      stored.sort((a, b) => b.ts - a.ts)
      setPlays(stored)
      if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
      if (savedDurations) setDurations(new Map(savedDurations))
      if (savedArt) setAlbumArt(savedArt)
      if (savedCovers) setCovers(savedCovers)
      if (savedMisses) setCoverMisses(savedMisses)
      setSync({ state: 'idle', lastSyncAt: lastSyncAt ?? null })
      setReady(true)
      requestPersistence()
    })().catch((e) => {
      console.error('boot failed', e)
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      kvSet('settings', next)
      return next
    })
  }, [])

  const mergePlays = useCallback((incoming: Play[]) => {
    if (incoming.length === 0) return
    setPlays((prev) => {
      const seen = new Set(prev.map((p) => p.id))
      const fresh: Play[] = []
      for (const p of incoming) {
        if (seen.has(p.id)) continue
        seen.add(p.id) // also dedupes within the batch itself
        fresh.push(p)
      }
      if (fresh.length === 0) return prev
      const next = [...prev, ...fresh]
      next.sort((a, b) => b.ts - a.ts)
      return next
    })
  }, [])

  const refreshMetadata = useCallback(async (user: string, apiKey: string) => {
    const fetchedAt = await kvGet<number>('metaFetchedAt')
    if (fetchedAt && Date.now() - fetchedAt < META_TTL_MS) return
    const [durs, art] = await Promise.all([fetchDurations(user, apiKey), fetchAlbumArt(user, apiKey)])
    setDurations(durs)
    setAlbumArt(art)
    await kvSet('durations', [...durs.entries()])
    await kvSet('albumArt', art)
    await kvSet('metaFetchedAt', Date.now())
  }, [])

  const runSync = useCallback(
    async (creds?: { user: string; apiKey: string }) => {
      const s = settingsRef.current
      const user = creds?.user ?? s.lastfmUser
      const apiKey = creds?.apiKey ?? s.lastfmApiKey
      if (!user || !apiKey || syncing.current) return
      syncing.current = true
      const gen = syncGen.current
      setSync({ state: 'syncing', fetched: 0, page: 0, totalPages: 0 })
      try {
        const since = s.lastSyncUts > 0 ? Math.max(0, s.lastSyncUts - OVERLAP_S) : 0
        const onProgress = (p: { page: number; totalPages: number; fetched: number }) =>
          setSync({ state: 'syncing', fetched: p.fetched, page: p.page, totalPages: p.totalPages })

        const result = await fetchScrobbles(user, apiKey, since, onProgress)
        let incoming = result.plays
        let oldestPending = s.backfillOldestUts
        let backfillDone = s.backfillDone

        if (result.capped) {
          // >100k scrobbles: remember where this run stopped so the next
          // pass can continue into older history instead of dropping it
          oldestPending = incoming.reduce((min, p) => Math.min(min, Math.floor(p.ts / 1000)), Infinity)
          backfillDone = false
        } else if (since === 0) {
          backfillDone = true
          oldestPending = 0
        }

        // continue a previously capped backfill into older history
        if (!backfillDone && oldestPending > 0 && !result.capped) {
          const older = await fetchScrobbles(user, apiKey, 0, onProgress, undefined, oldestPending - 1)
          incoming = incoming.concat(older.plays)
          if (older.capped) {
            oldestPending = older.plays.reduce(
              (min, p) => Math.min(min, Math.floor(p.ts / 1000)),
              oldestPending,
            )
          } else {
            backfillDone = true
            oldestPending = 0
          }
        }

        // a play already imported from an Apple CSV or a Spotify export must not count twice
        const exportPlays = playsRef.current.filter((p) => p.source !== 'lastfm')
        if (exportPlays.length > 0) {
          const ak = makeArtistKeyer([...playsRef.current, ...incoming]).key
          const exportIndex = buildDedupeIndex(exportPlays, ak)
          incoming = incoming.filter((p) => !exportIndex.has(dedupeKey(p.artist, p.track, p.ts, ak)))
        }

        if (gen !== syncGen.current) return // disconnected mid-sync; discard
        await putPlays(incoming)
        mergePlays(incoming)
        const now = Date.now()
        await kvSet('lastSyncAt', now)
        await saveSettings({
          lastSyncUts: Math.max(s.lastSyncUts, result.newestUts),
          backfillDone,
          backfillOldestUts: oldestPending === Infinity ? 0 : oldestPending,
        })
        setSync({ state: 'idle', lastSyncAt: now })
        refreshMetadata(user, apiKey).catch((e) => console.warn('metadata refresh failed', e))
      } catch (e) {
        if (gen === syncGen.current) setSync({ state: 'error', message: (e as Error).message })
      } finally {
        syncing.current = false
      }
    },
    [mergePlays, refreshMetadata, saveSettings],
  )

  const connect = useCallback(
    async (user: string, apiKey: string) => {
      const info = await getUserInfo(user.trim(), apiKey.trim())
      setDemoPlays(null)
      const prevUser = settingsRef.current.lastfmUser
      if (prevUser && prevUser.toLowerCase() !== info.name.toLowerCase()) {
        // switching accounts: the old account's scrobbles must not blend in
        syncGen.current++
        await clearPlays('lastfm')
        setPlays((prev) => prev.filter((p) => p.source !== 'lastfm'))
      }
      await kvSet('metaFetchedAt', 0)
      await saveSettings({
        lastfmUser: info.name,
        lastfmApiKey: apiKey.trim(),
        lastSyncUts: 0,
        backfillDone: false,
        backfillOldestUts: 0,
      })
      // fire and forget: metadata enrichment, then the full history backfill.
      // Credentials are passed explicitly; settingsRef may not have re-rendered yet.
      ;(async () => {
        try {
          await refreshMetadata(info.name, apiKey.trim())
        } catch (e) {
          console.warn('metadata fetch failed', e)
        }
        await runSync({ user: info.name, apiKey: apiKey.trim() })
      })()
      return { playcount: info.playcount }
    },
    [refreshMetadata, runSync, saveSettings],
  )

  const disconnect = useCallback(async () => {
    syncGen.current++ // any in-flight sync must not resurrect these settings
    setSync({ state: 'idle', lastSyncAt: null })
    await saveSettings({
      lastfmUser: '',
      lastfmApiKey: '',
      lastSyncUts: 0,
      backfillDone: false,
      backfillOldestUts: 0,
    })
  }, [saveSettings])

  const importCsv = useCallback(
    async (file: File, onProgress?: (rows: number, kept: number) => void) => {
      setImporting(true)
      setDemoPlays(null)
      try {
        const ak = makeArtistKeyer(playsRef.current).key
        const index = buildDedupeIndex(playsRef.current, ak)
        const knownArtists = buildArtistIndex(playsRef.current)
        const collected: Play[] = []
        const result = await parseAppleCsv(
          file,
          index,
          knownArtists,
          async (batch) => {
            await putPlays(batch)
            collected.push(...batch)
          },
          (p) => onProgress?.(p.rows, p.kept),
          ak,
        )
        mergePlays(collected)
        return result
      } finally {
        setImporting(false)
      }
    },
    [mergePlays],
  )

  const importSpotify = useCallback(
    async (files: File[], onProgress?: (filesRead: number) => void) => {
      setImporting(true)
      setDemoPlays(null)
      try {
        const arrays: { name: string; data: unknown }[] = []
        for (const f of files) {
          let data: unknown
          try {
            data = JSON.parse(await f.text())
          } catch {
            throw new Error(`${f.name} is not a JSON file from the Spotify export.`)
          }
          arrays.push({ name: f.name, data })
          onProgress?.(arrays.length)
        }
        const ak = makeArtistKeyer(playsRef.current).key
        const index = buildDedupeIndex(playsRef.current, ak)
        const { parseSpotifyFiles } = await import('../lib/spotify')
        const { plays: parsed, result } = parseSpotifyFiles(arrays, index, ak)
        await putPlays(parsed)
        mergePlays(parsed)
        return result
      } finally {
        setImporting(false)
      }
    },
    [mergePlays],
  )

  const clearSource = useCallback(
    async (source: Source) => {
      if (source === 'lastfm') {
        syncGen.current++
        setSync({ state: 'idle', lastSyncAt: null })
        await saveSettings({ lastSyncUts: 0, backfillDone: false, backfillOldestUts: 0 })
      }
      await clearPlays(source)
      setPlays((prev) => prev.filter((p) => p.source !== source))
    },
    [saveSettings],
  )

  const startDemo = useCallback(async () => {
    const { generateDemoPlays } = await import('../lib/demo')
    setDemoPlays(generateDemoPlays())
  }, [])

  const exitDemo = useCallback(() => setDemoPlays(null), [])

  // auto-sync when the app opens or returns to foreground
  useEffect(() => {
    if (!ready || !settings.autoSync || !settings.lastfmUser) return
    runSync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') runSync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.lastfmUser, settings.autoSync])

  const shownPlays = demoPlays ?? plays
  const shownArt = demoPlays ? NO_ART : albumArt
  const artists = useMemo(() => makeArtistKeyer(shownPlays), [shownPlays])

  const shownCovers = demoPlays ? NO_ART : covers

  const trackAlbums = useMemo(() => buildTrackAlbums(shownPlays, artists), [shownPlays, artists])
  const artFor = useCallback(
    (artist: string, album: string, track?: string) =>
      findArtwork(shownArt, artists, trackAlbums, artist, album, track),
    [artists, shownArt, trackAlbums],
  )

  const artistTopTracks = useMemo(() => buildArtistTopTracks(shownPlays, artists), [shownPlays, artists])

  const coverFor = useCallback(
    (kind: CoverKind, artist: string, album: string, track?: string): string | undefined => {
      if (kind === 'artist') {
        for (const t of artistTopTracks.get(artists.key(artist)) ?? []) {
          const url = artFor(t.artist, t.album, t.track) ?? shownCovers[trackCoverKey(artists, t.artist, t.track)]
          if (url) return url
        }
        return undefined
      }
      if (kind === 'track' && track) {
        return artFor(artist, album, track) ?? shownCovers[trackCoverKey(artists, artist, track)]
      }
      if (!album) return undefined
      return artFor(artist, album) ?? shownCovers[albumCoverKey(artists, artist, album)]
    },
    [artFor, artistTopTracks, artists, shownCovers],
  )

  /* ---- single cover lookups: a small queue, one request at a time ---- */

  const coverQueue = useRef<CoverJob[]>([])
  const coverQueued = useRef(new Set<string>())
  const coverPumping = useRef(false)
  const coverFound = useRef<CoverCache>({})
  const coverMissed = useRef<CoverMisses>({})
  const coverFlushTimer = useRef(0)
  // what wantCover reads; refs so the callback itself never changes
  const coverState = useRef({ covers, coverMisses, artists, artistTopTracks, artFor, demo: demoPlays !== null })
  coverState.current = { covers, coverMisses, artists, artistTopTracks, artFor, demo: demoPlays !== null }

  const flushCovers = useCallback(() => {
    clearTimeout(coverFlushTimer.current)
    coverFlushTimer.current = 0
    const found = coverFound.current
    const missed = coverMissed.current
    coverFound.current = {}
    coverMissed.current = {}
    const nFound = Object.keys(found).length
    const nMissed = Object.keys(missed).length
    if (nFound === 0 && nMissed === 0) return
    if (nFound > 0) {
      setCovers((prev) => {
        const next = { ...prev, ...found }
        kvSet('covers', next)
        return next
      })
    }
    if (nMissed > 0) {
      setCoverMisses((prev) => {
        const next = { ...prev, ...missed }
        kvSet('coverMisses', next)
        return next
      })
    }
    setCoverVersion((v) => v + 1)
  }, [])

  const pumpCovers = useCallback(async () => {
    if (coverPumping.current) return
    coverPumping.current = true
    try {
      while (coverQueue.current.length > 0) {
        const apiKey = settingsRef.current.lastfmApiKey
        if (!apiKey || !navigator.onLine) break
        const job = coverQueue.current.shift()!
        let url: string | undefined
        for (const a of job.attempts) {
          url =
            job.kind === 'track'
              ? await lookupTrackImage(a.artist, a.title, apiKey)
              : await lookupAlbumImage(a.artist, a.title, apiKey)
          await sleep(COVER_GAP_MS)
          if (url) break
        }
        coverQueued.current.delete(job.key)
        if (url) coverFound.current[job.key] = url
        else coverMissed.current[job.key] = Date.now()
        if (!coverFlushTimer.current) coverFlushTimer.current = window.setTimeout(flushCovers, COVER_FLUSH_MS)
      }
    } catch {
      // offline, rate-limited or a rejected key: nothing is recorded as missing,
      // the rows ask again next time they are on screen
    } finally {
      coverQueue.current = []
      coverQueued.current.clear()
      coverPumping.current = false
      flushCovers()
    }
  }, [flushCovers])

  const wantCover = useCallback(
    (kind: CoverKind, artist: string, album: string, track?: string) => {
      const st = coverState.current
      if (st.demo || !settingsRef.current.lastfmApiKey) return
      const known = (key: string) =>
        st.covers[key] !== undefined ||
        isFreshMiss(st.coverMisses, key) ||
        coverFound.current[key] !== undefined ||
        coverMissed.current[key] !== undefined
      const enqueue = (job: CoverJob) => {
        if (coverQueued.current.has(job.key)) return
        coverQueued.current.add(job.key)
        coverQueue.current.push(job)
        void pumpCovers()
      }
      const wantTrack = (a: string, t: string): boolean => {
        const key = trackCoverKey(st.artists, a, t)
        if (known(key)) return false
        enqueue({ key, kind: 'track', attempts: trackAttempts(st.artists, a, t) })
        return true
      }
      if (kind === 'artist') {
        // one song at a time: the next one is only tried once this one came back empty
        for (const t of (st.artistTopTracks.get(st.artists.key(artist)) ?? []).slice(0, ARTIST_LOOKUPS)) {
          if (st.artFor(t.artist, t.album, t.track)) return
          const key = trackCoverKey(st.artists, t.artist, t.track)
          if (st.covers[key] || coverFound.current[key] || coverQueued.current.has(key)) return
          if (wantTrack(t.artist, t.track)) return
        }
        return
      }
      if (kind === 'track' && track) {
        wantTrack(artist, track)
        return
      }
      if (!album) return
      const key = albumCoverKey(st.artists, artist, album)
      if (known(key)) return
      enqueue({ key, kind: 'album', attempts: albumAttempts(st.artists, artist, album) })
    },
    [pumpCovers],
  )

  const value = useMemo<AppState>(
    () => ({
      ready,
      plays: shownPlays,
      ownPlays: plays,
      demo: demoPlays !== null,
      startDemo,
      exitDemo,
      settings,
      durations,
      // demo artists are invented: no artwork, monograms only
      albumArt: shownArt,
      artists,
      artFor,
      coverFor,
      wantCover,
      coverVersion,
      sync,
      importing,
      connect,
      disconnect,
      syncNow: () => runSync(),
      importCsv,
      importSpotify,
      clearSource,
      saveSettings,
    }),
    [ready, shownPlays, plays, demoPlays, startDemo, exitDemo, settings, shownArt, artists, artFor, coverFor, wantCover, coverVersion, durations, sync, importing, connect, disconnect, runSync, importCsv, importSpotify, clearSource, saveSettings],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
