// Generates PWA icons from an inline SVG master. Run: node scripts/icons.mjs
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const BG = '#17171b'
const ACCENT = '#ff3b55'
const LABEL = '#f2f2f4'

// r = disc radius; iOS squircle-masks the full square, maskable needs padding
function master(r) {
  const grooves = [r * 0.86, r * 0.72, r * 0.58]
    .map(
      (gr) =>
        `<circle cx="512" cy="512" r="${gr}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="10"/>`,
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect width="1024" height="1024" fill="${BG}"/>
  <circle cx="512" cy="512" r="${r}" fill="${ACCENT}"/>
  ${grooves}
  <circle cx="512" cy="512" r="${r * 0.36}" fill="${LABEL}"/>
  <circle cx="512" cy="512" r="${r * 0.085}" fill="${BG}"/>
</svg>`
}

await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true })

const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname

const full = Buffer.from(master(408))
const padded = Buffer.from(master(330)) // maskable safe zone

await sharp(full).resize(180, 180).png().toFile(out('apple-touch-icon.png'))
await sharp(full).resize(192, 192).png().toFile(out('icon-192.png'))
await sharp(full).resize(512, 512).png().toFile(out('icon-512.png'))
await sharp(padded).resize(512, 512).png().toFile(out('icon-512-maskable.png'))

console.log('icons written to public/icons/')
