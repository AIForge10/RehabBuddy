# bendwith.us web app

The patient and therapist screens: React 19, Vite, Tailwind 4, MediaPipe Pose in the browser.

```bash
cp .env.example .env   # VITE_USE_MOCKS=true runs the whole UI without a backend
npm install
npm run dev            # http://localhost:5173
npm run build          # tsc + vite build into dist/
npm run lint
```

Where things are: `src/pose` (tracking, angles, rep counting, form faults), `src/lib/coach.ts`
(the voice coach's lines), `src/lib/i18n.ts` (English and Spanish), `src/screens` (one folder per
screen), `src/api` (the backend client and the in-browser mock). `/pose-debug` is the accuracy
validation harness. The mobile app in `../mobile` wraps this same build with Capacitor.
