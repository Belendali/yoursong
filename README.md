# YOURSONG

> Turn your story into a song.

An AI songwriting agent: tell it a feeling, a memory, or half an idea, and it
writes you a song — pressed as a record you can publish and let other people
play. This repo currently holds the **landing page**: a single WebGL stage that
carries a turntable, a drifting strip of published records, and a story panel.

## Running it

No build step, no Node — the page loads Vue, Three.js and TresJS from a CDN via
an import map. Any static server works, but the bundled one sets `no-store` so
the browser never serves a stale ES module:

```bash
python3 serve.py
```

Then open <http://localhost:8480>.

## How it is put together

| Piece | Where |
| --- | --- |
| Scroll → scene state, camera-space layout | [js/scene/Scene.js](js/scene/Scene.js) |
| Turntable model (procedural, matte low-poly) | [js/scene/turntable.js](js/scene/turntable.js) |
| Record mesh + picture-disc material | [js/scene/disc.js](js/scene/disc.js) |
| Canvas-generated grooves, deck grain, shadow | [js/textures.js](js/textures.js) |
| Records, playback state | [js/store.js](js/store.js), [js/actions.js](js/actions.js) |
| Web Audio arrangement engine | [js/audio.js](js/audio.js) |
| Overlay UI (wordmark, CTA, song panel) | [js/ui/App.js](js/ui/App.js) |
| Artwork exported from Figma | [assets/covers](assets/covers) |

The whole page is one fixed `<TresCanvas>`. Everything is positioned in **camera
space** from normalised board coordinates, so the composition matches the Figma
board (1280 × 830) at any window ratio.

### The three states

1. **Hero** — turntable centred, headline, centred CTA.
2. **Scrolled** — the CTA flies to the top-right corner, then eight records rise
   into a flat strip that drifts right → left and wraps forever.
3. **Song** — click a record: the deck slides left, that record lands on the
   platter and spins at 33⅓, and a panel opens with the story its author told
   the agent.

Audio is synthesised locally — each record's seed picks the key, tempo and
arrangement — so there is nothing to stream and nothing to license.

## Status

The songwriting app (`js/agent.js`, `js/ui/Studio.js`, `js/ui/Nowbar.js`) is an
earlier prototype. It is kept in the tree but unwired from the landing entry
point while its flow is being redesigned.

Product spec (Chinese): [docs/YOURSONG-产品文档.md](docs/YOURSONG-产品文档.md)
