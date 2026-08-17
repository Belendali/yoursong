import { defineComponent, computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { store, activeRecord } from '../store.js'
import { togglePlay, closeDetail, stepRecord, lyricAt } from '../actions.js'
import { Stage } from '../scene/Scene.js'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const smooth = (t) => t * t * (3 - 2 * t)

export const App = defineComponent({
  name: 'App',
  components: { Stage },
  setup() {
    const vw = ref(window.innerWidth)
    const vh = ref(window.innerHeight)
    const ctaEl = ref(null)
    /* layout box of the CTA in its corner slot — offset* ignores transforms */
    const ctaBox = ref({ x: 0, y: 0 })
    function measureCta() {
      const el = ctaEl.value
      if (!el) return
      ctaBox.value = {
        x: el.offsetLeft + el.offsetWidth / 2,
        y: el.offsetTop + el.offsetHeight / 2,
      }
    }

    function onScroll() {
      if (store.detail) return
      const span = Math.max(1, window.innerHeight * 0.9)
      store.stage = clamp(window.scrollY / span, 0, 1)
    }
    function onResize() {
      vw.value = window.innerWidth
      vh.value = window.innerHeight
      measureCta()
      onScroll()
    }
    function onKey(e) {
      if (e.code === 'Escape' && store.detail) closeDetail()
      if (e.code === 'ArrowRight' && store.detail) stepRecord(1)
      if (e.code === 'ArrowLeft' && store.detail) stepRecord(-1)
      if (e.code === 'Space' && !/input|textarea/i.test(e.target.tagName)) {
        e.preventDefault()
        togglePlay()
      }
    }

    /* Read the scroll position every frame rather than listening for events:
       restores, bfcache and programmatic jumps all skip the scroll event, and
       a property read per frame is cheaper than the bugs that causes. */
    let raf = 0
    function follow() {
      onScroll()
      raf = requestAnimationFrame(follow)
    }

    onMounted(() => {
      onResize()
      follow()
      window.addEventListener('resize', onResize)
      window.addEventListener('keydown', onKey)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) window.dispatchEvent(new Event('resize'))
      })
    })
    onBeforeUnmount(() => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    })

    /* The song screen takes over the page, so the scroller parks. Locking the
       body clamps scrollY to 0, which would drop the stage back to the hero —
       so pin the stage while it is open and put the scroll back on the way out. */
    let parkedY = 0
    watch(
      () => store.detail,
      (on) => {
        if (on) {
          parkedY = window.scrollY || window.innerHeight
          store.stage = 1
          document.body.style.overflow = 'hidden'
        } else {
          document.body.style.overflow = ''
          requestAnimationFrame(() => {
            window.scrollTo({ top: parkedY, behavior: 'instant' })
            onScroll()
          })
        }
      },
    )

    /* CTA: sits in the top-right corner and flies down to the hero slot
       while stage is 0 — one transform, so it stays on the compositor */
    const ctaStyle = computed(() => {
      const k = 1 - smooth(clamp(store.stage / 0.5, 0, 1))
      const dx = vw.value / 2 - ctaBox.value.x
      const dy = vh.value * 0.789 - ctaBox.value.y
      const s = 1 + 0.149 * k
      return {
        transform: `translate(${(dx * k).toFixed(2)}px, ${(dy * k).toFixed(2)}px) scale(${s.toFixed(3)})`,
      }
    })

    const heroStyle = computed(() => {
      const k = smooth(clamp(store.stage / 0.34, 0, 1))
      return { opacity: 1 - k, transform: `translateY(${(-26 * k).toFixed(1)}px)` }
    })
    /* the hint says its piece once the strip is out, then gets out of the way */
    const hintDone = ref(false)
    let hintTimer = null
    watch(
      () => store.stage > 0.55 && !store.detail,
      (out) => {
        clearTimeout(hintTimer)
        if (out && !hintDone.value) hintTimer = setTimeout(() => (hintDone.value = true), 6000)
      },
      { immediate: true },
    )
    watch(() => store.hoverId, (id) => id && (hintDone.value = true))

    const hintStyle = computed(() => {
      const k = smooth(clamp((store.stage - 0.55) / 0.35, 0, 1))
      return { opacity: store.detail || hintDone.value ? 0 : k }
    })

    const rec = activeRecord
    /* the line being sung right now, under the deck */
    const lyric = computed(() =>
      store.detail ? lyricAt(rec.value, store.time, store.needle) : '',
    )
    const progress = computed(() => `${(store.needle * 100).toFixed(1)}%`)
    const elapsed = computed(() => {
      const r = rec.value
      if (!r) return '0:00'
      const [m, s] = r.length.split(':').map(Number)
      const total = m * 60 + s
      const now = Math.round(total * store.needle)
      return `${Math.floor(now / 60)}:${String(now % 60).padStart(2, '0')}`
    })

    return {
      store, rec, ctaEl, ctaStyle, heroStyle, hintStyle, progress, elapsed, lyric,
      togglePlay, closeDetail, stepRecord,
    }
  },
  template: `
    <div class="backdrop"></div>
    <Stage />

    <div class="wordmark">Your Song</div>

    <button class="cta" ref="ctaEl" :style="ctaStyle">MAKE A SONG NOW</button>

    <main class="scroller">
      <section class="hero">
        <div class="hero-copy" :style="heroStyle">
          <h1 class="h-display">TURN YOUR STORY INTO A SONG.</h1>
          <p class="sub">
            Chat with our songwriting agent. Start with a feeling, a memory, or
            even half an idea—and get a song made for you in minutes.
          </p>
        </div>
      </section>
      <section class="wall"></section>
    </main>

    <p class="hint" :style="hintStyle">Drag to browse · click a record to play it</p>

    <!-- the line being sung, small, under the deck -->
    <div class="lyric" v-if="lyric">
      <transition name="line" mode="out-in">
        <p :key="lyric">{{ lyric }}</p>
      </transition>
    </div>

    <transition name="panel">
      <aside class="song-panel" v-if="store.detail && rec">
        <button class="panel-close" @click="closeDetail" aria-label="Back to the records">×</button>

        <div class="panel-top">
          <span>{{ rec.num }} · {{ rec.side }}</span>
          <span>{{ rec.when }}</span>
        </div>

        <h2 class="panel-title">{{ rec.title }}</h2>
        <p class="panel-story">{{ rec.story }}</p>

        <div class="panel-foot">
          <div class="scrub">
            <span class="scrub-line"><i :style="{ width: progress }"></i></span>
            <span class="scrub-time">{{ elapsed }} / {{ rec.length }}</span>
          </div>
          <div class="panel-controls">
            <button class="ctl" @click="stepRecord(-1)" aria-label="Previous record">‹</button>
            <button class="ctl ctl-play" @click="togglePlay">{{ store.playing ? '❚❚' : '▶' }}</button>
            <button class="ctl" @click="stepRecord(1)" aria-label="Next record">›</button>
            <span class="panel-by">{{ rec.handle }}</span>
          </div>
        </div>
      </aside>
    </transition>

    <transition name="fade">
      <p class="toast" v-if="store.toast">{{ store.toast }}</p>
    </transition>
  `,
})
