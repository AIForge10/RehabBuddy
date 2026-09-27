# bendwith.us for Android in React Native — port status

A React Native Android app, started because the iOS app got a native speech plugin and we
wanted Android worked on directly. **It is a fraction of the product so far.** The shipping
Android app is still `mobile/` (Capacitor), which builds today and shares 100% of its UI
with iOS and the website. Nothing here replaces it yet, and nothing here affects the
deployed demo.

## What works

- **Native pose pipeline.** `android/app/src/main/java/com/bendwithrn/PoseCameraView.kt`:
  CameraX feeds frames to MediaPipe's Android `PoseLandmarker` in `LIVE_STREAM` mode, GPU
  delegate with a CPU fallback, one pose, frames dropped while one is in flight. Landmarks
  go up to JS as an `onPose` event. The model is bundled in `assets/`, so a session needs
  no network.
- **The measurement stack is the website's own code**, copied unchanged from
  `frontend/src/pose/`: `angle.ts`, `filters.ts`, `joints.ts`, `repCounter.ts`, `form.ts`
  (641 lines). That was the point — the phone and the browser must not disagree about a
  patient's range of motion. `landmarks.ts` supplies the two types those files used to get
  from `@mediapipe/tasks-vision`, whose WASM build cannot load in React Native, with the
  same `DEFAULT_TUNING` values as `tracker.ts`.
- **A live session screen** (`App.tsx`): camera preview, live angle in the joint's
  convention, rep count with the target, best angle, form-warning text, reset.

## What is NOT ported

Roughly 16,700 of the web app's 17,300 TS/TSX lines, including everything below:

| Missing | Why it is work, not a copy |
| --- | --- |
| Every other screen (welcome, auth, home, brief, setup, pain check-in, session done, therapist dashboard, replay) | 52 `.tsx` files built on DOM + 1,174 Tailwind classes; React Native has neither |
| The rigged figure and gauges (`SeatedBody`, `LegFigure`, `LimbLattice`, `AngleGauge`, `ExerciseFigure`) | 34 files of inline DOM `<svg>`; needs `react-native-svg` |
| Charts (`RomChart`, `TrendChart`, `Sparkline`) | Recharts is DOM-only; needs `victory-native` or similar |
| Routing | `react-router-dom` → `react-navigation` |
| The voice coach | 130 bundled mp3 clips played through `new Audio()`; needs `react-native-sound` or similar |
| Spoken pain check-in | `MediaRecorder` + `getUserMedia` do not exist in RN |
| "It hurts" voice-stop | The very gap that prompted this; still needs a native Android recognizer either way |
| Backend calls | `src/api/client.ts` is close to portable (`fetch` works) but uses `sessionStorage` in 3 places → `AsyncStorage` |
| Therapist live view | Server-Sent Events; needs an RN-compatible transport |
| The whole i18n layer, EN/ES | Copyable, but every consumer is a DOM component |
| Setup self-checks, demo mode, session replay, plan suggestion, weekly recap | All DOM components |

The web tracker itself (`tracker.ts`, 404 lines) is also **not** ported: side-picking with
hysteresis, left/right swap following, the hand model for wrist, median filtering and
dropout holding. `useNativePose.ts` has a simplified side-picker instead, so wrist tracking
and label-swap handling are weaker here than on the website.

## Honest assessment

This is the easy 4% — the part where the shared TypeScript did the work. The remaining 96%
is UI that has to be rebuilt from scratch, and it buys nothing the Capacitor app does not
already do, while creating a second UI to maintain forever. The one thing React Native was
wanted for (native speech on Android) is about 200 lines of Kotlin in the existing app:
an Android `StopListener` mirroring `mobile/ios/App/App/StopListenerPlugin.swift`, behind
the `Recognizer` interface already abstracted in `frontend/src/lib/recognizer.ts`.

## Build and run

```bash
nvm use 22                       # Capacitor and RN tooling both want Node >= 22
export JAVA_HOME=~/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
export ANDROID_HOME=~/Library/Android/sdk
npm install
(cd android && ./gradlew assembleDebug)          # → android/app/build/outputs/apk/debug/

# with a phone on USB and USB debugging approved:
"$ANDROID_HOME/platform-tools/adb" install -r android/app/build/outputs/apk/debug/app-debug.apk
npx react-native start                            # Metro, for the JS bundle in debug
```

`newArchEnabled=false` in `android/gradle.properties`: `PoseCameraView` is a classic
`SimpleViewManager`, bound with `requireNativeComponent` and no codegen. Turn it back on
once the pose view is rewritten as a Fabric component spec.
