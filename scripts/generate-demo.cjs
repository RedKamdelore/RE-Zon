// Генератор демо-аудио: 4 WAV-файла (44.1 кГц, 16-bit PCM mono, ~20 c)
// с простыми мелодиями из синусов и ADSR-подобной огибающей (без щелчков).
const fs = require('fs')
const path = require('path')

const SR = 44100
const DUR = 20 // секунд
const N = SR * DUR

const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12)

// Огибающая: attack 10 мс, decay 80 мс до sustain 0.7, release 60 мс
function envelope(n, len) {
  const atk = 0.01 * SR, dec = 0.08 * SR, rel = 0.06 * SR, sus = 0.7
  if (n < atk) return n / atk
  if (n < atk + dec) return 1 - (1 - sus) * ((n - atk) / dec)
  if (n > len - rel) return sus * Math.max(0, (len - n) / rel)
  return sus
}

// notes: [[midi|null, beats], ...]; harm — вес 2-й гармоники (тембр)
function render(notes, bpm, harm) {
  const out = new Float64Array(N)
  const beatSec = 60 / bpm
  let t = 0
  for (const [midi, beats] of notes) {
    const dur = beats * beatSec
    if (t >= DUR) break
    const start = Math.floor(t * SR)
    const end = Math.min(N, Math.floor((t + dur) * SR))
    if (midi !== null) {
      const f = midiFreq(midi)
      const len = end - start
      for (let i = start; i < end; i++) {
        const ph = 2 * Math.PI * f * (i / SR)
        out[i] += envelope(i - start, len) * (Math.sin(ph) + harm * Math.sin(2 * ph)) * 0.45
      }
    }
    t += dur
  }
  // глобальный fade-out 100 мс, чтобы обрезка по 20 с не давала щелчка
  const fade = Math.floor(0.1 * SR)
  for (let i = N - fade; i < N; i++) out[i] *= (N - i) / fade
  return out
}

function wavBuffer(samples) {
  const dataSize = N * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)        // fmt chunk size
  buf.writeUInt16LE(1, 20)         // PCM
  buf.writeUInt16LE(1, 22)         // mono
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)    // byte rate
  buf.writeUInt16LE(2, 32)         // block align
  buf.writeUInt16LE(16, 34)        // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < N; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }
  return buf
}

// --- мелодии: [midi, beats], null = пауза ---
// A minor pentatonic, 100 BPM
const NEON_SUNSET = [
  [69, 1], [72, 1], [74, 1], [76, 1], [79, 2], [76, 1], [74, 1],
  [72, 1], [74, 1], [69, 2], [null, 1], [67, 1], [69, 1], [72, 2],
  [74, 1], [76, 1], [79, 1], [81, 2], [79, 1], [76, 1], [74, 2],
  [72, 1], [74, 1], [72, 1], [69, 3], [null, 1], [69, 2], [72, 2],
]
// D minor, 120 BPM
const NIGHT_DRIVE = [
  [62, 0.5], [65, 0.5], [69, 1], [65, 1], [62, 1], [null, 0.5], [62, 0.5],
  [65, 1], [67, 1], [69, 2], [72, 1], [69, 1], [67, 1], [65, 1],
  [62, 2], [null, 1], [74, 1], [72, 1], [69, 1], [67, 1], [65, 2],
  [69, 1], [67, 1], [65, 1], [62, 2], [null, 1], [62, 1], [65, 1], [67, 1], [69, 3],
]
// C major, 80 BPM
const RAINY_LOOPS = [
  [72, 2], [71, 1], [67, 1], [64, 2], [null, 1], [67, 1],
  [69, 2], [67, 1], [64, 1], [62, 2], [60, 2],
  [64, 1], [67, 1], [72, 2], [76, 2], [74, 1], [72, 1],
  [71, 2], [67, 2], [60, 3], [null, 1], [64, 1], [67, 1], [72, 2],
]
// E minor, 90 BPM
const ANALOG_DREAMS = [
  [64, 1.5], [67, 0.5], [71, 2], [70, 1], [67, 1], [64, 2],
  [null, 1], [62, 1], [64, 1], [67, 1], [71, 1.5], [76, 1.5],
  [74, 1], [71, 1], [70, 1], [67, 1], [64, 3], [null, 1],
  [59, 1], [62, 1], [64, 2], [67, 2], [71, 3],
]

const TRACKS = [
  ['neon-sunset.wav', NEON_SUNSET, 100, 0.3],
  ['night-drive.wav', NIGHT_DRIVE, 120, 0.15],
  ['rainy-loops.wav', RAINY_LOOPS, 80, 0.4],
  ['analog-dreams.wav', ANALOG_DREAMS, 90, 0.25],
]

const outDir = path.join(__dirname, '..', 'resources', 'demo')
fs.mkdirSync(outDir, { recursive: true })
for (const [name, notes, bpm, harm] of TRACKS) {
  const file = path.join(outDir, name)
  fs.writeFileSync(file, wavBuffer(render(notes, bpm, harm)))
  console.log(`[demo] written ${file}`)
}
