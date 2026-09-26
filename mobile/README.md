# bendwith.us for iOS and Android

The patient app for phones and tablets. It is the website in `../frontend`,
wrapped with [Capacitor](https://capacitorjs.com) 8: the same React screens,
running in the phone's web view, plus the few things only an app can do.
There is no second copy of the UI to keep in sync.

## How it fits together

- `npm run build` runs `scripts/build-web.mjs`, which builds `../frontend`
  with `vite build --mode native` into `www/`, then `cap sync` copies `www/`
  into the iOS and Android projects.
- In that native build, `frontend/src/lib/native.ts` (no-ops, for the web) is
  swapped for `src/native.ts` (Capacitor calls). `src/contract.ts` makes
  `npm run typecheck` fail if the two files stop matching.
- The app reads its settings from `mobile/.env`, not `frontend/.env`, so it can
  point at a different backend than local web dev.

What the app does differently from the website:

| | Website | App |
|---|---|---|
| Pose runtime + model (~20 MB) | Downloaded from CDNs on first session | Shipped inside the app |
| Sign-in token | Kept for the tab | iOS Keychain / Android Keystore, survives restarts |
| Screen during a session | May dim and lock | Kept awake from camera setup to the end |
| Voice coach, iPhone on silent | Up to the browser | Always plays, mixed over any music |
| Spoken pain answer | Browser asks for the mic | App asks once |
| "It hurts" to stop | Chrome's speech recognition (audio to Google) | iOS: Apple's recognizer, on the phone where the language allows (`ios/App/App/StopListenerPlugin.swift`). Android: not yet |
| Status bar | n/a | Light text on the dark live screen |
| Copy | "Runs in your browser, any webcam" | "Runs on your phone" |

## Setup

```bash
cd mobile
npm install
cp .env.example .env    # mock backend by default
npm run build
```

`npm run build` also installs `../frontend`'s packages if needed, and
downloads the pose model once into `.cache/`.

### iOS

Needs Xcode. `npm run ios` builds and opens the project in Xcode; pick a
simulator or your phone and press Run. The iOS Simulator has no real camera
(it shows a test pattern), so check pose tracking on a phone.

### Android

Needs Android Studio. `npm run android` builds and opens the project. Gradle
8.14 needs JDK 17 or 21; Android Studio's bundled JDK works. A newer system
JDK (e.g. Homebrew's 26) fails the Gradle sync. To build from the command line:

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
```

(run inside `android/`, after creating `android/local.properties` with
`sdk.dir=/Users/<you>/Library/Android/sdk`, or open the project once in
Android Studio, which writes it.)

## Pointing at the real backend

In `mobile/.env` set `VITE_USE_MOCKS=false` and `VITE_API_URL` to the backend
(with `/api/v1`), then `npm run build` again.

- The iOS Simulator can reach `http://localhost:8000/api/v1` on your Mac.
- Real devices and the Android emulator need the deployed HTTPS backend.
- The backend must allow the app's origins in CORS: `capacitor://localhost`
  (iOS) and `https://localhost` (Android). They're in the defaults in
  `backend/api/core/config.py`; a deployment that overrides
  `BACKEND_CORS_ORIGINS` has to list them too.

## Icons and launch screens

Generated from the brand mark in `frontend/public/favicon.svg` (the Figma
export). After changing the mark: `npm run icons` (macOS).

## Before the stores

Not done yet:

- **Test pose tracking on real phones**, especially a mid-range Android and an
  older iPhone: frame rate and battery through a whole session. `/pose-debug`
  in the app shows the frame rate.
- Apple Developer Program and Google Play Console accounts, signing, and
  version numbers. The bundle ID is `us.bendwith.app` (in
  `capacitor.config.ts` and both native projects).
- Privacy: a privacy policy URL, App Store privacy labels and Play Data safety
  form, and an app-level `PrivacyInfo.xcprivacy`. The app handles health
  information, so expect both stores to review it closely.
- Spanish text for the iOS camera permission prompt (`InfoPlist.strings`).
- Session reminders (local notifications) and push notifications when the
  therapist changes the plan. These are the main things the app can offer over
  the website, and they help with Apple's "more than a website" review rule.
