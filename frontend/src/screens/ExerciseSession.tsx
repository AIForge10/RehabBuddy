import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DEMO_PATIENT_ID, getAssignment } from '../api/client'
import { useCamera } from '../lib/useCamera'
import type { Assignment } from '../types/session'
import { Brief } from './session/Brief'
import { Live } from './session/Live'
import { Setup } from './session/Setup'

type Step = 'brief' | 'setup' | 'live'

/** Pre-session briefing → camera setup → live session. One camera stream spans setup and live. */
export default function ExerciseSession() {
  const navigate = useNavigate()
  const location = useLocation()
  const [assignment, setAssignment] = useState<Assignment | null>(
    (location.state as { assignment?: Assignment } | null)?.assignment ?? null,
  )
  const [step, setStep] = useState<Step>('brief')
  const { attach, status } = useCamera(step !== 'brief')

  useEffect(() => {
    if (!assignment) getAssignment(DEMO_PATIENT_ID).then(setAssignment).catch(() => navigate('/'))
  }, [assignment, navigate])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  if (!assignment) return null
  if (step === 'brief') return <Brief assignment={assignment} onNext={() => setStep('setup')} />
  if (step === 'setup') return <Setup camera={status} attach={attach} onStart={() => setStep('live')} onBack={() => setStep('brief')} />
  return <Live assignment={assignment} camera={status} attach={attach} />
}
