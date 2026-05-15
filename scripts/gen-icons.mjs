import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function makeSvg(size) {
  const r = Math.round(size * 0.22)          // corner radius ~22%
  const strokeW = Math.max(1.5, size * 0.028) // stroke scales with size
  const iconSize = Math.round(size * 0.58)    // icon occupies 58% of tile
  const offset = Math.round((size - iconSize) / 2)
  const scale = iconSize / 24                 // lucide icons use 24×24 viewbox

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#141820"/>
  <g transform="translate(${offset},${offset}) scale(${scale})">
    <path
      d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
      fill="none"
      stroke="#7BAF8A"
      stroke-width="${strokeW}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>
</svg>`
}

const sizes = [192, 512]
for (const size of sizes) {
  const svg = Buffer.from(makeSvg(size))
  await sharp(svg)
    .png()
    .toFile(path.join(__dirname, `../public/icons/icon-${size}.png`))
  console.log(`Generated icon-${size}.png`)
}

// Also generate a 64×64 PNG for the favicon fallback
const svg64 = Buffer.from(makeSvg(64))
await sharp(svg64)
  .png()
  .toFile(path.join(__dirname, '../public/favicon-64.png'))
console.log('Generated favicon-64.png')
