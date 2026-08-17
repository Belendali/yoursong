import * as THREE from 'three'
import { rng } from './store.js'

/* ---------- picture-disc faces ----------
   Each record's artwork is exported from Figma as a finished picture disc
   (title set on an arc, SIDE A/B, STEREO 33⅓, centre label). We load it as
   the albedo and pair it with a shared groove map so the light still sweeps
   across the vinyl the way it does on a real record. */

const loader = new THREE.TextureLoader()
const faceCache = new Map()

export function faceTexture(src) {
  if (faceCache.has(src)) return faceCache.get(src)
  const tex = loader.load(src)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  faceCache.set(src, tex)
  return tex
}

let grooveMaps = null

/* concentric grooves: dark rings in roughness so the reflection breaks up,
   plus a faint normal-ish bump baked into the same rings */
export function grooveTextures() {
  if (grooveMaps) return grooveMaps

  const size = 1024
  const half = size / 2
  const rough = document.createElement('canvas')
  rough.width = rough.height = size
  const ro = rough.getContext('2d')
  const r = rng(9091)

  ro.fillStyle = '#4a4a4a'
  ro.fillRect(0, 0, size, size)

  const outer = half * 0.995
  const inner = half * 0.3
  const gaps = [0.9, 0.78, 0.63, 0.52, 0.44]
  for (let rad = outer; rad > inner; rad -= 1.5) {
    const t = (rad - inner) / (outer - inner)
    const nearGap = gaps.some((gp) => Math.abs(t - gp) < 0.005)
    const v = nearGap ? 26 : 92 + r() * 70
    ro.strokeStyle = `rgb(${v | 0},${v | 0},${v | 0})`
    ro.lineWidth = nearGap ? 2.6 : 1.3
    ro.beginPath()
    ro.arc(half, half, rad, 0, Math.PI * 2)
    ro.stroke()
  }
  // the paper label in the middle stays matte
  ro.fillStyle = '#d2d2d2'
  ro.beginPath()
  ro.arc(half, half, half * 0.29, 0, Math.PI * 2)
  ro.fill()

  const roughnessMap = new THREE.CanvasTexture(rough)
  roughnessMap.anisotropy = 8

  grooveMaps = { roughnessMap }
  return grooveMaps
}

/* ---------- shadow / metal helpers ---------- */

export function radialShadowTexture() {
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(0,0,0,0.55)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.22)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* stone-ish tooth on the deck's top plate — the render has a visible grain */
let concrete = null
export function concreteTexture() {
  if (concrete) return concrete
  const w = 1024
  const c = document.createElement('canvas')
  c.width = c.height = w
  const g = c.getContext('2d')
  const r = rng(1717)

  g.fillStyle = '#b4b4b4'
  g.fillRect(0, 0, w, w)

  // broad blotches
  for (let i = 0; i < 220; i++) {
    const x = r() * w
    const y = r() * w
    const rad = 20 + r() * 130
    const v = 150 + r() * 90
    const grad = g.createRadialGradient(x, y, 0, x, y, rad)
    grad.addColorStop(0, `rgba(${v | 0},${v | 0},${v | 0},0.22)`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  // fine speckle
  const img = g.getImageData(0, 0, w, w)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 46
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = d[i]
    d[i + 2] = d[i]
  }
  g.putImageData(img, 0, 0)

  concrete = new THREE.CanvasTexture(c)
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping
  concrete.anisotropy = 8
  return concrete
}

/* brushed-metal look, kept for anything that needs a machined face */
export function brushedTexture() {
  const w = 1024
  const c = document.createElement('canvas')
  c.width = c.height = w
  const g = c.getContext('2d')
  g.fillStyle = '#7c7c80'
  g.fillRect(0, 0, w, w)
  const r = rng(4242)
  for (let i = 0; i < 5200; i++) {
    const rad = (0.12 + r() * 0.38) * w
    g.strokeStyle = `rgba(255,255,255,${r() * 0.06})`
    g.lineWidth = 0.6 + r()
    const a0 = r() * Math.PI * 2
    g.beginPath()
    g.arc(w / 2, w / 2, rad, a0, a0 + 0.02 + r() * 0.1)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8
  return t
}
