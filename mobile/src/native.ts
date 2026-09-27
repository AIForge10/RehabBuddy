// The app side of frontend/src/lib/native.ts: the same hooks, done through
// Capacitor. The frontend's native build (`vite build --mode native`, run by
// scripts/build-web.mjs) compiles this file in place of that one, so read the
// comments there for what each hook is for. Everything here is best effort: a
// plugin that fails leaves the app working as the website would.

import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle, type PluginListenerHandle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage'
import type { Recognizer, RecognizerClass } from '../../frontend/src/lib/recognizer'

export const isNativeApp: boolean = true

// scripts/build-web.mjs copies these into the app. Only the models the sessions
// use are bundled (the pose model, and the hand model for the wrist); the other
// pose models (pose-debug only) still download.
export const bundledPose = {
  wasm: '/pose/wasm',
  models: { full: '/pose/pose_landmarker_full.task', hand: '/pose/hand_landmarker.task' },
}

const TOKEN_KEY = 'token'

export async function loadToken(): Promise<string | null> {
  const token = await SecureStorage.get(TOKEN_KEY, false)
  return typeof token === 'string' ? token : null
}

export async function saveToken(token: string | null): Promise<void> {
  try {
    // ThisDeviceOnly: a backup restored onto another phone signs in again.
    if (token) await SecureStorage.set(TOKEN_KEY, token, false, false, KeychainAccess.whenUnlockedThisDeviceOnly)
    else await SecureStorage.remove(TOKEN_KEY)
  } catch {
    /* the token still lives for this launch (api/client.ts) */
  }
}

export async function keepAwake(on: boolean): Promise<void> {
  try {
    await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep())
  } catch {
    /* the phone just follows its auto-lock setting */
  }
}

export async function darkStatusBar(on: boolean): Promise<void> {
  try {
    await SystemBars.setStyle({ style: on ? SystemBarsStyle.Dark : SystemBarsStyle.Default })
  } catch {
    /* cosmetic */
  }
}

// --- "It hurts" (lib/listen.ts) ---------------------------------------------------
// The web view has no SpeechRecognition, so the listener gets this one instead:
// ios/App/App/StopListenerPlugin.swift (Apple's recognizer) behind the same
// shape. Android has no plugin yet, so there the listener is simply absent.

interface StopListenerPlugin {
  start(options: { language: string }): Promise<void>
  stop(): Promise<void>
  addListener(event: 'result', fn: (e: { transcript: string; isFinal: boolean }) => void): Promise<PluginListenerHandle>
  addListener(event: 'end', fn: (e: { error?: string }) => void): Promise<PluginListenerHandle>
}

const StopListener = registerPlugin<StopListenerPlugin>('StopListener')

/** The recognizer listening right now: the plugin has one microphone, so at most one. */
let current: NativeRecognizer | null = null
let subscribed = false

function subscribe() {
  if (subscribed) return
  subscribed = true
  void StopListener.addListener('result', (e) => {
    if (e.isFinal) current?.heard(e.transcript)
  })
  void StopListener.addListener('end', (e) => current?.ended(e.error))
}

class NativeRecognizer implements Recognizer {
  lang = 'en-US'
  continuous = true
  interimResults = false
  onstart: (() => void) | null = null
  onresult: ((e: SpeechRecognitionEvent) => void) | null = null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null = null
  onend: (() => void) | null = null
  private running = false

  start() {
    if (this.running) throw new Error('already listening') // as the browser's throws; listen.ts expects it
    this.running = true
    current = this
    subscribe()
    StopListener.start({ language: this.lang }).then(
      () => this.onstart?.(),
      (err: { code?: string; message?: string } | undefined) => {
        console.warn('[listen] native recognizer failed to start:', err?.code, err?.message)
        this.ended(err?.code ?? 'audio-capture', err?.message)
      },
    )
  }

  abort() {
    if (this.running) void StopListener.stop() // the plugin's `end` follows
  }

  heard(transcript: string) {
    const result = { 0: { transcript, confidence: 1 }, isFinal: true, length: 1 }
    this.onresult?.({ resultIndex: 0, results: [result] } as unknown as SpeechRecognitionEvent)
  }

  ended(error?: string, message = '') {
    if (!this.running) return
    this.running = false
    if (current === this) current = null
    if (error) this.onerror?.({ error, message } as SpeechRecognitionErrorEvent)
    this.onend?.()
  }
}

export function speechRecognizer(): RecognizerClass | undefined {
  return Capacitor.getPlatform() === 'ios' ? NativeRecognizer : undefined
}

export function onNativeBackButton(onBack: (event: { canGoBack: boolean }) => void | Promise<void>): () => void {
  const handlePromise = App.addListener('backButton', (event) => {
    console.log('[native] backButton event from Capacitor:', event)
    void onBack(event)
  })

  return () => {
    void handlePromise.then((handle) => handle.remove())
  }
}

export async function exitNativeApp(): Promise<void> {
  if (Capacitor.getPlatform() === 'ios') {
    console.log('[native] exitNativeApp skipped: iOS manages app lifecycle via system gestures')
    return
  }
  try {
    console.log('[native] exitNativeApp calling App.exitApp()')
    await App.exitApp()
  } catch (err) {
    console.warn('[native] exitApp failed:', err)
  }
}
