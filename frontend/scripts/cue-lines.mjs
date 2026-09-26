// Prints every voice-coach cue line as JSON, for scripts/generate_audio.py:
//   [{ "lang": "en", "clip": "start_hip", "text": "Let’s begin. Lift your knee slowly." }, ...]
// Loads the app's own modules through Vite, so the audio always says what the
// coach shows as a caption.
import { runnerImport } from 'vite'

const load = async (path) => (await runnerImport(new URL(path, import.meta.url).pathname)).module
const coach = await load('../src/lib/coach.ts')
const { EXERCISES } = await load('../src/lib/exercises.ts')

const lines = new Map()
for (const lang of Object.keys(coach.CUE_TEXT))
  for (const exercise of Object.values(EXERCISES))
    for (const cue of coach.CUES) {
      const { clip, text } = coach.cueLine(cue, lang, exercise)
      lines.set(`${lang}/${clip}`, { lang, clip, text })
    }

console.log(JSON.stringify([...lines.values()], null, 2))
