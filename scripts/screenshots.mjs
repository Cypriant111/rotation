// Screenshots and layout checks in headless Chrome, over the DevTools
// protocol (no extra dependencies; needs Node 22+ for the global WebSocket).
//
//   npm run dev   (in another terminal)
//   node scripts/screenshots.mjs --out docs/screenshots --scheme dark
//
// Options:
//   --base <url>     app URL (default http://localhost:5173/rotation/)
//   --out <dir>      where PNGs go (default docs/screenshots)
//   --scheme <s>     dark | light (default dark)
//   --width <px>     viewport width (default 375; height 812)
//   --tabs <list>    comma list of tabs (default home,top,mixes,recap)
//   --no-demo        open without ?demo (first-run screen)
//   --keep-bar       keep the "Demo data" bar in the shot (cropped by default)
//   --ua android     emulate Chrome on Android (default: desktop Chrome UA)
//   --fake-install   fire a synthetic beforeinstallprompt (Android install UI)
//   --full           capture the whole scrollable page, not just the viewport
//
// Prints document.documentElement.scrollWidth for every tab, so horizontal
// overflow shows up as a number larger than the viewport width.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : dflt
}
const flag = (name) => args.includes(`--${name}`)

const BASE = opt('base', 'http://localhost:5173/rotation/')
const OUT = opt('out', 'docs/screenshots')
const SCHEME = opt('scheme', 'dark')
const WIDTH = Number(opt('width', '375'))
const HEIGHT = 812
const TABS = opt('tabs', 'home,top,mixes,recap').split(',')
const DEMO = !flag('no-demo')
const CROP_BAR = DEMO && !flag('keep-bar')
const FULL = flag('full')
const UA = opt('ua', '')
const FAKE_INSTALL = flag('fake-install')
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const CHROME =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9300 + Math.floor(Math.random() * 500)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = await mkdtemp(join(tmpdir(), 'rotation-shots-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function connect() {
  for (let i = 0; i < 200; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
      return (await res.json()).webSocketDebuggerUrl
    } catch {
      await sleep(200)
    }
  }
  throw new Error('Chrome did not start')
}

const ws = new WebSocket(await connect())
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message))
    else resolve(msg.result)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value

async function waitFor(expression, timeout = 15000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await evaluate(expression)) return
    await sleep(150)
  }
  throw new Error(`timed out waiting for: ${expression}`)
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 3,
    mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: SCHEME }],
  })
  if (UA === 'android') await send('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA, platform: 'Linux armv8l' })
  // README shots: no install banner (emulated touch on a Mac reads as an iPad)
  if (!FAKE_INSTALL) {
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('installDismissed', '1') } catch {}`,
    })
  }
  const url = DEMO ? `${BASE}${BASE.includes('?') ? '&' : '?'}demo` : BASE
  await send('Page.navigate', { url })
  await waitFor(`!!document.querySelector('.tabbar')`)
  if (DEMO) await waitFor(`!!document.querySelector('.demo-bar') && !!document.querySelector('.kpi-row')`)
  await sleep(600)
  if (FAKE_INSTALL) {
    await evaluate(`(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true })
      e.prompt = async () => {}
      e.userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(e)
    })()`)
    await sleep(300)
  }

  await mkdir(OUT, { recursive: true })
  const widths = {}
  for (const tab of TABS) {
    await evaluate(`(() => {
      const label = ${JSON.stringify(tab)}.toLowerCase()
      const b = [...document.querySelectorAll('.tabbar button')].find((x) => x.textContent.trim().toLowerCase() === label)
      b?.click()
      window.scrollTo(0, 0)
    })()`)
    await sleep(700)
    widths[tab] = await evaluate('document.documentElement.scrollWidth')
    const barH = CROP_BAR ? await evaluate(`document.querySelector('.demo-bar')?.offsetHeight ?? 0`) : 0
    const fullH = FULL ? await evaluate('document.documentElement.scrollHeight') : HEIGHT
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: FULL,
      ...(barH > 0 || FULL ? { clip: { x: 0, y: barH, width: WIDTH, height: fullH - barH, scale: 1 } } : {}),
    })
    await writeFile(join(OUT, `${tab}.png`), Buffer.from(shot.data, 'base64'))
  }
  console.log(JSON.stringify({ width: WIDTH, scheme: SCHEME, scrollWidth: widths }))
} finally {
  ws.close()
  chrome.kill()
  await sleep(300)
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
