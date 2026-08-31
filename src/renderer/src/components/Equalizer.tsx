import type { CSSProperties } from 'react'
import { EQ_FREQS, EQ_PRESETS } from '../audio/engine'
import { usePlayerStore } from '../stores/playerStore'
import { persistPatch } from '../stores/playlistStore'

const EQ_MIN = -12
const EQ_MAX = 12

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
      <div className="eq-presets">
        {Object.entries(EQ_PRESETS).map(([name, gains]) => (
          <button
            key={name}
            className={`eq-preset${activePreset === name ? ' active' : ''}`}
            onClick={() => applyPreset(gains)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="eq-sliders">
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
              title={`${freqLabel(freq)} Гц`}
            />
            <span className="eq-freq">{freqLabel(freq)}</span>
          </div>
        ))}
      </div>
      <button className="btn-outline eq-reset" onClick={() => applyPreset(EQ_PRESETS.Flat)}>
        Сбросить
      </button>
    </div>
  )
}
