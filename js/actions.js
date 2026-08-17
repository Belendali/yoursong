import { store, toast } from './store.js'
import { player } from './audio.js'

export function recordById(id) {
  return store.records.find((r) => r.id === id) || null
}

/* ---------- real recordings ----------
   Drop a file in assets/songs/ named after the artwork (01-first-summer.mp3)
   and that record plays the real track instead of the built-in synth. */

export async function detectAudio() {
  /* serve.py lists assets/songs live; on a static host the same JSON is
     committed as assets/songs/index.json (see tools/index-songs.py) */
  let names = null
  for (const url of ['./songs.json', './assets/songs/index.json']) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      names = await res.json()
      break
    } catch {
      /* try the next one */
    }
  }
  if (!names) return // no listing — every record stays on the synth
  for (const rec of store.records) {
    const hit = names.find((s) => s.slug === rec.slug)
    if (!hit) continue
    rec.audio = `./assets/songs/${hit.file}`
    rec.lyrics = hit.lyrics || []
  }
}

/* the line to show right now — timed if the .lrc gave us stamps, otherwise
   spread evenly across the track so it still walks along with the song */
export function lyricAt(rec, seconds, progress) {
  const lines = rec?.lyrics
  if (!lines || !lines.length) return ''
  if (lines[0].t !== undefined) {
    let cur = ''
    for (const line of lines) {
      if (seconds + 0.15 >= line.t) cur = line.text
      else break
    }
    return cur
  }
  const lead = 0.06
  const i = Math.floor(((progress - lead) / (1 - lead * 2)) * lines.length)
  return lines[Math.max(0, Math.min(lines.length - 1, i))].text
}

let el = null
function element() {
  if (!el) {
    el = new Audio()
    el.preload = 'auto'
    el.addEventListener('timeupdate', () => {
      store.time = el.currentTime
      if (el.duration) store.needle = Math.min(1, el.currentTime / el.duration)
    })
    el.addEventListener('loadedmetadata', () => {
      const rec = recordById(el.dataset.rec)
      if (rec && el.duration) rec.length = clockText(el.duration)
    })
    el.addEventListener('ended', () => {
      store.needle = 1
      store.playing = false
    })
  }
  return el
}

function clockText(sec) {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

async function playFile(rec, from) {
  const a = element()
  if (a.dataset.rec !== rec.id) {
    a.dataset.rec = rec.id
    a.src = rec.audio
  }
  const seek = () => {
    if (a.duration) a.currentTime = from * a.duration
  }
  if (a.readyState >= 1) seek()
  else a.addEventListener('loadedmetadata', seek, { once: true })
  await a.play()
}

function stopFile() {
  if (el) el.pause()
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
    store.time = p * total
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
  try {
    if (rec.audio) {
      player.stop()
      stopClock()
      try {
        await playFile(rec, from)
      } catch (e) {
        // the track did not load (a static host without the file) — the
        // synth still knows how to play this record
        console.warn('[yoursong] falling back to the synth', e)
        rec.audio = null
        rec.lyrics = []
        startClock(rec, from)
        await player.play(rec)
      }
    } else {
      stopFile()
      startClock(rec, from)
      await player.play(rec)
      // autoplay policy: the context stays suspended until a real gesture
      if (player.ctx && player.ctx.state !== 'running') armGesture()
    }
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
    stopFile()
    stopClock()
    store.playing = false
  } else {
    selectRecord(store.activeId, { resume: store.needle < 0.999 })
  }
}

/* back to the wall of records */
export function closeDetail() {
  player.stop()
  stopFile()
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
