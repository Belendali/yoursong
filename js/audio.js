import { rng } from './store.js'

/* A tiny generative arranger — every record is synthesised live from its seed,
   so previews work offline and a freshly written song is instantly playable. */

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
}
const PROGRESSIONS = {
  major: [0, 4, 5, 3],
  minor: [0, 5, 3, 4],
  dorian: [0, 3, 6, 4],
  lydian: [0, 4, 1, 3],
  mixolydian: [0, 6, 3, 4],
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

export class SongPlayer {
  constructor() {
    this.ctx = null
    this.playing = false
    this.rec = null
    this.timer = null
    this.onProgress = null
    this.bars = 8
  }

  _init() {
    if (this.ctx) return
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    this.ctx = ctx

    this.master = ctx.createGain()
    this.master.gain.value = 0

    this.tone = ctx.createBiquadFilter() // the "through the horn" colour
    this.tone.type = 'lowpass'
    this.tone.frequency.value = 5200
    this.tone.Q.value = 0.4

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.wave = new Uint8Array(this.analyser.frequencyBinCount)

    this.verb = ctx.createConvolver()
    this.verb.buffer = this._impulse(2.4, 2.6)
    this.verbGain = ctx.createGain()
    this.verbGain.gain.value = 0.32

    this.master.connect(this.tone)
    this.tone.connect(this.analyser)
    this.tone.connect(this.verb)
    this.verb.connect(this.verbGain)
    this.verbGain.connect(this.analyser)
    this.analyser.connect(ctx.destination)

    this.noiseBuf = this._noise(2)
  }

  _impulse(seconds, decay) {
    const { ctx } = this
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
      }
    }
    return buf
  }

  _noise(seconds) {
    const { ctx } = this
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return buf
  }

  /* ---------- voices ---------- */

  _pad(freqs, t, dur, warmth) {
    const { ctx } = this
    const g = ctx.createGain()
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(420 + warmth * 260, t)
    f.frequency.linearRampToValueAtTime(1500 + warmth * 900, t + dur * 0.55)
    f.frequency.linearRampToValueAtTime(600, t + dur)
    f.Q.value = 1.6
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    f.connect(g)
    g.connect(this.master)
    freqs.forEach((fr, i) => {
      ;[-6, 6].forEach((det) => {
        const o = ctx.createOscillator()
        o.type = i === 0 ? 'sawtooth' : 'triangle'
        o.frequency.value = fr
        o.detune.value = det
        o.connect(f)
        o.start(t)
        o.stop(t + dur + 0.05)
      })
    })
  }

  _pluck(freq, t, dur, gain = 0.13, type = 'triangle') {
    const { ctx } = this
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(freq * 6, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.6, 220), t + dur)
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(f)
    f.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  _bass(freq, t, dur) {
    const { ctx } = this
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  _kick(t) {
    const { ctx } = this
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12)
    g.gain.setValueAtTime(0.28, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + 0.26)
  }

  _hat(t, gain = 0.05) {
    const { ctx } = this
    const s = ctx.createBufferSource()
    s.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7200
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    s.connect(f)
    f.connect(g)
    g.connect(this.master)
    s.start(t, Math.random())
    s.stop(t + 0.08)
  }

  _startSurface() {
    const { ctx } = this
    const s = ctx.createBufferSource()
    s.buffer = this.noiseBuf
    s.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 2600
    f.Q.value = 0.6
    const g = ctx.createGain()
    g.gain.value = 0.012
    s.connect(f)
    f.connect(g)
    g.connect(this.master)
    s.start()
    this.surface = s
    // sporadic dust pops
    this.popTimer = setInterval(() => {
      if (!this.playing) return
      const t = ctx.currentTime + Math.random() * 0.4
      const p = ctx.createBufferSource()
      p.buffer = this.noiseBuf
      const pg = ctx.createGain()
      pg.gain.setValueAtTime(0.05 + Math.random() * 0.06, t)
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
      const pf = ctx.createBiquadFilter()
      pf.type = 'bandpass'
      pf.frequency.value = 1200 + Math.random() * 2600
      p.connect(pf)
      pf.connect(pg)
      pg.connect(this.master)
      p.start(t, Math.random())
      p.stop(t + 0.05)
    }, 420)
  }

  /* ---------- arrangement ---------- */

  async play(rec) {
    this._init()
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.stop(true)

    this.rec = rec
    this.playing = true
    const r = rng(rec.seed)
    const scale = SCALES[rec.scale] || SCALES.major
    const prog = PROGRESSIONS[rec.scale] || PROGRESSIONS.major
    const root = 48 + (rec.seed % 12)
    const warmth = rec.vibe === 'synth pop' ? 0.25 : rec.vibe === 'ballad' ? 0.6 : 0.75
    const beat = 60 / rec.tempo
    const barLen = beat * 4
    const drums = rec.vibe !== 'ballad'
    const swing = rec.vibe === 'lo-fi' ? 0.06 : 0

    this.tone.frequency.cancelScheduledValues(this.ctx.currentTime)
    this.tone.frequency.setValueAtTime(900, this.ctx.currentTime)
    this.tone.frequency.linearRampToValueAtTime(3400 + warmth * 2600, this.ctx.currentTime + 1.1)
    this.master.gain.cancelScheduledValues(this.ctx.currentTime)
    this.master.gain.setValueAtTime(0.0001, this.ctx.currentTime)
    this.master.gain.exponentialRampToValueAtTime(0.9, this.ctx.currentTime + 0.7)

    this._startSurface()

    const note = (deg, oct = 0) => {
      const o = Math.floor(deg / 7) + oct
      return root + scale[((deg % 7) + 7) % 7] + o * 12
    }
    const arpPattern = Array.from({ length: 8 }, () => Math.floor(r() * 5))

    this.startTime = this.ctx.currentTime + 0.12
    let bar = 0
    const loopBars = this.bars

    const schedule = () => {
      if (!this.playing) return
      const now = this.ctx.currentTime
      while (this.startTime + bar * barLen < now + 0.6) {
        const t0 = this.startTime + bar * barLen
        const deg = prog[bar % prog.length]
        const chord = [note(deg, 1), note(deg + 2, 1), note(deg + 4, 1)].map(mtof)

        this._pad(chord, t0, barLen * 0.98, warmth)
        this._bass(mtof(note(deg, -1)), t0, beat * 1.4)
        this._bass(mtof(note(deg, -1)), t0 + beat * 2.5, beat * 0.9)

        for (let i = 0; i < 8; i++) {
          const t = t0 + i * beat * 0.5 + (i % 2 ? swing * beat : 0)
          if (r() > 0.24) {
            const step = arpPattern[(i + bar) % 8]
            this._pluck(mtof(note(deg + step * 2, 2)), t, beat * 0.62, 0.075 + r() * 0.05)
          }
          if (drums && i % 2 === 1) this._hat(t, 0.035 + r() * 0.03)
        }
        if (drums) {
          this._kick(t0)
          this._kick(t0 + beat * 2.5)
        }
        // a lifted line on the chorus bars
        if (bar % loopBars >= 4) {
          this._pluck(mtof(note(deg + 4, 2)), t0 + beat * 1.5, beat * 1.2, 0.09, 'sine')
        }
        bar++
      }
      if (this.onProgress) {
        const elapsed = Math.max(0, this.ctx.currentTime - this.startTime)
        this.onProgress((elapsed / (barLen * loopBars)) % 1)
      }
    }

    schedule()
    this.timer = setInterval(schedule, 60)
  }

  stop(silent = false) {
    clearInterval(this.timer)
    clearInterval(this.popTimer)
    this.timer = this.popTimer = null
    this.playing = false
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), t)
    this.master.gain.exponentialRampToValueAtTime(0.0001, t + (silent ? 0.03 : 0.35))
    if (this.surface) {
      try { this.surface.stop(t + 0.4) } catch (e) { /* already stopped */ }
      this.surface = null
    }
  }

  levels() {
    if (!this.analyser) return null
    this.analyser.getByteTimeDomainData(this.wave)
    return this.wave
  }
}

export const player = new SongPlayer()

if (typeof window !== 'undefined') window.__player = player
