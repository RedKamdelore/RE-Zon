// Генератор иконки приложения: 512×512 PNG без внешних зависимостей.
// Зелёный круг #1DB954 на прозрачном фоне с тремя чёрными "звуковыми" дугами.
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const W = 512
const H = 512

// --- геометрия ---
const CX = 256, CY = 256, R = 240 // круг
const ARC_CX = 110, ARC_CY = 420  // центр дуг (левый нижний сектор)
const ARCS = [
  { r: 90,  t: 30, a0: -70, a1: -15 },
  { r: 140, t: 30, a0: -72, a1: -13 },
  { r: 190, t: 30, a0: -74, a1: -11 },
]

const GREEN = [0x1d, 0xb9, 0x54]
const BLACK = [0x00, 0x00, 0x00]

function pixel(x, y) {
  const dcx = x - CX, dcy = y - CY
  if (dcx * dcx + dcy * dcy > R * R) return [0, 0, 0, 0] // прозрачный фон

  // дуги: полярные координаты относительно ARC_C*
  const dx = x - ARC_CX, dy = y - ARC_CY
  const d = Math.hypot(dx, dy)
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI
  for (const a of ARCS) {
    if (ang >= a.a0 && ang <= a.a1 && Math.abs(d - a.r) <= a.t / 2) {
      return [...BLACK, 255]
    }
  }
  return [...GREEN, 255]
}

// --- PNG primitives ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

// --- сборка изображения ---
const raw = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) {
  const row = y * (1 + W * 4)
  raw[row] = 0 // filter: none
  for (let x = 0; x < W; x++) {
    const [r, g, b, a] = pixel(x, y)
    const o = row + 1 + x * 4
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8  // bit depth
ihdr[9] = 6  // color type: RGBA
// 10..12: compression/filter/interlace = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const outDir = path.join(__dirname, '..', 'resources')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'icon.png')
fs.writeFileSync(outFile, png)
console.log(`[icon] written ${outFile} (${png.length} bytes)`)
