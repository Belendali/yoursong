import { rng, hashString, VIBES, makeRecord } from './store.js'

/* The songwriting agent.
   Everything here runs locally so the demo is instant and offline-safe.
   To wire a real model, replace `writeLyrics` with a call to the Claude API
   (Messages API, model "claude-opus-5") and keep the same return shape. */

export const TOPICS = [
  { key: 'miss', label: 'Someone I miss' },
  { key: 'drive', label: 'A late-night drive' },
  { key: 'restart', label: 'Starting over' },
  { key: 'small', label: 'A small good thing' },
]

export const VIBE_CHIPS = Object.entries(VIBES).map(([key, v]) => ({ key, label: v.label }))

const THEME_WORDS = {
  miss: ['miss', 'gone', 'left', 'she', 'he', 'they', 'love', 'ex', 'grandma', 'grandpa', 'friend', 'dad', 'mom', 'goodbye'],
  drive: ['drive', 'driving', 'car', 'road', 'night', 'highway', 'city', 'lights', 'train', 'bus', 'late', 'stop', 'stops', 'walk', 'street'],
  restart: ['start', 'starting', 'new', 'again', 'move', 'moving', 'quit', 'change', 'first', 'leaving', 'begin'],
  small: ['coffee', 'rain', 'window', 'dog', 'cat', 'morning', 'kitchen', 'sun', 'quiet', 'radio', 'cooking', 'cooks'],
}

/* couplets — line 1 sets, line 2 rhymes home */
const COUPLETS = {
  miss: [
    ['I keep your number under a different name', 'Every winter comes back the same'],
    ['The chair still leans the way you left it', 'I say your name and the room accepts it'],
    ['Somebody laughed like you downtown', 'And I stood there and I put it down'],
    ['I learned to cook the thing you made', 'Turns out the recipe was the easy trade'],
    ['I stopped explaining you to my friends', 'Some kinds of weather never ends'],
  ],
  drive: [
    ['Third gear and the windows down', 'Nothing open in this whole town'],
    ['Streetlights doing their slow parade', 'Every mile is a bill I paid'],
    ['The radio caught a song from before', 'I drove past my own front door'],
    ['Green light, no one else awake', 'I take the long way for its own sake'],
    ['Overpass hum like a held note', 'Everything I meant, I never wrote'],
  ],
  restart: [
    ['Boxes labelled in a shaky hand', 'First morning in an unmapped land'],
    ['I gave the keys back at the door', 'Turns out I do not live here anymore'],
    ['New mug, wrong cupboard, same tea', 'Slowly it starts to look like me'],
    ['I am learning the bus route by heart', 'Nobody tells you the quiet part'],
    ['Cut my hair in a stranger sink', 'Turned out braver than I think'],
  ],
  small: [
    ['Coffee going cold beside the sill', 'The whole day held completely still'],
    ['Rain on the awning, keeping time', 'Nothing happened and it was fine'],
    ['The dog found the one warm square of floor', 'I did not need anything more'],
    ['Bread and the radio, low and near', 'This is the good part, right here'],
    ['You texted me a photo of the sky', 'Ordinary things are how we get by'],
  ],
}

const CHORUS = {
  miss: [
    'So play it loud, play it slow,',
    'there is a version of us I never let go —',
    '{dedication}, if the song gets through,',
    'this is the long way of saying I miss you.',
  ],
  drive: [
    'Keep driving, keep the meter low,',
    'the night has somewhere it wants us to go —',
    '{dedication}, put your window down,',
    'we are the last two lights in town.',
  ],
  restart: [
    'Start again, start it small,',
    'a door is a door, it does not need a hall —',
    '{dedication}, count it from one,',
    'I am not finished, I have barely begun.',
  ],
  small: [
    'Hold the small thing, hold it plain,',
    'a kettle, a window, a little rain —',
    '{dedication}, this is the whole of it,',
    'a good day is a good day, that is it.',
  ],
}

