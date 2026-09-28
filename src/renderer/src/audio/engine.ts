export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

/** Пресеты эквалайзера (dB по 10 полосам) — потребляются EQ UI (Task 13) */
export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bass: [6, 5, 4, 3, 1, 0, 0, 0, 0, 0],
  Rock: [4, 2, 0, -1, -1, 0, 2, 3, 3, 3],
  Pop: [-1, -1, 0, 2, 3, 3, 2, 0, -1, -1],
  Vocal: [-2, -3, -2, 0, 2, 4, 4, 3, 1, 0],
}

/** Громкость в диапазоне [0, 1] */
export const clampVolume = (v: number): number => Math.min(1, Math.max(0, v))

const XFADE_POINTS = 32

/**
 * Equal-power кривые кроссфейда: fadeIn = sin(t·π/2), fadeOut = cos(t·π/2).
 * Сумма квадратов = 1 в каждой точке — громкость не проседает посередине.
 */
export function equalPowerCurves(points = XFADE_POINTS): { fadeIn: Float32Array; fadeOut: Float32Array } {
  const fadeIn = new Float32Array(points)
  const fadeOut = new Float32Array(points)
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1)
    fadeIn[i] = Math.sin((t * Math.PI) / 2)
    fadeOut[i] = Math.cos((t * Math.PI) / 2)
  }
  return { fadeIn, fadeOut }
}

/**
 * Одна дека: <audio> → MediaElementSource → GainNode (гейн кроссфейда).
 * createMediaElementSource допустим лишь раз на элемент — создаётся в конструкторе.
 */
export class Deck {
  readonly el = new Audio()
  readonly gain: GainNode

  constructor(ctx: AudioContext) {
    this.el.crossOrigin = 'anonymous'
    const src = ctx.createMediaElementSource(this.el)
    this.gain = ctx.createGain()
    src.connect(this.gain)
  }
}

export class AudioEngine {
  private ctx = new AudioContext()
  private decks: [Deck, Deck] = [new Deck(this.ctx), new Deck(this.ctx)]
  private activeIndex = 0
  private stopTimer: ReturnType<typeof setTimeout> | null = null
  private filters = EQ_FREQS.map((f) => {
    const node = this.ctx.createBiquadFilter()
    node.type = 'peaking'
    node.frequency.value = f
    node.Q.value = 1
    return node
  })
  private gain = this.ctx.createGain()
  private analyser = this.ctx.createAnalyser()
  private levelSamples = new Uint8Array(0)

  constructor() {
    // Обе деки → общая цепь: 10-полосный EQ → master gain → destination
    for (const deck of this.decks) deck.gain.connect(this.filters[0])
    const chain = [...this.filters, this.gain]
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1])
    this.analyser.fftSize = 256
    this.levelSamples = new Uint8Array(this.analyser.frequencyBinCount)
    this.gain.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
    // Деки в DOM (скрыты): отладка/DevTools видят оба элемента, на звук не влияет
    for (const deck of this.decks) {
      deck.el.style.display = 'none'
      document.body.appendChild(deck.el)
    }
  }

  private get active(): Deck {
    return this.decks[this.activeIndex]
  }
  private get inactive(): Deck {
    return this.decks[1 - this.activeIndex]
  }

  /** Элемент АКТИВНОЙ деки — существующие подписки/чтение currentTime работают как раньше */
  get element(): HTMLAudioElement {
    return this.active.el
  }

  /** Элементы обеих дек — initPlayerSubscriptions подписывается на обе (с фильтром по активной) */
  get elements(): HTMLAudioElement[] {
    return this.decks.map((d) => d.el)
  }

  play(url: string): void {
    this.stopInactive()
    const deck = this.active
    deck.gain.gain.cancelScheduledValues(this.ctx.currentTime)
    deck.gain.gain.value = 1
    deck.el.src = url
    void this.ctx.resume()
    // catch: AbortError при быстрой смене src (play() прерывается новым load) — не ошибка
    deck.el.play().catch(() => {})
  }
  pause(): void {
    // Паузим обе деки: иначе затихающая при кроссфейде доиграла бы вслух
    for (const deck of this.decks) deck.el.pause()
  }
  resume(): void {
    void this.ctx.resume()
    // catch: AbortError при быстрой смене src — не ошибка
    this.active.el.play().catch(() => {})
  }
  /** Устанавливает src без воспроизведения ('' — очистить) */
  load(url: string): void {
    if (url) this.active.el.src = url
    else this.active.el.removeAttribute('src')
  }
  seek(sec: number): void {
    this.active.el.currentTime = sec
  }
  setVolume(v: number): void {
    this.gain.gain.value = clampVolume(v)
  }
  setEqGain(band: number, db: number): void {
    if (band < 0 || band >= this.filters.length) return
    this.filters[band].gain.value = db
  }

  /** Текущая громкость выходного сигнала для фоновой анимации, 0…1. */
  getLevel(): number {
    this.analyser.getByteTimeDomainData(this.levelSamples)
    let sum = 0
    for (const sample of this.levelSamples) {
      const amplitude = (sample - 128) / 128
      sum += amplitude * amplitude
    }
    return Math.min(1, Math.sqrt(sum / this.levelSamples.length) * 5)
  }

  /**
   * Кроссфейд: неактивная дека стартует с 0 и набирает громкость, активная затихает
   * (equal-power setValueCurveAtTime по времени AudioContext), деки меняются местами.
   * Старая дека останавливается после затихания. durationSec <= 0 — жёсткое переключение.
   */
  crossfadeTo(url: string, durationSec: number): void {
    if (durationSec <= 0) {
      this.play(url)
      return
    }
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
    const from = this.active
    const to = this.inactive
    const now = this.ctx.currentTime
    const { fadeIn, fadeOut } = equalPowerCurves()
    to.gain.gain.cancelScheduledValues(now)
    to.gain.gain.setValueAtTime(0, now)
    to.gain.gain.setValueCurveAtTime(fadeIn, now, durationSec)
    from.gain.gain.cancelScheduledValues(now)
    from.gain.gain.setValueAtTime(1, now)
    from.gain.gain.setValueCurveAtTime(fadeOut, now, durationSec)
    to.el.src = url
    void this.ctx.resume()
    // catch: AbortError при быстрой смене src — не ошибка
    to.el.play().catch(() => {})
    this.activeIndex = 1 - this.activeIndex
    // ended старой деки стор игнорирует (неактивная), но src всё равно снимаем после затихания
    this.stopTimer = setTimeout(() => {
      from.el.pause()
      from.el.removeAttribute('src')
      this.stopTimer = null
    }, durationSec * 1000 + 100)
  }

  /** Жёсткая остановка неактивной деки и отмена pending-останова (play при смене трека) */
  private stopInactive(): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
    const other = this.inactive
    other.el.pause()
    other.el.removeAttribute('src')
    other.gain.gain.cancelScheduledValues(this.ctx.currentTime)
    other.gain.gain.value = 1
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

/**
 * URL воспроизведения трека: http(s)-потоки (VK и др.) идут напрямую,
 * локальные пути — через media:// (см. main/index.ts protocol.handle).
 */
export function resolveTrackUrl(track: { filePath: string }): string {
  return track.filePath.startsWith('http') ? track.filePath : mediaUrl(track.filePath)
}
