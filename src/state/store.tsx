/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { clearPlays, getAllPlays, kvGet, kvSet, putPlays, requestPersistence } from '../lib/db'
import { buildArtistIndex, buildDedupeIndex, parseAppleCsv } from '../lib/csv'
import type { ImportResult } from '../lib/csv'
import { fetchAlbumArt, fetchDurations, fetchScrobbles, getUserInfo } from '../lib/lastfm'
import type { DurationMap, Play, Settings } from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/types'

export type SyncStatus =
  | { state: 'idle'; lastSyncAt: number | null }
  | { state: 'syncing'; fetched: number; page: number; totalPages: number }
  | { state: 'error'; message: string }

interface AppState {
  ready: boolean
  plays: Play[]
  settings: Settings
  durations: DurationMap
  albumArt: Record<string, string>
  sync: SyncStatus
  importing: boolean
  connect: (user: string, apiKey: string) => Promise<{ playcount: number }>
  disconnect: () => Promise<void>
  syncNow: () => Promise<void>
  importCsv: (file: File, onProgress?: (rows: number, kept: number) => void) => Promise<ImportResult>
  clearSource: (source: 'lastfm' | 'csv') => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>
}

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
  const [sync, setSync] = useState<SyncStatus>({ state: 'idle', lastSyncAt: null })
  const [importing, setImporting] = useState(false)
  const syncing = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // boot: load everything from IndexedDB
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [stored, savedSettings, savedDurations, savedArt, lastSyncAt] = await Promise.all([
        getAllPlays(),
        kvGet<Settings>('settings'),
        kvGet<[string, number][]>('durations'),
        kvGet<Record<string, string>>('albumArt'),
        kvGet<number>('lastSyncAt'),
      ])
      if (!alive) return
      stored.sort((a, b) => b.ts - a.ts)
      setPlays(stored)
      if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
      if (savedDurations) setDurations(new Map(savedDurations))
      if (savedArt) setAlbumArt(savedArt)
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
      const fresh = incoming.filter((p) => !seen.has(p.id))
      if (fresh.length === 0) return prev
      const next = [...prev, ...fresh]
      next.sort((a, b) => b.ts - a.ts)
      return next
    })
  }, [])

  const runSync = useCallback(async () => {
    const s = settingsRef.current
    if (!s.lastfmUser || !s.lastfmApiKey || syncing.current) return
    syncing.current = true
    setSync({ state: 'syncing', fetched: 0, page: 0, totalPages: 0 })
    try {
      const result = await fetchScrobbles(s.lastfmUser, s.lastfmApiKey, s.lastSyncUts, (p) =>
        setSync({ state: 'syncing', fetched: p.fetched, page: p.page, totalPages: p.totalPages }),
      )
      await putPlays(result.plays)
      mergePlays(result.plays)
      const now = Date.now()
      await kvSet('lastSyncAt', now)
      await saveSettings({ lastSyncUts: result.newestUts, backfillDone: true })
      setSync({ state: 'idle', lastSyncAt: now })
    } catch (e) {
      setSync({ state: 'error', message: (e as Error).message })
    } finally {
      syncing.current = false
    }
  }, [mergePlays, saveSettings])

  const connect = useCallback(
    async (user: string, apiKey: string) => {
      const info = await getUserInfo(user.trim(), apiKey.trim())
      await saveSettings({ lastfmUser: info.name, lastfmApiKey: apiKey.trim(), lastSyncUts: 0, backfillDone: false })
      // fire and forget: metadata enrichment, then the full history backfill
      ;(async () => {
        try {
          const [durs, art] = await Promise.all([
            fetchDurations(info.name, apiKey.trim()),
            fetchAlbumArt(info.name, apiKey.trim()),
          ])
          setDurations(durs)
          setAlbumArt(art)
          await kvSet('durations', [...durs.entries()])
          await kvSet('albumArt', art)
        } catch (e) {
          console.warn('metadata fetch failed', e)
        }
        await runSync()
      })()
      return { playcount: info.playcount }
    },
    [runSync, saveSettings],
  )

  const disconnect = useCallback(async () => {
    await saveSettings({ lastfmUser: '', lastfmApiKey: '', lastSyncUts: 0, backfillDone: false })
  }, [saveSettings])

  const importCsv = useCallback(
    async (file: File, onProgress?: (rows: number, kept: number) => void) => {
      setImporting(true)
      try {
        const index = buildDedupeIndex(plays)
        const knownArtists = buildArtistIndex(plays)
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
        )
        mergePlays(collected)
        return result
      } finally {
        setImporting(false)
      }
    },
    [mergePlays, plays],
  )

  const clearSource = useCallback(async (source: 'lastfm' | 'csv') => {
    await clearPlays(source)
    setPlays((prev) => prev.filter((p) => p.source !== source))
    if (source === 'lastfm') {
      setSettings((prev) => {
        const next = { ...prev, lastSyncUts: 0, backfillDone: false }
        kvSet('settings', next)
        return next
      })
    }
  }, [])

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

  const value = useMemo<AppState>(
    () => ({
      ready,
      plays,
      settings,
      durations,
      albumArt,
      sync,
      importing,
      connect,
      disconnect,
      syncNow: runSync,
      importCsv,
      clearSource,
      saveSettings,
    }),
    [ready, plays, settings, durations, albumArt, sync, importing, connect, disconnect, runSync, importCsv, clearSource, saveSettings],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
