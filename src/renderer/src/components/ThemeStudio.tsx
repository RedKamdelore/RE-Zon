import { useRef, useState, type CSSProperties } from 'react'
import type { BackgroundKind, PanelMaterial, ThemeConfig } from '@shared/themeModel'
import { useSettingsStore } from '../stores/settingsStore'
import { CloseIcon } from './icons'
import ThemePrismCanvas from './ThemePrismCanvas'

const SKINS = [
  { id: 'atlas', name: 'Атлас', colors: ['#20242A', '#D9996F'] },
  { id: 'north', name: 'Север', colors: ['#20242A', '#82B7C7'] },
  { id: 'paper', name: 'Тихий свет', colors: ['#F5F3EF', '#A65338'] },
  { id: 'night-record', name: 'Ночная запись', colors: ['#101318', '#A9A4D6'] },
  { id: 'spotify-dark', name: 'Классическая тёмная', colors: ['#121212', '#1DB954'] },
  { id: 'light', name: 'Светлая', colors: ['#F5F5F5', '#A65338'] },
  { id: 'midnight', name: 'Midnight', colors: ['#0A0A0A', '#A9A4D6'] },
  { id: 'frutiger-aero', name: 'Frutiger Aero', colors: ['#7EC8E3', '#0D5266'] },
  { id: 'liquid-glass', name: 'Liquid Glass', colors: ['#1A1D29', '#82B7C7'] },
] as const
const MATERIALS: { id: PanelMaterial; name: string; description: string }[] = [
  { id: 'flat', name: 'Матовый', description: 'Спокойная поверхность' },
  { id: 'glass', name: 'Стекло', description: 'Глубина и рассеяние' },
  { id: 'gloss', name: 'Глянец', description: 'Направленный блик' },
  { id: 'neumorphic', name: 'Рельеф', description: 'Мягкий объём' },
]
const BACKGROUNDS: { id: BackgroundKind; name: string }[] = [
  { id: 'color', name: 'Цвет' },
  { id: 'gradient', name: 'Градиент' },
  { id: 'image', name: 'Изображение' },
]
const ACCENTS = ['#D9996F', '#82B7C7', '#A9A4D6', '#E7BC71', '#E18F87', '#4FAF9A']
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

function Range({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void
}) {
  return <label className="theme-range"><span>{label}<strong>{display}</strong></span><input type="range" className="slider settings-slider" min={min} max={max} step={step} value={value}
    style={{ ['--progress' as string]: `${((value - min) / (max - min)) * 100}%` }} onChange={event => onChange(Number(event.target.value))}/></label>
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="theme-color-control"><input type="color" value={value} onChange={event => onChange(event.target.value)} /><span>{label}</span><strong>{value.toUpperCase()}</strong></label>
}

function ThemePreview({ theme, skin }: { theme: ThemeConfig; skin: string }) {
  const vars = {
    '--studio-bg': theme.bgApp,
    '--studio-panel': theme.bgPanel,
    '--studio-accent': theme.accent,
    '--studio-text': theme.textPrimary,
    '--studio-muted': theme.textSecondary,
    '--studio-radius': `${Math.max(8, theme.radius)}px`,
  } as CSSProperties
  return <div className={`theme-preview theme-preview-${theme.panelMaterial}`} style={vars} aria-label="Предпросмотр выбранной темы">
    {theme.bgImageDataUrl && theme.background === 'image' && <div className="theme-preview-image" style={{ backgroundImage: `url(${JSON.stringify(theme.bgImageDataUrl)})` }} />}
    <ThemePrismCanvas theme={theme}/>
    <div className="theme-preview-grain" aria-hidden="true"/>
    <div className="theme-preview-head"><span className="theme-preview-kicker">ЖИВОЙ ПРЕДПРОСМОТР</span><span className="theme-preview-current">{SKINS.find(item => item.id === skin)?.name ?? skin}</span></div>
    <div className="theme-preview-ui">
      <div className="theme-preview-rail"><b>RE:<br/>ZON</b><i/><i/><i/></div>
      <div className="theme-preview-page"><span>ВАШЕ ЗВУЧАНИЕ</span><strong>Музыка в своём ритме.</strong><div className="theme-preview-card"><div className="theme-preview-art"/><div><small>СЕЙЧАС ИГРАЕТ</small><b>Тёплый вечер</b><span>Маяк</span></div><span className="theme-preview-play">▶</span></div></div>
    </div>
    <div className="theme-preview-foot"><span>Свет реагирует на движение курсора</span><span>● В реальном времени</span></div>
  </div>
}

