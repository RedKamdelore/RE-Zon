import { useEffect, useLayoutEffect, useRef } from 'react'

/** Native listener allows cancelling page scroll while hovering the volume control. */
export function useVolumeWheel(volume: number, onChange: (volume: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ volume, onChange })
  useLayoutEffect(() => { latest.current = { volume, onChange } }, [volume, onChange])

  useEffect(() => {
    const control = ref.current
    if (!control) return
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || !Number.isFinite(event.deltaY) || event.deltaY === 0) return
      event.preventDefault()
      event.stopPropagation()
      const current = latest.current
      const next = Math.max(0, Math.min(100, Math.round(current.volume * 100) - Math.sign(event.deltaY) * 5)) / 100
      if (next === current.volume) return
      latest.current = { ...current, volume: next }
      current.onChange(next)
    }
    control.addEventListener('wheel', onWheel, { passive: false })
    return () => control.removeEventListener('wheel', onWheel)
  }, [])

  return ref
}
