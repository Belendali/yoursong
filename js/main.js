import { createApp } from 'vue'
import { App } from './ui/App.js'
import { detectAudio } from './actions.js'

/* Iosevka has to be in before the first paint so the type never jumps */
const fonts = document.fonts?.ready || Promise.resolve()

fonts.then(() => {
  const app = createApp(App)
  // TresJS elements are handled by its custom renderer, not by Vue's DOM one
  app.config.compilerOptions.isCustomElement = (tag) =>
    (tag.startsWith('Tres') && tag !== 'TresCanvas') || tag === 'primitive'
  app.mount('#app')
  // real tracks take over from the synth wherever a file has been dropped in
  detectAudio()
})