export default function ThemeStudio() {
  const appearance = useSettingsStore(state => state.appearance)
  const theme = appearance.theme
  const settings = useSettingsStore.getState
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [imageError, setImageError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const save = (): void => {
    if (!name.trim()) return
    settings().saveCustomTheme(name)
    setName('')
    setSaving(false)
  }
  const pickImage = (file?: File): void => {
    setImageError('')
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) { setImageError('Файл больше 2 МБ. Выберите изображение поменьше.'); return }
    const reader = new FileReader()
    reader.onload = () => settings().patchTheme({ bgImageDataUrl: String(reader.result), background: 'image' })
    reader.onerror = () => setImageError('Не удалось прочитать файл.')
    reader.readAsDataURL(file)
  }
  return <section className="settings-section theme-studio">
    <ThemePreview theme={theme} skin={appearance.skin}/>
    <div className="theme-studio-section theme-studio-themes">
      <div className="theme-studio-heading"><div><span className="theme-studio-eyebrow">01 / ОСНОВА</span><h3>Выберите настроение</h3><p>Тема задаёт палитру. Каждый параметр ниже можно изменить.</p></div><button className="text-button" onClick={() => settings().setSkin('atlas')}>Вернуть Атлас</button></div>
      <div className="theme-preset-grid">
        {SKINS.map(item => <button key={item.id} className={`theme-preset${appearance.skin === item.id ? ' active' : ''}`} aria-pressed={appearance.skin === item.id} onClick={() => settings().setSkin(item.id)}>
          <span className="theme-preset-preview" style={{ background: `linear-gradient(135deg,${item.colors[0]} 24%,${item.colors[1]} 180%)` }}><span/><i style={{ background: item.colors[1] }}/></span>
          <span className="theme-preset-label">{item.name}</span>{appearance.skin === item.id && <span className="theme-preset-selected">Выбрана</span>}
        </button>)}
      </div>
      {(Object.keys(appearance.customThemes).length > 0 || saving) && <div className="theme-custom-grid">
        {Object.entries(appearance.customThemes).map(([themeName, custom]) => <div key={themeName} className={`theme-custom-item${appearance.skin === themeName ? ' active' : ''}`}>
          <button className="theme-custom-select" onClick={() => settings().setSkin(themeName)} aria-pressed={appearance.skin === themeName}><span className="theme-custom-dot" style={{ background: `linear-gradient(135deg,${custom.bgApp},${custom.accent})` }}/>{themeName}</button>
          <button className="theme-custom-delete" title={`Удалить тему ${themeName}`} aria-label={`Удалить тему ${themeName}`} onClick={() => settings().deleteCustomTheme(themeName)}><CloseIcon size={13}/></button>
        </div>)}
      </div>}
      {saving ? <div className="theme-save-row"><input className="settings-input" autoFocus aria-label="Название новой темы" placeholder="Название своей темы" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setSaving(false) }}/><button className="btn-primary" onClick={save}>Сохранить</button><button className="btn-outline" onClick={() => setSaving(false)}>Отмена</button></div> : <button className="theme-save-trigger" onClick={() => setSaving(true)}>＋ Сохранить текущую настройку как тему</button>}
    </div>

    <div className="theme-studio-controls">
      <div className="theme-studio-section">
        <div className="theme-studio-heading"><div><span className="theme-studio-eyebrow">02 / ПОВЕРХНОСТЬ</span><h3>Материал</h3><p>Выберите, как панели отражают свет.</p></div></div>
        <div className="theme-material-grid">{MATERIALS.map(item => <button key={item.id} className={`theme-material theme-material-${item.id}${theme.panelMaterial === item.id ? ' active' : ''}`} aria-pressed={theme.panelMaterial === item.id} onClick={() => settings().patchTheme({ panelMaterial: item.id })}><span className="theme-material-glyph"/><strong>{item.name}</strong><small>{item.description}</small></button>)}</div>
        {theme.panelMaterial === 'glass' && <div className="theme-subcontrols"><Range label="Рассеяние" min={0} max={40} step={1} value={theme.glassBlur} display={`${theme.glassBlur} px`} onChange={value => settings().patchTheme({ glassBlur: value })}/><Range label="Непрозрачность" min={0} max={1} step={.05} value={theme.panelOpacity} display={`${Math.round(theme.panelOpacity * 100)}%`} onChange={value => settings().patchTheme({ panelOpacity: value })}/></div>}
        {theme.panelMaterial === 'gloss' && <div className="theme-subcontrols"><Range label="Яркость блика" min={0} max={1} step={.05} value={theme.glossIntensity} display={`${Math.round(theme.glossIntensity * 100)}%`} onChange={value => settings().patchTheme({ glossIntensity: value })}/><Range label="Непрозрачность" min={0} max={1} step={.05} value={theme.panelOpacity} display={`${Math.round(theme.panelOpacity * 100)}%`} onChange={value => settings().patchTheme({ panelOpacity: value })}/></div>}
        {theme.panelMaterial === 'neumorphic' && <div className="theme-subcontrols"><Range label="Глубина рельефа" min={0} max={1} step={.05} value={theme.shadowStrength} display={`${Math.round(theme.shadowStrength * 100)}%`} onChange={value => settings().patchTheme({ shadowStrength: value })}/></div>}
      </div>
      <div className="theme-studio-section">
        <div className="theme-studio-heading"><div><span className="theme-studio-eyebrow">03 / ПРОСТРАНСТВО</span><h3>Фон</h3><p>Цвет, градиент или своё изображение.</p></div></div>
        <div className="theme-segmented">{BACKGROUNDS.map(item => <button key={item.id} className={theme.background === item.id ? 'active' : ''} aria-pressed={theme.background === item.id} onClick={() => settings().patchTheme({ background: item.id })}>{item.name}</button>)}</div>
        {theme.background === 'color' && <div className="theme-subcontrols"><Color label="Цвет фона" value={theme.bgApp} onChange={value => settings().patchTheme({ bgApp: value })}/></div>}
        {theme.background === 'gradient' && <div className="theme-subcontrols"><div className="theme-color-pair"><Color label="Начало" value={theme.bgGradientFrom} onChange={value => settings().patchTheme({ bgGradientFrom: value })}/><Color label="Конец" value={theme.bgGradientTo} onChange={value => settings().patchTheme({ bgGradientTo: value })}/></div><Range label="Направление" min={0} max={360} step={5} value={theme.bgGradientAngle} display={`${theme.bgGradientAngle}°`} onChange={value => settings().patchTheme({ bgGradientAngle: value })}/></div>}
        {theme.background === 'image' && <div className="theme-subcontrols"><input ref={fileRef} type="file" accept="image/*" hidden onChange={event => { pickImage(event.target.files?.[0]); event.target.value = '' }}/><div className="theme-file-actions"><button className="btn-outline" onClick={() => fileRef.current?.click()}>Выбрать изображение</button>{theme.bgImageDataUrl && <button className="text-button" onClick={() => settings().patchTheme({ bgImageDataUrl: undefined })}>Убрать</button>}</div>{imageError && <p className="import-error">{imageError}</p>}{theme.bgImageDataUrl && <><Range label="Размытие" min={0} max={40} step={1} value={theme.bgImageBlur} display={`${theme.bgImageBlur} px`} onChange={value => settings().patchTheme({ bgImageBlur: value })}/><Range label="Затемнение" min={0} max={1} step={.05} value={theme.bgImageDim} display={`${Math.round(theme.bgImageDim * 100)}%`} onChange={value => settings().patchTheme({ bgImageDim: value })}/></>}</div>}
      </div>
      <div className="theme-studio-section">
        <div className="theme-studio-heading"><div><span className="theme-studio-eyebrow">04 / ПАЛИТРА</span><h3>Цвета</h3><p>Акцент связывает элементы интерфейса.</p></div></div>
        <div className="theme-accent-options">{ACCENTS.map(hex => <button key={hex} className={theme.accent.toLowerCase() === hex.toLowerCase() ? 'active' : ''} style={{ background: hex }} title={hex} aria-label={`Акцент ${hex}`} aria-pressed={theme.accent.toLowerCase() === hex.toLowerCase()} onClick={() => settings().setAccent(hex)}/>)}<label className="theme-custom-accent" title="Свой цвет"><input type="color" value={theme.accent} aria-label="Свой акцентный цвет" onChange={event => settings().setAccent(event.target.value)}/></label></div>
        <div className="theme-color-pair theme-subcontrols"><Color label="Основной текст" value={theme.textPrimary} onChange={value => settings().patchTheme({ textPrimary: value })}/><Color label="Дополнительный" value={theme.textSecondary} onChange={value => settings().patchTheme({ textSecondary: value })}/></div>
      </div>
      <div className="theme-studio-section">
        <div className="theme-studio-heading"><div><span className="theme-studio-eyebrow">05 / ПРОПОРЦИИ</span><h3>Форма и масштаб</h3><p>Подстройте интерфейс под свой экран.</p></div></div>
        <div className="theme-subcontrols"><Range label="Радиус углов" min={0} max={16} step={1} value={theme.radius} display={`${theme.radius} px`} onChange={value => settings().setRadius(value)}/><Range label="Масштаб интерфейса" min={.85} max={1.15} step={.05} value={appearance.scale} display={`${Math.round(appearance.scale * 100)}%`} onChange={value => settings().setScale(value)}/></div>
      </div>
    </div>
  </section>
}
