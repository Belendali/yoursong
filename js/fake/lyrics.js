/* Stand-in lyricist for P0.
 *
 * Writes a plausible song out of the chapter, the line the user typed and a
 * seed — no model, no network, deterministic. Claude replaces writeLyrics()
 * in P1; everything around it (streaming, editing, section rewrites) is built
 * against this shape and does not change.
 */

import { rng, hashString } from '../store.js'

/* ---------- chapters ---------- */

export const CHAPTERS = {
  childhood: {
    name: 'Childhood',
    tagline: 'Where it all began',
    starters: ['家里的味道', '一个夏天', '最早的一件事', '那时候的大人'],
    images: ['the kitchen light', 'a bicycle in the yard', 'the long grass', 'my mother humming'],
    verbs: ['ran', 'waited', 'hid', 'grew'],
  },
  youth: {
    name: 'Youth',
    tagline: 'The learning years',
    starters: ['第一次离开', '一个朋友', '考砸的那次', '十七岁的房间'],
    images: ['the last bus', 'a borrowed jacket', 'the empty classroom', 'a door that stayed open'],
    verbs: ['left', 'promised', 'wondered', 'stayed'],
  },
  love: {
    name: 'Love',
    tagline: 'The ones who moved you',
    starters: ['第一次心动', '那个夏天的人', '分开那天', '现在枕边的人'],
    images: ['your hand on the table', 'the rain on the window', 'a song we wore out', 'the walk home'],
    verbs: ['held', 'missed', 'forgave', 'chose'],
  },
  family: {
    name: 'Family',
    tagline: 'The ones who matter',
    starters: ['一顿饭', '一个习惯', '说不出口的一句', '你像谁'],
    images: ['the crowded table', 'the porch light', 'my father’s hands', 'the same old chair'],
    verbs: ['gathered', 'argued', 'carried', 'came back'],
  },
  career: {
    name: 'Career',
    tagline: 'Building your path',
    starters: ['第一份工资', '撑不下去那天', '做成的一件事', '现在的意义'],
    images: ['the late train', 'a screen at midnight', 'the first paycheck', 'a door with my name'],
    verbs: ['tried', 'failed', 'built', 'kept going'],
  },
  worldview: {
    name: 'Worldview',
    tagline: 'How you see it all',
    starters: ['你信什么', '改变你的一本书', '想留下什么'],
    images: ['a wide open sky', 'the road ahead', 'the quiet after', 'everything I was given'],
    verbs: ['believe', 'let go', 'keep', 'give away'],
  },
  own: {
    name: 'Your own',
    tagline: 'Anything you want',
    starters: [],
    images: ['the light through the blinds', 'a room I know', 'the street at dusk', 'this ordinary day'],
    verbs: ['remember', 'hold', 'return', 'begin'],
  },
}

/* ---------- helpers ---------- */

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/* the user's own words, trimmed into something singable */
function seedPhrase(brief) {
  const clean = String(brief || '')
    .replace(/\s+/g, ' ')
    .replace(/[.。!！?？]+$/, '')
    .trim()
  if (!clean) return ''
  const words = clean.split(' ')
  return words.length > 9 ? words.slice(0, 9).join(' ') : clean
}

/* ---------- the writer ---------- */

export function writeLyrics({ chapter = 'own', brief = '', shape = 'story', seed } = {}) {
  const ch = CHAPTERS[chapter] || CHAPTERS.own
  const s = seed ?? hashString(chapter + '|' + brief)
  const r = rng(s)
  const pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length]

  const phrase = seedPhrase(brief)
  const img1 = pick(ch.images)
  const img2 = pick(ch.images.filter((i) => i !== img1).concat(ch.images))
  const verb = pick(ch.verbs)

  const verse1 = [
    phrase ? cap(phrase) : `I keep ${img1}`,
    `and ${img2} is still there`,
    `we ${verb} like the day was ours`,
    `nobody told us it would turn`,
  ]
  const chorus = [
    `And I didn't know it was the last`,
    `${cap(ch.name.toLowerCase())} moving fast`,
    `the whole wide world was waiting there`,
    `we were ${verb === 'ran' ? 'running' : 'living'} without a care`,
  ]
  const verse2 = [
    `Now ${img2} means something else`,
    `I say your name and it stays warm`,
    `by ${pick(['September', 'winter', 'morning', 'the end of it'])} everything had changed`,
    `but ${img1} still calls my name`,
  ]
  const outro = [`I didn't know`, `how fast a ${ch.name.toLowerCase()} lets you go`]

  const sections =
    shape === 'short'
      ? [
          { kind: 'Chorus', lines: chorus },
          { kind: 'Verse', lines: verse1 },
        ]
      : shape === 'letter'
        ? [
            { kind: 'Verse', lines: verse1 },
            { kind: 'Chorus', lines: chorus },
            { kind: 'Outro', lines: outro },
          ]
        : [
            { kind: 'Verse 1', lines: verse1 },
            { kind: 'Chorus', lines: chorus },
            { kind: 'Verse 2', lines: verse2 },
            { kind: 'Outro', lines: outro },
          ]

  return { titles: titlesFor({ ch, phrase, img1, r }), sections }
}

/* three candidates: one from their words, one from the imagery, one flat */
function titlesFor({ ch, phrase, img1, r }) {
  const fromPhrase = phrase
    ? phrase.split(' ').slice(0, 3).join(' ')
    : ch.images[0].split(' ').slice(-2).join(' ')
  const fromImage = img1.replace(/^(the|a|my)\s+/i, '')
  const plain = [`${ch.name} Side A`, `Where It Began`, `The Long Way`, `Still There`][
    Math.floor(r() * 4)
  ]
  return [fromPhrase, fromImage, plain].map((s) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 26),
  )
}

/* rewriting one section only — the rest of the song is left alone */
export function rewriteSection(lyrics, index, opts) {
  const fresh = writeLyrics({ ...opts, seed: (opts.seed ?? 0) + index * 7919 + 13 })
  const from = fresh.sections[index % fresh.sections.length]
  const next = { ...lyrics, sections: lyrics.sections.slice() }
  next.sections[index] = { ...next.sections[index], lines: from.lines }
  return next
}

/* every line in order, for the streaming reveal and the lyric strip */
export function flatLines(lyrics) {
  return (lyrics?.sections || []).flatMap((s) => s.lines)
}
