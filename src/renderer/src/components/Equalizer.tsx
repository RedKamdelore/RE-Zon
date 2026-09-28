import type { CSSProperties } from 'react'
import { EQ_FREQS, EQ_PRESETS } from '../audio/engine'
import { usePlayerStore } from '../stores/playerStore'
import { persistPatch } from '../stores/playlistStore'
import { useSettingsStore } from '../stores/settingsStore'

const EQ_MIN = -12
const EQ_MAX = 12
const EQ_PRESET_LABELS: Record<string, string> = {
  Flat: 'Ровный',
  Bass: 'Басы',
  Rock: 'Рок',
  Pop: 'Поп',
  Vocal: 'Вокал',
}

/** 31 → «31», 1000 → «1k» */
const freqLabel = (f: number): string => (f >= 1000 ? `${f / 1000}k` : String(f))

/** −12…+12 → «−12»…«+12» (0 без знака) */
const fmtDb = (db: number): string => (db > 0 ? `+${db}` : String(db))

/** Заполнение трека снизу вверх: −12 dB = 0%, +12 dB = 100% */
const sliderStyle = (db: number): CSSProperties =>
  ({ '--progress': `${((db - EQ_MIN) / (EQ_MAX - EQ_MIN)) * 100}%` }) as CSSProperties

export default function Equalizer() {
  const eqGains = usePlayerStore((s) => s.eqGains)
  const setEqGain = usePlayerStore((s) => s.setEqGain)
  const applyEqPreset = usePlayerStore((s) => s.applyEqPreset)
  const crossfadeSec = useSettingsStore((s) => s.playback.crossfadeSec)
  const setCrossfadeSec = useSettingsStore((s) => s.setCrossfadeSec)

  // Пресет активен, только если текущие gains совпадают с ним точно
  const activePreset = Object.keys(EQ_PRESETS).find((name) =>
    EQ_PRESETS[name].every((db, i) => db === eqGains[i]),
  )

  const changeGain = (band: number, db: number): void => {
    setEqGain(band, db)
    persistPatch({ eqGains: usePlayerStore.getState().eqGains })
  }

  const applyPreset = (gains: number[]): void => {
    applyEqPreset(gains)
    persistPatch({ eqGains: usePlayerStore.getState().eqGains })
  }

  return (
    <div className="eq">
      <section className="eq-tone" aria-labelledby="eq-tone-heading">
        <div className="eq-section-heading">
          <div>
            <h3 id="eq-tone-heading">Эквалайзер</h3>
            <p>Настройка звучания по частотам</p>
          </div>
          <button
            className="btn-outline eq-reset"
            onClick={() => applyPreset(EQ_PRESETS.Flat)}
            aria-label="Сбросить эквалайзер"
          >
            Сбросить
          </button>
        </div>
        <p className="eq-label">Готовые настройки</p>
        <div className="eq-presets" role="group" aria-label="Готовые настройки эквалайзера">
          {Object.entries(EQ_PRESETS).map(([name, gains]) => (
            <button
              key={name}
              className={`eq-preset${activePreset === name ? ' active' : ''}`}
              onClick={() => applyPreset(gains)}
              aria-pressed={activePreset === name}
            >
              {EQ_PRESET_LABELS[name] ?? name}
            </button>
          ))}
        </div>
        <p className="eq-label">Частоты</p>
        <div className="eq-sliders" role="group" aria-label="Частотные полосы эквалайзера">
          {EQ_FREQS.map((freq, band) => (
            <div className="eq-band" key={freq}>
              <span className="eq-db">{fmtDb(eqGains[band])}</span>
              <input
                className="eq-slider"
                type="range"
                min={EQ_MIN}
                max={EQ_MAX}
                step={1}
                value={eqGains[band]}
                style={sliderStyle(eqGains[band])}
                onChange={(e) => changeGain(band, Number(e.target.value))}
                aria-label={`${freqLabel(freq)} Гц`}
                title={`${freqLabel(freq)} Гц`}
              />
              <span className="eq-freq">{freqLabel(freq)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="eq-crossfade" aria-labelledby="eq-crossfade-heading">
        <div className="eq-section-heading eq-crossfade-heading">
          <div>
            <h3 id="eq-crossfade-heading">Кроссфейд</h3>
            <p>Плавный переход между треками</p>
          </div>
          <span className="eq-crossfade-value">{crossfadeSec === 0 ? 'Выкл' : `${crossfadeSec} с`}</span>
        </div>
        <input
          aria-label="Длительность кроссфейда"
          className="slider eq-crossfade-slider"
          type="range"
          min={0}
          max={12}
          step={1}
          value={crossfadeSec}
          style={{ '--progress': `${(crossfadeSec / 12) * 100}%` } as CSSProperties}
          onChange={(event) => setCrossfadeSec(Number(event.target.value))}
        />
        <div className="eq-crossfade-scale" aria-hidden="true"><span>Выкл</span><span>12 с</span></div>
      </section>
    </div>
  )
}
