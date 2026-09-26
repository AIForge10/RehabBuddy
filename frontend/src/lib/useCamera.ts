import { useEffect, useRef, useState } from 'react'

export type CameraStatus = 'starting' | 'on' | 'denied'

/** Attaches the webcam to a <video>. The same ref is what the pose hook reads frames from. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<CameraStatus>(() =>
    'mediaDevices' in navigator ? 'starting' : 'denied',
  )

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    if (!('mediaDevices' in navigator)) return
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop())
          return
        }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          void videoRef.current.play().catch(() => {})
        }
        setStatus('on')
      })
      .catch(() => setStatus('denied'))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  return { videoRef, status }
}
