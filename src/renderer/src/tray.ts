import type { TrayPlayerState } from '../../shared/trayPlayer'
import './styles/tray.css'

interface TrayApi {
  state: () => Promise<TrayPlayerState | null>
  onState: (callback: (state: TrayPlayerState) => void) => () => void
  command: (command: string) => void
  showMain: () => void
}
declare global { interface Window { trayApi: TrayApi } }

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const cover = $<HTMLImageElement>('cover')
const seek = $<HTMLInputElement>('seek')
const play = $<HTMLButtonElement>('play')
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2,'0')}`
let state: TrayPlayerState | null = null
let dragging = false

function render(next: TrayPlayerState): void {
  state = next
  $('title').textContent = next.title
  $('artist').textContent = next.artist
  const art = next.cover && /^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/i.test(next.cover) ? next.cover : ''
  cover.src = art
  cover.hidden = !art
  $('placeholder').hidden = !!art
  play.textContent = next.playing ? 'Ⅱ' : '▶'
  play.setAttribute('aria-label',next.playing ? 'Пауза' : 'Воспроизвести')
  for (const id of ['prev','play','next']) (document.getElementById(id) as HTMLButtonElement).disabled = !next.hasTrack
  seek.disabled = !next.hasTrack || next.durationSec <= 0
  seek.max = String(Math.max(1,next.durationSec))
  if (!dragging) seek.value = String(Math.min(next.currentSec,next.durationSec || 1))
  $('current').textContent = fmt(next.currentSec)
  $('duration').textContent = fmt(next.durationSec)
}

for (const command of ['prev','next'] as const) $(command).addEventListener('click',()=>window.trayApi.command(command))
play.addEventListener('click',()=>window.trayApi.command('toggle'))
$('open').addEventListener('click',()=>window.trayApi.showMain())
seek.addEventListener('pointerdown',()=>{dragging=true})
seek.addEventListener('pointerup',()=>{dragging=false})
seek.addEventListener('change',()=>{ if (state?.hasTrack) window.trayApi.command(`seek:${Number(seek.value)}`) })
window.trayApi.onState(render)
void window.trayApi.state().then(value=>{if(value)render(value)})
