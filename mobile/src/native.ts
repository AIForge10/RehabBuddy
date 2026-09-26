// The app side of frontend/src/lib/native.ts: the same hooks, done through
// Capacitor. The frontend's native build (`vite build --mode native`, run by
// scripts/build-web.mjs) compiles this file in place of that one, so read the
// comments there for what each hook is for. Everything here is best effort: a
// plugin that fails leaves the app working as the website would.

import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage'

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
