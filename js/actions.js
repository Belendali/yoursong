import { store, toast } from './store.js'
import { player } from './audio.js'

export function recordById(id) {
  return store.records.find((r) => r.id === id) || null
}

/* The synth loops every few bars, so the needle is driven by the clock over
   the record's printed length instead — that is what the arm tracks. */
let clock = null
function stopClock() {
  clearInterval(clock)
  clock = null
}
function startClock(rec, from = 0) {
  stopClock()
  const [m, s] = String(rec.length).split(':').map(Number)
  const total = Math.max(1, (m || 0) * 60 + (s || 0))
  const t0 = performance.now() - from * total * 1000
  clock = setInterval(() => {
    const p = (performance.now() - t0) / 1000 / total
    if (p >= 1) {
      store.needle = 1
      stopClock()
      player.stop()
      store.playing = false
    } else {
      store.needle = p
    }
  }, 200)
}

/* clicking a record opens the song screen and drops it on the deck */
export async function selectRecord(id, { resume = false } = {}) {
  const rec = recordById(id)
  if (!rec) return
  store.detail = true
  if (store.activeId === id && store.playing) return
  const from = resume && store.activeId === id ? store.needle : 0
  store.activeId = id
  store.needle = from
  store.playing = true
  if (!resume) rec.plays++
  startClock(rec, from)
  try {
    await player.play(rec)
    // autoplay policy: the context stays suspended until a real gesture
    if (player.ctx && player.ctx.state !== 'running') armGesture()
  } catch (e) {
    console.error('[yoursong] playback failed', e)
    stopClock()
    store.playing = false
    toast('Audio was blocked — tap once more.')
  }
}

let armed = false
function armGesture() {
  if (armed) return
  armed = true
  const resume = async () => {
    armed = false
    window.removeEventListener('pointerdown', resume)
    window.removeEventListener('keydown', resume)
    if (player.ctx && player.ctx.state !== 'running') await player.ctx.resume()
    if (store.activeId && store.playing) player.play(recordById(store.activeId))
  }
  window.addEventListener('pointerdown', resume, { once: true })
  window.addEventListener('keydown', resume, { once: true })
}

export function togglePlay() {
  if (!store.activeId) {
    const first = store.records[0]
    if (first) selectRecord(first.id)
    return
  }
  if (store.playing) {
    player.stop()
    stopClock()
    store.playing = false
  } else {
    selectRecord(store.activeId, { resume: store.needle < 0.999 })
  }
}

/* back to the wall of records */
export function closeDetail() {
  player.stop()
  stopClock()
  store.playing = false
  store.detail = false
  store.activeId = null
  store.needle = 0
}

export function stepRecord(dir) {
  const list = store.records
  const i = list.findIndex((r) => r.id === store.activeId)
  const next = list[(i + dir + list.length) % list.length]
  if (next) selectRecord(next.id)
}
