import { defineComponent, ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { store, activeRecord } from '../store.js'
import { player } from '../audio.js'
import { togglePlay } from '../actions.js'
import { coverCanvas } from '../textures.js'

export const Nowbar = defineComponent({
  name: 'Nowbar',
  setup() {
    const coverHost = ref(null)
    const viz = ref(null)
    let raf = 0

    const rec = activeRecord
    const show = computed(() => !!rec.value)

    function paintCover() {
      const host = coverHost.value
      if (!host || !rec.value) return
      host.innerHTML = ''
      host.appendChild(coverCanvas(rec.value, 128))
    }
    watch(() => rec.value?.id, paintCover, { flush: 'post' })
    watch(show, (v) => v && requestAnimationFrame(paintCover))

    function drawViz() {
      raf = requestAnimationFrame(drawViz)
      const c = viz.value
      if (!c) return
      const dpr = Math.min(devicePixelRatio || 1, 2)
      const w = (c.width = c.clientWidth * dpr)
      const h = (c.height = c.clientHeight * dpr)
      const g = c.getContext('2d')
      g.clearRect(0, 0, w, h)
      const data = store.playing ? player.levels() : null
      g.strokeStyle = getComputedStyle(c).color
      g.lineWidth = 1.2 * dpr
      g.beginPath()
      const n = 48
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w
        let v = 0.5
        if (data) {
          const s = data[Math.floor((i / n) * data.length)] / 128 - 1
          v = 0.5 + s * 0.9
        } else {
          v = 0.5 + Math.sin(i * 0.6 + Date.now() / 900) * 0.03
        }
        const y = h - v * h
        i ? g.lineTo(x, y) : g.moveTo(x, y)
      }
      g.stroke()
    }

    onMounted(() => {
      drawViz()
      paintCover()
    })
    onBeforeUnmount(() => cancelAnimationFrame(raf))

    return { rec, show, coverHost, viz, store, togglePlay }
  },
  template: `
    <div class="nowbar" :class="{ in: show }">
      <div class="cover" ref="coverHost"></div>
      <div class="meta">
        <div class="t">{{ rec ? rec.title : '' }}</div>
        <div class="s">{{ rec ? rec.by + ' · ' + rec.vibe + ' · ' + rec.tempo + ' BPM' : '' }}</div>
      </div>
      <canvas class="viz" ref="viz"></canvas>
      <button class="icon-btn" @click="togglePlay" :aria-label="store.playing ? 'Pause' : 'Play'">
        {{ store.playing ? '❚❚' : '▶' }}
      </button>
    </div>
  `,
})
