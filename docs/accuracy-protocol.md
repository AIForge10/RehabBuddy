# Angle accuracy check: 30 minutes, three people, one number for the pitch

The app claims "measured to the degree". Judges will ask how accurate it is. The harness that
answers that is already built into the app at `/pose-debug` (not linked from the menus). It records
held poses against a reference instrument and computes mean absolute error, bias, and Bland–Altman
95% limits of agreement. Trials live in the browser's localStorage, so run the whole protocol on one
laptop and export the CSV before closing the tab.

## What you need

- One laptop with a webcam, on `https://bendwith.us/pose-debug` (or the local dev server).
- One reference instrument. Best to worst: a goniometer, a phone inclinometer app (iPhone: Measure app
  › Level; Android: any "clinometer" app), or a printed protractor. Pick one and use it for every trial.
- A chair, side-on to the camera, about 2 m away, good light, whole leg in frame.
- Three people, each doing five held knee angles: fully straight, about 30°, 60°, 90°, and their deepest.

## Protocol (per held pose)

1. Sit side-on and hold the knee at the pose. Keep still.
2. The person with the instrument measures the knee angle (straight is 0°) and reads it out.
3. On the laptop, the Validation bar under the stage shows the median of the last second and either
   "Held still: moved x° in 1 s" (green) or a reason it will refuse. Pick the instrument in the dropdown once.
4. Type the reference angle in the box (placeholder "90") and press Enter. The capture is refused if the
   angle moved more than 3°, visibility dropped below 0.5, the tracked side switched, or frames dropped.
   Hold still and press Enter again. Do not use "Capture anyway" unless a trial is truly hopeless.
5. Repeat for the next pose. Fifteen trials total is enough; more is better.

## Getting the number

In "Validation results": set Scope to all joints, keep "Clean holds only" on, read the row marked
"Lowest" (that is the "Final" variant, the filtered angle the app shows). Press "Export CSV" and commit
the file as `docs/accuracy/knee-<date>.csv`. Copy the summary sentence, which looks like:

> Knee, n=15: mean absolute error 2.1°, bias +0.8°, max 4.9°, 95% limits of agreement −3.2° to +4.8°

## Where it goes

- Deck, "Measure" slide, as a fourth row: "Checked against a goniometer: mean error x.x° over n held poses."
- Landing page, step 2 "You move, we measure": append "Mean error x.x° against a goniometer."
- The pitch, one sentence, right after the live rep: "That reading is within x degrees of a goniometer."

Report the number you got, whatever it is. A 3° error on a $0 webcam setup is a strong result; a
hidden number is a weak one.
