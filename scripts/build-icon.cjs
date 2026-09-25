const { Resvg } = require('@resvg/resvg-js')
const fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '..', 'resources')
const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8')
const png = width => new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render().asPng()
fs.writeFileSync(path.join(root, 'icon.png'), png(512))
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = sizes.map(png)
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
let offset = header.length
sizes.forEach((size, i) => {
  const entry = 6 + i * 16
  header[entry] = size === 256 ? 0 : size; header[entry + 1] = header[entry]
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(images[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12)
  offset += images[i].length
})
fs.writeFileSync(path.join(root, 'icon.ico'), Buffer.concat([header, ...images]))
console.log('Built label icon: PNG 512 and ICO 16–256')