const TITLE_BITS = {
  miss: ['The Long Way Of Saying', 'Different Name', 'Same Winter', 'Chair By The Window'],
  drive: ['Last Two Lights', 'Third Gear', 'Long Way Home', 'Nobody Else Awake'],
  restart: ['Barely Begun', 'Count It From One', 'Unmapped Morning', 'Keys Back'],
  small: ['Good Part, Right Here', 'Cold Coffee, Warm Floor', 'Ordinary Things', 'Kettle Weather'],
}

export function classify(text) {
  // whole words only — substring matching turns "her" into a hit for "he"
  const tokens = new Set((text || '').toLowerCase().match(/[a-z']+/g) || [])
  let best = null
  let hits = 0
  for (const [key, words] of Object.entries(THEME_WORDS)) {
    const n = words.reduce((acc, w) => acc + (tokens.has(w) ? 1 : 0), 0)
    if (n > hits) { hits = n; best = key }
  }
  return best || 'small'
}

const STOP = new Set(['the', 'a', 'an', 'and', 'i', 'my', 'of', 'for', 'to', 'in', 'on', 'is', 'it', 'that', 'with'])

/* Lift a phrase out of what the user actually typed — but only if it reads
   like a title on its own. Otherwise fall back to the curated bank. */
function titleFrom(topicText, theme, r) {
  const words = (topicText || '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const ok = (w) => !STOP.has(w.toLowerCase())
  const spans = []
  for (let len = Math.min(4, words.length); len >= 2; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const span = words.slice(i, i + len)
      if (ok(span[0]) && ok(span[span.length - 1])) spans.push(span.join(' '))
    }
  }
  if (spans.length && r() > 0.25) return spans[Math.floor(r() * spans.length)].toUpperCase()
  const bits = TITLE_BITS[theme]
  return bits[Math.floor(r() * bits.length)].toUpperCase()
}

function pick(arr, r, n) {
  const pool = [...arr]
  const out = []
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0])
  return out
}

export function writeLyrics({ topic, vibe, dedication }) {
  const theme = classify(topic)
  const seed = hashString(`${topic}|${vibe}|${dedication}`)
  const r = rng(seed)
  const couplets = pick(COUPLETS[theme], r, 4)
  const who = (dedication || '').trim()
  const chorus = CHORUS[theme]
    .join('\n')
    .replace('{dedication}', who ? who.replace(/[.,]$/, '') : 'whoever you are')

  const verse1 = [couplets[0][0], couplets[0][1], couplets[1][0], couplets[1][1]].join('\n')
  const verse2 = [couplets[2][0], couplets[2][1], couplets[3][0], couplets[3][1]].join('\n')
  const outro = topic.trim()
    ? `And if anybody asks what it was about —\n${topic.trim().replace(/\.$/, '')}.`
    : 'And that is the whole of it.'

  return {
    seed,
    theme,
    title: titleFrom(topic, theme, r),
    lyrics: { verse1, chorus, verse2, outro },
  }
}

export function draftToRecord(draft) {
  const written = writeLyrics(draft)
  const vibe = VIBES[draft.vibe] ? draft.vibe : 'lo-fi'
  return makeRecord({
    title: written.title,
    by: draft.dedication ? `for ${draft.dedication.replace(/^for\s+/i, '')}` : 'for me',
    vibe,
    seed: written.seed,
    lyrics: written.lyrics,
    mine: true,
  })
}

/* small tweaks the user can apply after the first pass */
export const TWEAKS = [
  { key: 'slower', label: 'Slower', apply: (rec) => ({ tempo: Math.max(56, rec.tempo - 12) }) },
  { key: 'faster', label: 'Faster', apply: (rec) => ({ tempo: Math.min(132, rec.tempo + 12) }) },
  { key: 'brighter', label: 'Brighter', apply: (rec) => ({ scale: rec.scale === 'lydian' ? 'major' : 'lydian' }) },
  { key: 'sadder', label: 'Sadder', apply: (rec) => ({ scale: rec.scale === 'minor' ? 'dorian' : 'minor' }) },
]

export const WRITING_STEPS = ['Finding the hook', 'Sketching the verses', 'Cutting the fat']
