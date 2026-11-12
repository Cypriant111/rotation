// Generates the 1200x630 link-preview image (Open Graph / Twitter card).
// Run: node scripts/og.mjs   (writes public/og.png)
import sharp from 'sharp'

const BG = '#101014'
const INK = '#f5f5f7'
const INK_2 = '#98989f'
const ACCENT = '#ff3b55'
const FONT = "-apple-system, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif"

const TITLE = 'Rotation'
const LINE_1 = 'Your music listening,'
const SUB = 'Apple Music or Spotify. Minutes, top artists, mixes, recap cards.'

// a week of minutes, purely decorative
const BARS = [38, 64, 51, 92, 70, 118, 86]

function disc(cx, cy, r) {
  const grooves = [0.86, 0.72, 0.58]
    .map((k) => `<circle cx="${cx}" cy="${cy}" r="${r * k}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="${r * 0.025}"/>`)
    .join('')
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ACCENT}"/>${grooves}
  <circle cx="${cx}" cy="${cy}" r="${r * 0.36}" fill="${INK}"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.085}" fill="${BG}"/>`
}

function bars(x0, baseY) {
  const w = 34
  const gap = 14
  return BARS.map((h, i) => {
    const x = x0 + i * (w + gap)
    const op = i === BARS.length - 2 ? 1 : 0.42
    return `<rect x="${x}" y="${baseY - h * 1.6}" width="${w}" height="${h * 1.6}" rx="6" fill="${ACCENT}" opacity="${op}"/>`
  }).join('')
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${BG}"/>
  ${disc(156, 162, 62)}
  <text x="244" y="186" font-family="${FONT}" font-size="66" font-weight="800" fill="${INK}" letter-spacing="-1.5">${TITLE}</text>
  <text x="96" y="352" font-family="${FONT}" font-size="54" font-weight="700" fill="${INK}" letter-spacing="-1">${LINE_1}</text>
  <text x="96" y="420" font-family="${FONT}" font-size="54" font-weight="700" fill="${ACCENT}" letter-spacing="-1">in numbers.</text>
  <text x="96" y="514" font-family="${FONT}" font-size="30" font-weight="400" fill="${INK_2}">${SUB}</text>
  ${bars(800, 236)}
  <line x1="800" y1="238" x2="1124" y2="238" stroke="#2a2a30" stroke-width="2"/>
</svg>`

const out = new URL('../public/og.png', import.meta.url).pathname
await sharp(Buffer.from(svg)).png().toFile(out)
console.log('wrote', out)
