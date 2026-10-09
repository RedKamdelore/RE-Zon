import { useEffect, useRef } from 'react'
import type { ThemeConfig } from '@shared/themeModel'

const vertex = `attribute vec2 position;
varying vec2 uv;
void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`

// The preview's glass bends the light field itself, with a small RGB split at its edge.
const fragment = `precision mediump float;
varying vec2 uv;
uniform vec2 resolution;
uniform vec2 pointer;
uniform float time;
uniform vec3 baseColor;
uniform vec3 accentColor;
uniform vec3 panelColor;
vec3 field(vec2 p) {
  float wave = sin(p.x * 5.2 + time * .24) * cos(p.y * 4.1 - time * .21);
  float bloom = exp(-length((p - vec2(.76,.43)) * vec2(1.1,1.8)) * 4.2);
  float bloom2 = exp(-length((p - vec2(.2,.83)) * vec2(1.6,1.1)) * 5.0);
  vec3 c = mix(baseColor, panelColor, smoothstep(-.5,.9,p.x + .22 * wave));
  c = mix(c, accentColor, clamp(bloom * .68 + bloom2 * .24,0.,.76));
  return c + accentColor * max(0.,wave) * .055;
}
void main() {
  vec2 p = uv;
  vec2 center = vec2(.52,.51) + (pointer - .5) * .08;
  vec2 q = (p - center) * vec2(resolution.x / resolution.y,1.);
  float radius = .31;
  float d = length(q);
  float lens = 1. - smoothstep(radius - .025,radius + .008,d);
  vec2 normal = q / max(d,.001);
  float rim = exp(-pow((d-radius) * 87.,2.));
  float inner = pow(max(0.,1. - d/radius),1.6) * lens;
  vec2 offset = normal * (inner * .055 + rim * .014);
  vec3 result = field(p);
  vec3 bent = vec3(field(p-offset * .77).r,field(p-offset).g,field(p-offset * 1.23).b);
  result = mix(result,bent,lens);
  float glint = pow(max(0.,dot(normal,normalize(vec2(-.75,.65)))),8.) * rim;
  float sweep = exp(-pow((q.x + q.y * .78 - sin(time*.31)*.22) * 13.,2.)) * lens;
  result += vec3(.16,.2,.24) * rim + vec3(.42,.47,.5) * glint + vec3(.12,.15,.19) * sweep;
  gl_FragColor = vec4(result,1.);
}`

function rgb(hex: string): Float32Array {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3 ? normalized.split('').map(c => c + c).join('') : normalized
  const value = Number.parseInt(full, 16)
  return new Float32Array([((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255])
}

function shader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const result = gl.createShader(type)
  if (!result) return null
  gl.shaderSource(result, source)
  gl.compileShader(result)
  if (gl.getShaderParameter(result, gl.COMPILE_STATUS)) return result
  gl.deleteShader(result)
  return null
}

export default function ThemePrismCanvas({ theme }: { theme: ThemeConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targetRef = useRef({ base: rgb(theme.background === 'gradient' ? theme.bgGradientFrom : theme.bgApp), accent: rgb(theme.accent), panel: rgb(theme.background === 'gradient' ? theme.bgGradientTo : theme.bgPanel) })
  const restartRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })
    if (!gl) return
    const vs = shader(gl, gl.VERTEX_SHADER, vertex)
    const fs = shader(gl, gl.FRAGMENT_SHADER, fragment)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const resolution = gl.getUniformLocation(program, 'resolution')
    const mouse = gl.getUniformLocation(program, 'pointer')
    const time = gl.getUniformLocation(program, 'time')
    const baseLocation = gl.getUniformLocation(program, 'baseColor')
    const accentLocation = gl.getUniformLocation(program, 'accentColor')
    const panelLocation = gl.getUniformLocation(program, 'panelColor')
    const colors = {
      base: rgb(theme.background === 'gradient' ? theme.bgGradientFrom : theme.bgApp), accent: rgb(theme.accent), panel: rgb(theme.background === 'gradient' ? theme.bgGradientTo : theme.bgPanel),
    }
    let frame = 0
    let last = 0
    let visible = true
    let px = .5
    let py = .5
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const draw = (now: number): void => {
      if (now - last < 32 && !motion.matches) { frame = requestAnimationFrame(draw); return }
      last = now
      const area = Math.max(1, canvas.clientWidth * canvas.clientHeight)
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(650_000 / area))
      const width = Math.max(1, Math.round(canvas.clientWidth * scale))
      const height = Math.max(1, Math.round(canvas.clientHeight * scale))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height) }
      gl.uniform2f(resolution, width, height)
      gl.uniform2f(mouse, px, py)
      gl.uniform1f(time, motion.matches ? 0 : now / 1000)
      const targets = targetRef.current
      for (const name of ['base', 'accent', 'panel'] as const) {
        for (let index = 0; index < 3; index++) colors[name][index] += (targets[name][index] - colors[name][index]) * (motion.matches ? 1 : .14)
      }
      gl.uniform3fv(baseLocation, colors.base)
      gl.uniform3fv(accentLocation, colors.accent)
      gl.uniform3fv(panelLocation, colors.panel)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      if (!motion.matches && visible && document.visibilityState === 'visible') frame = requestAnimationFrame(draw)
    }
    const restart = (): void => { cancelAnimationFrame(frame); if (visible && document.visibilityState === 'visible') frame = requestAnimationFrame(draw) }
    restartRef.current = restart
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; restart() })
    observer.observe(canvas)
    const onPointer = (event: PointerEvent): void => { const box = canvas.getBoundingClientRect(); px = (event.clientX - box.left) / box.width; py = 1 - (event.clientY - box.top) / box.height }
    const pointerTarget = canvas.closest('.theme-preview,.full-player') ?? canvas.parentElement
    pointerTarget?.addEventListener('pointermove', onPointer as EventListener)
    document.addEventListener('visibilitychange', restart)
    motion.addEventListener('change', restart)
    restart()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      pointerTarget?.removeEventListener('pointermove', onPointer as EventListener)
      document.removeEventListener('visibilitychange', restart)
      motion.removeEventListener('change', restart)
      restartRef.current = null
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])
  useEffect(() => {
    targetRef.current = { base: rgb(theme.background === 'gradient' ? theme.bgGradientFrom : theme.bgApp), accent: rgb(theme.accent), panel: rgb(theme.background === 'gradient' ? theme.bgGradientTo : theme.bgPanel) }
    restartRef.current?.()
  }, [theme.bgApp, theme.bgPanel, theme.accent, theme.background, theme.bgGradientFrom, theme.bgGradientTo])
  return <canvas ref={canvasRef} className="theme-prism-canvas" aria-hidden="true" />
}
