import { defineComponent, ref, computed, watch, nextTick } from 'vue'
import { store, VIBES, toast } from '../store.js'
import { TOPICS, VIBE_CHIPS, TWEAKS, WRITING_STEPS, draftToRecord } from '../agent.js'
import { selectRecord, stopPlayback, showShelf } from '../actions.js'
import { player } from '../audio.js'
import { coverCanvas } from '../textures.js'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export const Studio = defineComponent({
  name: 'Studio',
  setup() {
    const input = ref('')
    const typing = ref(false)
    const threadEl = ref(null)
    const artHost = ref(null)

    const prompt = computed(() => {
      switch (store.step) {
        case 0: return 'a feeling, a memory, half an idea…'
        case 2: return 'a name, or leave it blank'
        default: return ''
      }
    })

    async function say(who, text, delay = 420) {
      if (who === 'agent') {
        typing.value = true
        await wait(delay)
        typing.value = false
      }
      store.thread.push({ who, text, id: Math.random().toString(36).slice(2) })
      await nextTick()
      if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight
    }

    if (!store.thread.length) {
      say('agent', "Hi — I'm your songwriter. What should this one be about?", 200)
    }

    async function submitTopic(text) {
      const t = (text || '').trim()
      if (!t) return
      store.draft.topic = t
      input.value = ''
      await say('user', t, 0)
      store.step = 1
      await say('agent', 'Got it. How should it feel?')
    }

    async function pickVibe(key) {
      store.draft.vibe = key
      await say('user', VIBES[key].label, 0)
      store.step = 2
      await say('agent', 'Last thing — who is it for? You can skip.')
    }

    async function submitDedication(text) {
      const t = (text || '').trim()
      store.draft.dedication = t
      input.value = ''
      await say('user', t || 'skip', 0)
      await runWriting()
    }

    async function runWriting() {
      store.step = 3
      for (let i = 0; i < WRITING_STEPS.length; i++) {
        store.writingStep = i
        await wait(560)
      }
      store.writingStep = -1
      makeDraft()
    }

    function clearDraftRecord() {
      const old = store.records.findIndex((r) => r.draft)
      if (old >= 0) {
        const rec = store.records[old]
        if (store.activeId === rec.id) {
          stopPlayback()
          store.activeId = null
        }
        store.records.splice(old, 1)
      }
    }

    function makeDraft(nudge = 0) {
      clearDraftRecord()
      const rec = draftToRecord(store.draft)
      rec.seed = (rec.seed + nudge * 9176) >>> 0
      rec.draft = true
      store.records.push(rec)
      store.song = rec
      store.step = 4
      selectRecord(rec.id)
      nextTick(paintArt)
    }

    function paintArt() {
      if (!artHost.value || !store.song) return
      artHost.value.innerHTML = ''
      artHost.value.appendChild(coverCanvas(store.song, 360))
    }
    watch(() => store.song?.id, () => nextTick(paintArt))

    let nudges = 0
    function rewrite() {
      nudges++
      makeDraft(nudges)
      toast('Rewritten — same brief, new take.')
    }

    function tweak(t) {
      const rec = store.song
      if (!rec) return
      Object.assign(rec, t.apply(rec))
      if (store.playing) player.play(rec)
      toast(`${t.label.toLowerCase()} — take two.`)
    }

    function publish() {
      const rec = store.song
      if (!rec) return
      rec.draft = false
      rec.mine = true
      if (!store.published.includes(rec.id)) store.published.push(rec.id)
      rec.handle = '@you'
      rec.when = 'just now'
      rec.prompt = store.draft.topic
      toast('Pressed. It is on your shelf.')
      showShelf()
    }

    function startOver() {
      clearDraftRecord()
      store.song = null
      store.step = 0
      store.draft = { topic: '', vibe: '', dedication: '' }
      store.thread = []
      say('agent', 'New one. What should it be about?', 240)
    }

    watch(() => store.resetSignal, () => startOver())

    const lyricBlocks = computed(() => {
      const l = store.song?.lyrics
      if (!l) return []
      return [
        ['Verse 1', l.verse1],
        ['Chorus', l.chorus],
        ['Verse 2', l.verse2],
        ['Outro', l.outro],
      ]
    })

    return {
      store, TOPICS, VIBE_CHIPS, TWEAKS, WRITING_STEPS,
      input, typing, threadEl, artHost, prompt, lyricBlocks,
      submitTopic, pickVibe, submitDedication, tweak, rewrite, publish, startOver,
    }
  },
  template: `
    <div class="panel">
      <div class="panel-head">
        <span>Songwriting agent</span>
        <span class="live"><i></i>{{ store.step >= 4 ? 'draft ready' : store.step === 3 ? 'writing' : 'listening' }}</span>
      </div>

      <template v-if="store.step < 3">
        <div class="thread" ref="threadEl">
          <div v-for="m in store.thread" :key="m.id" class="msg" :class="m.who">{{ m.text }}</div>
          <div v-if="typing" class="msg agent"><span class="typing"><i></i><i></i><i></i></span></div>
        </div>
        <div class="composer">
          <div class="chips" v-if="store.step === 0">
            <button v-for="t in TOPICS" :key="t.key" class="chip" @click="submitTopic(t.label)">{{ t.label }}</button>
          </div>
          <div class="chips" v-else-if="store.step === 1">
            <button v-for="v in VIBE_CHIPS" :key="v.key" class="chip" @click="pickVibe(v.key)">{{ v.label }}</button>
          </div>
          <div class="entry" v-if="store.step !== 1">
            <input
              v-model="input"
              :placeholder="prompt"
              @keyup.enter="store.step === 0 ? submitTopic(input) : submitDedication(input)"
            />
            <button class="btn btn-sm" @click="store.step === 0 ? submitTopic(input) : submitDedication(input)">
              {{ store.step === 0 ? 'Write it' : 'Done' }}
            </button>
            <button v-if="store.step === 2" class="btn btn-sm btn-ghost" @click="submitDedication('')">Skip</button>
          </div>
        </div>
      </template>

      <div v-else-if="store.step === 3" class="progress-steps">
        <div v-for="(s, i) in WRITING_STEPS" :key="s" class="step" :class="{ on: store.writingStep >= i }">
          <span>{{ String(i + 1).padStart(2, '0') }}</span>
          <span>{{ s }}</span>
          <span class="bar"></span>
        </div>
      </div>

      <template v-else>
        <div class="song">
          <div class="art" ref="artHost"></div>
          <div>
            <div class="title">{{ store.song?.title }}</div>
            <div class="tags">
              <span class="tag">{{ store.song?.by }}</span>
              <span class="tag">{{ store.song?.vibe }}</span>
              <span class="tag">{{ store.song?.tempo }} BPM</span>
              <span class="tag">{{ store.song?.scale }}</span>
            </div>
            <div class="lyrics">
              <template v-for="[label, text] in lyricBlocks" :key="label">
                <b>{{ label }}</b>{{ text }}
              </template>
            </div>
          </div>
        </div>
        <div class="song-actions">
          <button v-for="t in TWEAKS" :key="t.key" class="chip" @click="tweak(t)">{{ t.label }}</button>
          <span class="spacer"></span>
          <button class="btn btn-sm btn-ghost" @click="rewrite">Rewrite</button>
          <button class="btn btn-sm btn-ghost" @click="startOver">New song</button>
          <button class="btn btn-sm btn-accent" @click="publish">Publish</button>
        </div>
      </template>
    </div>
  `,
})
