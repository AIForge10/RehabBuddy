import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getAssignment } from '../api/client'
import { useAuth } from '../lib/auth'
import { unlockAudio } from '../lib/coach'
import { assignmentFor, exerciseFor, type BodyPart } from '../lib/exercises'
import { useCamera } from '../lib/useCamera'
import { preloadPose } from '../pose'
import type { Assignment } from '../types/session'
import { Brief } from './session/Brief'
import { Live } from './session/Live'
import { Setup } from './session/Setup'

type Step = 'brief' | 'setup' | 'live'

/**
 * Pre-session briefing → camera setup → live session. One camera stream spans
 * setup and live. The briefing's joint picker sets the exercise for the rest
 * of the flow; it starts on the one the therapist assigned.
 */
export default function ExerciseSession() {
  const navigate = useNavigate()
  const location = useLocation()
  const patientId = useAuth().account!.id
  const [assignment, setAssignment] = useState<Assignment | null>(
    (location.state as { assignment?: Assignment } | null)?.assignment ?? null,
  )
  const [part, setPart] = useState<BodyPart | null>(null)
  const [step, setStep] = useState<Step>('brief')
  const { attach, status } = useCamera(step !== 'brief')

  // The pose model takes a few seconds to download; fetch it while they read the brief.
  useEffect(preloadPose, [])

  useEffect(() => {
    if (!assignment) getAssignment(patientId).then(setAssignment).catch(() => navigate('/'))
  }, [assignment, patientId, navigate])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  if (!assignment) return null
  const exercise = exerciseFor(part ?? assignment.exercise.joint)
  const session = assignmentFor(assignment, exercise)
  if (step === 'brief') return <Brief assignment={session} exercise={exercise} onPick={setPart} onNext={() => setStep('setup')} />
  const start = () => {
    unlockAudio() // the coach's first cue plays after the countdown, outside this tap
    setStep('live')
  }
  if (step === 'setup') return <Setup exercise={exercise} camera={status} attach={attach} onStart={start} onBack={() => setStep('brief')} />
  return <Live assignment={session} exercise={exercise} camera={status} attach={attach} />
}
