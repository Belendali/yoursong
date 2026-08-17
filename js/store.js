import { reactive, computed } from 'vue'

/* Seeded RNG so a song always arranges the same way */
export function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

export function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/* vibe drives the arrangement the audio engine plays */
export const VIBES = {
  'lo-fi': { tempo: 78, scale: 'dorian' },
  'indie folk': { tempo: 92, scale: 'major' },
  'synth pop': { tempo: 116, scale: 'lydian' },
  'city pop': { tempo: 104, scale: 'mixolydian' },
  ballad: { tempo: 68, scale: 'minor' },
}

/* The wall — eight published songs. Artwork comes straight out of Figma
   (each PNG is already a finished picture disc), the story is what the
   person told the agent before it wrote the song. */
const SHELF = [
  {
    num: '01',
    title: 'FIRST SUMMER',
    cover: '01-first-summer',
    side: 'SIDE A',
    vibe: 'indie folk',
    story:
      'That summer, we stayed outside until the sun disappeared and ran through the fields without thinking about tomorrow. It was the last summer before everything began to change.',
    handle: '@junehale',
    when: 'Aug 2026',
    length: '3:04',
  },
  {
    num: '02',
    title: 'BY THE WATER',
    cover: '02-by-the-water',
    side: 'SIDE A',
    vibe: 'ballad',
    story:
      'We spent our first anniversary by the ocean and stayed until the sky turned dark. Nothing extraordinary happened—I just remember feeling completely sure about us.',
    handle: '@theo.lin',
    when: 'Aug 2026',
    length: '3:41',
  },
  {
    num: '03',
    title: 'SUNDAY KITCHEN',
    cover: '03-sunday-kitchen',
    side: 'SIDE A',
    vibe: 'indie folk',
    story:
      'Every Sunday, my family crowded into our tiny kitchen for dinner. We talked over each other, laughed too loudly, and never knew those ordinary nights would mean so much.',
    handle: '@rosa.m',
    when: 'Jul 2026',
    length: '2:58',
  },
  {
    num: '04',
    title: 'THE WAY HOME',
    cover: '04-the-way-home',
    side: 'SIDE A',
    vibe: 'lo-fi',
    story:
      'For two years, I took the same bus home after work. One rainy evening, I realized that this unfamiliar city had quietly become home.',
    handle: '@mira.k',
    when: 'Jul 2026',
    length: '3:22',
  },
  {
    num: '05',
    title: 'LAST DAY HERE',
    cover: '05-last-day-here',
    side: 'SIDE B',
    vibe: 'ballad',
    story:
      'On our last day of college, we walked across campus in our gowns, pretending it wasn’t goodbye. I wanted a song that felt happy and heartbreaking at the same time.',
    handle: '@sol',
    when: 'Jun 2026',
    length: '3:35',
  },
  {
    num: '06',
    title: 'GOOD BOY',
    cover: '06-good-boy',
    side: 'SIDE B',
    vibe: 'indie folk',
    story:
      'He was with me through every apartment, every bad day, and every new beginning. I wanted a song that would always bring him running back to me.',
    handle: '@dane.w',
    when: 'Jun 2026',
    length: '2:47',
  },
  {
    num: '07',
    title: 'GRANDMA’S SUMMER',
    cover: '07-grandmas-summer',
    side: 'SIDE B',
    vibe: 'lo-fi',
    story:
      'Every summer, my grandma left peaches on the kitchen table and opened the windows before I woke up. I still think of that warm, quiet room whenever I miss her.',
    handle: '@yuki.n',
    when: 'May 2026',
    length: '3:12',
  },
  {
    num: '08',
    title: 'MILES BETWEEN',
    cover: '08-miles-between',
    side: 'SIDE B',
    vibe: 'city pop',
    story:
      'At 22, I packed everything into my old car and drove across the country to start over. That road was the first time my life truly felt like my own.',
    handle: '@arun',
    when: 'May 2026',
    length: '3:18',
  },
]

let uid = 0
export function makeRecord(spec) {
  const vibe = VIBES[spec.vibe] || VIBES['lo-fi']
  return {
    id: `rec-${++uid}`,
    num: spec.num,
    title: spec.title,
    story: spec.story,
    side: spec.side || 'SIDE A',
    src: `./assets/covers/${spec.cover}.png`,
    /* set at boot if assets/songs/<cover>.mp3 exists — see detectAudio() */
    audio: null,
    slug: spec.cover,
    vibe: spec.vibe,
    seed: spec.seed ?? hashString(spec.title),
    tempo: spec.tempo ?? vibe.tempo,
    scale: spec.scale ?? vibe.scale,
    handle: spec.handle || '@you',
    when: spec.when || 'just now',
    length: spec.length || '3:00',
    plays: spec.plays ?? 0,
  }
}

export const store = reactive({
  ready: false,
  /* 0 = hero (deck alone) · 1 = the wall of records is out */
  stage: 0,
  /* the song3 screen: deck slides left, panel opens on the right */
  detail: false,

  records: SHELF.map((s) => makeRecord(s)),
  activeId: null,
  hoverId: null,
  playing: false,
  needle: 0, // 0..1 tonearm travel

  toast: '',
})

export const activeRecord = computed(
  () => store.records.find((r) => r.id === store.activeId) || null,
)

export function toast(msg) {
  store.toast = msg
  clearTimeout(toast._t)
  toast._t = setTimeout(() => (store.toast = ''), 2600)
}
