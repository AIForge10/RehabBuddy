import { useCallback, useEffect, useRef, useState } from 'react'

// One spoken answer from the microphone, for the pain check. Recording ends on
// a second tap, after a pause once the patient has spoken, or at the cap. The
// clip is only held in memory for the caller to upload; nothing is saved.

/** Longest answer: a number and a sentence or two. */
const MAX_MS = 15_000
/** A pause this long after speech ends the answer. Long enough to think mid-sentence. */
const PAUSE_MS = 1_800
/** Nothing said this long after the tap ends it too; the screen says it didn't hear anything. */
const NO_SPEECH_MS = 7_000
/** Long enough to find the room's noise floor before judging speech against it. */
const FLOOR_MS = 300
const TICK_MS = 50

// What MediaRecorder can make: Opus in WebM on Chrome and Firefox, AAC in MP4 on Safari.
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export const canRecord =
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined'

export class RecordingError extends Error {
  /** denied: the browser or the patient blocked the mic. cancelled: stopped without a clip (unmount, cancel()). */
  kind: 'denied' | 'failed' | 'cancelled'
  constructor(kind: RecordingError['kind']) {
    super(kind)
    this.kind = kind
  }
}

type AudioContextClass = typeof AudioContext
const AudioCtx: AudioContextClass | undefined =
  typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext)

export function useRecorder() {
  const [recording, setRecording] = useState(false)
  /** Loudness 0–1 while recording, for the level ring. */
  const [level, setLevel] = useState(0)
  const end = useRef<((keep: boolean) => void) | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      end.current?.(false)
    }
  }, [])

  /** Ends the recording; start() resolves with the clip. */
  const stop = useCallback(() => end.current?.(true), [])
  /** Ends the recording and throws the clip away; start() rejects with 'cancelled'. */
  const cancel = useCallback(() => end.current?.(false), [])

  /** Call from a tap. Resolves with the clip when the answer ends; rejects with a RecordingError. */
  const start = useCallback(async (): Promise<Blob> => {
    end.current?.(false)
    // Made inside the tap, so the browser lets it run. It only measures the
    // level (for the pause detection and the ring); it plays nothing.
    const ctx = AudioCtx ? new AudioCtx() : null
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
    } catch (err) {
      ctx?.close().catch(() => {})
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      throw new RecordingError(denied ? 'denied' : 'failed')
    }
    const release = () => {
      stream.getTracks().forEach((t) => t.stop())
      ctx?.close().catch(() => {})
    }
    if (!alive.current) {
      release()
      throw new RecordingError('cancelled')
    }

    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    } catch {
      release()
      throw new RecordingError('failed')
    }
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }

    let analyser: AnalyserNode | null = null
    if (ctx) {
      analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      ctx.resume().catch(() => {})
    }
    const samples = new Float32Array(analyser?.fftSize ?? 0)

    return new Promise<Blob>((resolve, reject) => {
      const t0 = performance.now()
      // The quietest moment so far: the room's hum. Speech dips between words,
      // so this finds the floor even when the patient starts talking at the tap.
      let floor = Infinity
      let spoke = false
      let lastVoice = 0

      const finish = (keep: boolean) => {
        if (end.current !== finish) return
        end.current = null
        clearInterval(timer)
        setRecording(false)
        setLevel(0)
        const done = () => {
          release()
          if (keep) resolve(new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }))
          else reject(new RecordingError('cancelled'))
        }
        if (rec.state === 'inactive') done()
        else {
          rec.onstop = done // the last chunk arrives just before this
          rec.stop()
        }
      }

      const timer = setInterval(() => {
        const at = performance.now() - t0
        if (at >= MAX_MS) return finish(true)
        // Without a running level meter the tap and the cap still end it.
        if (!analyser || ctx?.state !== 'running') return
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const v of samples) sum += v * v
        const rms = Math.sqrt(sum / samples.length)
        setLevel(Math.min(1, Math.sqrt(rms * 6)))
        floor = Math.min(floor, rms)
        if (at < FLOOR_MS) return
        // Speech is well above the room's hum. A patient 2 m from the laptop is
        // quiet, so the bar is low; a missed word only means waiting for the cap.
        if (rms > Math.max(0.02, floor * 3)) {
          spoke = true
          lastVoice = at
        }
        if (spoke ? at - lastVoice > PAUSE_MS : at > NO_SPEECH_MS) finish(true)
      }, TICK_MS)

      end.current = finish
      rec.start()
      setRecording(true)
    })
  }, [])

  return { recording, level, start, stop, cancel }
}
