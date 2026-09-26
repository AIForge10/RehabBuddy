// The shape of a speech recognizer, as lib/listen.ts drives one: the Web Speech
// API's SpeechRecognition, narrowed to what's used. TypeScript's DOM library has
// the recognizer's events but not the recognizer itself, so it's spelled out here.
// The iOS app's own recognizer (mobile/src/native.ts) has the same shape, so the
// listener works the same in a browser and in the app.

export interface Recognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

export type RecognizerClass = new () => Recognizer
