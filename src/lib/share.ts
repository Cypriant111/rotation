import { fmtInt } from './format'
import type { RankedItem } from './stats'

export interface CardData {
  periodLabel: string
  minutes: number
  plays: number
  artists: number
  streak: number
  topArtists: RankedItem[]
  topTracks: RankedItem[]
  estimated: boolean
}

export type CardFormat = 'story' | 'square'

const INK = '#f5f5f7'
const INK_2 = '#98989f'
const ACCENT = '#ff3b55'
const BG = '#101014'
const HAIRLINE = '#2a2a30'

const FONT = (weight: number | string, px: number) =>
  `${weight} ${px}px -apple-system, system-ui, "Segoe UI", Roboto, sans-serif`

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = ACCENT
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(16,16,20,0.55)'
  ctx.lineWidth = Math.max(1.5, r * 0.05)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2)
  ctx.fillStyle = BG
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.08, 0, Math.PI * 2)
  ctx.fillStyle = ACCENT
  ctx.fill()
  ctx.restore()
}

interface Layout {
  W: number
  H: number
  M: number
  /** content starts here (Stories keeps ~250px clear at top) */
  top: number
  /** nothing below H - bottom (Stories reply UI) */
  bottom: number
  heroPx: number
  nArtists: number
  nSongs: number
}

const LAYOUTS: Record<CardFormat, Layout> = {
  story: { W: 1080, H: 1920, M: 96, top: 270, bottom: 290, heroPx: 170, nArtists: 5, nSongs: 3 },
  square: { W: 1080, H: 1080, M: 88, top: 96, bottom: 104, heroPx: 150, nArtists: 3, nSongs: 0 },
}

export function renderCard(data: CardData, format: CardFormat): HTMLCanvasElement {
  const L = LAYOUTS[format]
  const canvas = document.createElement('canvas')
  canvas.width = L.W
  canvas.height = L.H
  const ctx = canvas.getContext('2d')!
  const width = L.W - L.M * 2

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, L.W, L.H)
  ctx.textBaseline = 'alphabetic'

  let y = L.top

  // header: mark + wordmark
  drawMark(ctx, L.M + 26, y, 26)
  ctx.fillStyle = INK
  ctx.font = FONT(700, 44)
  ctx.textBaseline = 'middle'
  ctx.fillText('Rotation', L.M + 72, y + 2)
  ctx.textBaseline = 'alphabetic'
  y += 96

  // period
  ctx.fillStyle = ACCENT
  ctx.font = FONT(700, 40)
  ctx.fillText(data.periodLabel.toUpperCase(), L.M, y)
  y += L.heroPx + 20

  // hero minutes
  ctx.fillStyle = INK
  ctx.font = FONT(800, L.heroPx)
  ctx.fillText(fmtInt(data.minutes), L.M, y)
  y += 62
  ctx.fillStyle = INK_2
  ctx.font = FONT(500, 44)
  ctx.fillText(`minutes listened${data.estimated ? ' *' : ''}`, L.M + 6, y)
  y += 100

  // stat strip
  const stats: [string, string][] = [
    [fmtInt(data.plays), 'plays'],
    [fmtInt(data.artists), 'artists'],
  ]
  if (data.streak > 1) stats.push([String(data.streak), 'day streak'])
  let sx = L.M
  for (const [value, label] of stats) {
    ctx.fillStyle = INK
    ctx.font = FONT(700, 56)
    ctx.fillText(value, sx, y)
    const vw = ctx.measureText(value).width
    ctx.fillStyle = INK_2
    ctx.font = FONT(400, 34)
    ctx.fillText(label, sx + vw + 14, y)
    sx += vw + 14 + ctx.measureText(label).width + 60
  }
  y += 84

  const list = (title: string, items: RankedItem[], rowH: number, withSub: boolean) => {
    ctx.fillStyle = INK_2
    ctx.font = FONT(600, 33)
    ctx.fillText(title.toUpperCase(), L.M, y)
    y += 20
    ctx.strokeStyle = HAIRLINE
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(L.M, y)
    ctx.lineTo(L.M + width, y)
    ctx.stroke()

    items.forEach((item, i) => {
      const rowY = y + rowH * (i + 1) - rowH * 0.3
      ctx.fillStyle = ACCENT
      ctx.font = FONT(700, 40)
      ctx.fillText(String(i + 1), L.M, rowY)

      const countText = fmtInt(item.plays)
      ctx.font = FONT(500, 34)
      const countW = ctx.measureText(countText).width
      ctx.fillStyle = INK_2
      ctx.fillText(countText, L.M + width - countW, rowY)

      const nameX = L.M + 64
      const nameW = width - 64 - countW - 28
      ctx.fillStyle = INK
      ctx.font = FONT(600, 40)
      if (withSub && item.sub) {
        ctx.fillText(truncate(ctx, item.name, nameW), nameX, rowY - 16)
        ctx.fillStyle = INK_2
        ctx.font = FONT(400, 29)
        ctx.fillText(truncate(ctx, item.sub, nameW), nameX, rowY + 22)
      } else {
        ctx.fillText(truncate(ctx, item.name, nameW), nameX, rowY)
      }
    })
    y += rowH * items.length + 64
  }

  if (data.topArtists.length > 0 && L.nArtists > 0) {
    list('Top artists', data.topArtists.slice(0, L.nArtists), 78, false)
  }
  if (data.topTracks.length > 0 && L.nSongs > 0) {
    list('Top songs', data.topTracks.slice(0, L.nSongs), 92, true)
  }

  // footer, pinned above the bottom safe zone
  ctx.fillStyle = INK_2
  ctx.font = FONT(400, 28)
  const foot = data.estimated ? '* includes estimated durations' : 'from Apple Music listening'
  ctx.fillText(foot, L.M, L.H - L.bottom)

  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
}

export interface ShareOutcome {
  method: 'share-sheet' | 'download' | 'none'
}

/** Share a rendered card through the iOS share sheet, falling back to download.
 *  Files only, no title/text: WebKit drops the image for some targets otherwise. */
export async function shareCard(blob: Blob, periodLabel: string): Promise<ShareOutcome> {
  const file = new File([blob], `rotation-${periodLabel.toLowerCase().replace(/\s+/g, '-')}.png`, {
    type: 'image/png',
  })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return { method: 'share-sheet' }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return { method: 'none' }
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return { method: 'download' }
}
