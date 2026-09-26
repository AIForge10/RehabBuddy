// drop-in camera view for the app screens.
//   const pose = usePoseSession({ joint: 'knee', targetAngle: 90 })
//   <PoseCamera pose={pose} className="rounded-3xl" />
// Style the wrapper however you like (className). Video + skeleton overlay are mirrored,
// and both use object-cover so the overlay lines up at any wrapper size.
import type { PoseSession } from './usePoseSession'

interface Props {
  pose: PoseSession
  className?: string
  showAngle?: boolean   // big angle badge in the corner (default true)
}

export default function PoseCamera({ pose, className = '', showAngle = true }: Props) {
  return (
    <div className={`relative w-full overflow-hidden bg-black ${className}`} style={{ aspectRatio: '4 / 3' }}>
      <div className="absolute inset-0" style={{ transform: 'scaleX(-1)' }}>
        <video ref={pose.videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        <canvas ref={pose.canvasRef} className="absolute inset-0 h-full w-full object-cover" />
      </div>

      {!pose.ready && !pose.error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/80">Starting camera…</div>
      )}
      {pose.error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-red-300">
          Camera error: {pose.error}
        </div>
      )}
      {pose.ready && !pose.visible && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-white">
          {pose.tip}
        </div>
      )}
      {showAngle && pose.angle != null && (
        <div className="absolute right-3 top-3 rounded-2xl bg-black/60 px-4 py-2 text-3xl font-bold text-white">
          {pose.angle}°
        </div>
      )}
    </div>
  )
}
