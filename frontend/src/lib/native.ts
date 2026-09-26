// What the iOS and Android apps (../mobile) do differently from the browser.
// Here, in the web build, every hook is a no-op. `vite build --mode native`
// swaps this file for mobile/src/native.ts, which does the same things through
// Capacitor, so screens import from here and never check the platform
// themselves. The two files must export the same names and types:
// mobile/src/contract.ts fails the mobile typecheck if they drift apart.

import type { RecognizerClass } from './recognizer'

/** True inside the iOS/Android app. */
export const isNativeApp: boolean = false

/**
 * Pose runtime and model files shipped inside the app, so the first session
 * doesn't download ~20 MB. null: load them from the CDN (see pose/landmarker.ts).
 */
export const bundledPose: { wasm: string; models: Partial<Record<string, string>> } | null = null

/**
 * The browser keeps the sign-in token for the tab only (api/client.ts). The app
 * has no tabs and is killed in the background, so it keeps the token in the
 * iOS Keychain / Android Keystore instead.
 */
export async function loadToken(): Promise<string | null> {
  return null
}

export async function saveToken(_token: string | null): Promise<void> {}

/** Stop the screen dimming and locking while the phone films a session from across the room. */
export async function keepAwake(_on: boolean): Promise<void> {}

/** Light status-bar text, for full-bleed dark screens such as the live session. */
export async function darkStatusBar(_on: boolean): Promise<void> {}

/**
 * The app's own speech recognizer for "it hurts" (lib/listen.ts), where the web
 * view has none. undefined: use the browser's SpeechRecognition, if it has one.
 */
export function speechRecognizer(): RecognizerClass | undefined {
  return undefined
}
