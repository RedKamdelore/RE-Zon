export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

/** Пресеты эквалайзера (dB по 10 полосам) — потребляются EQ UI (Task 13) */
export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bass: [6, 5, 4, 3, 1, 0, 0, 0, 0, 0],
  Rock: [4, 2, 0, -1, -1, 0, 2, 3, 3, 3],
  Pop: [-1, -1, 0, 2, 3, 3, 2, 0, -1, -1],
  Vocal: [-2, -3, -2, 0, 2, 4, 4, 3, 1, 0],
}

export class AudioEngine {
  private ctx = new AudioContext()
  private el = new Audio()
  private src = this.ctx.createMediaElementSource(this.el)
  private filters = EQ_FREQS.map((f) => {
    const node = this.ctx.createBiquadFilter()
    node.type = 'peaking'
    node.frequency.value = f
    node.Q.value = 1
    return node
  })
  private gain = this.ctx.createGain()

  constructor() {
    const chain = [this.src, ...this.filters, this.gain]
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1])
    this.gain.connect(this.ctx.destination)
    this.el.crossOrigin = 'anonymous'
  }

  get element(): HTMLAudioElement {
    return this.el
  }

  play(url: string): void {
    this.el.src = url
    void this.ctx.resume()
    void this.el.play()
  }
  pause(): void {
    this.el.pause()
  }
  resume(): void {
    void this.ctx.resume()
    void this.el.play()
  }
  seek(sec: number): void {
    this.el.currentTime = sec
  }
  setVolume(v: number): void {
    this.gain.gain.value = v
  }
  setEqGain(band: number, db: number): void {
    this.filters[band].gain.value = db
  }
}

/**
 * Локальный/демо путь → media:// URL.
 * Renderer-safe base64url (Buffer недоступен без nodeIntegration);
 * совпадает с Node Buffer.toString('base64url') — проверено тестом.
 */
export function mediaUrl(filePath: string): string {
  const bytes = new TextEncoder().encode(filePath)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `media://${btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`
}
