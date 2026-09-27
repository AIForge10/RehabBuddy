import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'starting' | 'on' | 'denied'

/**
 * Owns one webcam stream for the whole session flow. `attach` is a callback
 * ref, so the setup preview and the live view can each mount their own
 * <video> without restarting the camera. `videoRef` always points at the
 * most recently attached element (what the pose hook reads frames from).
 */
export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')

  useEffect(() => {
    if (!enabled || stream) return
    if (!('mediaDevices' in navigator)) {
      queueMicrotask(() => setStatus('denied'))
      return
    }
    let cancelled = false
    queueMicrotask(() => !cancelled && setStatus('starting'))
    navigator.mediaDevices
      // Front camera on phones and tablets: the patient watches themselves on the screen.
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop())
        setStream(s)
        setStatus('on')
      })
      .catch(() => !cancelled && setStatus('denied'))
    return () => {
      cancelled = true
    }
  }, [enabled, stream])

  // Back to a step that doesn't film (setup → brief): the camera goes off, and on again after.
  useEffect(() => {
    if (enabled || !stream) return
    stream.getTracks().forEach((tr) => tr.stop())
    queueMicrotask(() => {
      setStream(null)
      setStatus('idle')
    })
  }, [enabled, stream])

  // Stop the camera when the flow unmounts.
  useEffect(() => () => stream?.getTracks().forEach((tr) => tr.stop()), [stream])

  const attach = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el) return
      videoRef.current = el
      if (stream && el.srcObject !== stream) {
        el.srcObject = stream
        void el.play().catch(() => {})
      }
    },
    [stream],
  )

  return { attach, videoRef, status }
}
