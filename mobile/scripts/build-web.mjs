// Builds the frontend for the app into www/ (Capacitor's webDir):
//   1. `vite build --mode native` in ../frontend, which swaps in src/native.ts
//      and reads its settings from mobile/.env (frontend/vite.config.ts).
//   2. The pose runtime and model the website fetches from CDNs, copied in so
//      the app starts a session without a ~20 MB download (src/native.ts).
// `npm run build` then runs `cap sync` to copy www/ into the iOS/Android projects.

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const frontend = path('../../frontend/')
const www = path('../www/')
const cache = path('../.cache/')

const MODEL = 'pose_landmarker_full.task'
const MODEL_URL = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/${MODEL}`
// SIMD for current phones, no-SIMD for the rare WebView without it; MediaPipe picks at runtime.
const WASM = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']

const envFile = path('../.env')
if (!existsSync(envFile)) {
  console.error('mobile/.env is missing. Copy mobile/.env.example to mobile/.env and pick a backend.')
  process.exit(1)
}
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*(VITE_\w+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)
console.log(`Building the app against ${env.VITE_USE_MOCKS === 'true' ? 'the in-app mock backend' : env.VITE_API_URL || 'http://localhost:8000/api/v1'}`)

if (!existsSync(`${frontend}node_modules`)) execFileSync('npm', ['ci'], { cwd: frontend, stdio: 'inherit' })
execFileSync('npx', ['vite', 'build', '--mode', 'native', '--outDir', www, '--emptyOutDir'], { cwd: frontend, stdio: 'inherit' })

const wasmDir = `${frontend}node_modules/@mediapipe/tasks-vision/wasm/`
mkdirSync(`${www}pose/wasm`, { recursive: true })
for (const f of WASM) copyFileSync(wasmDir + f, `${www}pose/wasm/${f}`)

if (!existsSync(cache + MODEL)) {
  console.log(`Downloading ${MODEL} (once, into mobile/.cache)`)
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`${MODEL_URL}: ${res.status}`)
  mkdirSync(cache, { recursive: true })
  writeFileSync(cache + MODEL, Buffer.from(await res.arrayBuffer()))
}
copyFileSync(cache + MODEL, `${www}pose/${MODEL}`)
console.log('www/ ready')
