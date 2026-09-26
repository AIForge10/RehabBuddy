import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DEMO_PATIENT_ID, getAssignment } from '../api/client'
import { unlockAudio } from '../lib/coach'
import { assignmentFor, exerciseFor, type BodyPart } from '../lib/exercises'
import { useCamera } from '../lib/useCamera'
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
  const [assignment, setAssignment] = useState<Assignment | null>(
    (location.state as { assignment?: Assignment } | null)?.assignment ?? null,
  )
  const [part, setPart] = useState<BodyPart | null>(null)
  const [step, setStep] = useState<Step>('brief')
  const { attach, status } = useCamera(step !== 'brief')

  useEffect(() => {
    if (!assignment) getAssignment(DEMO_PATIENT_ID).then(setAssignment).catch(() => navigate('/'))
  }, [assignment, navigate])

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
