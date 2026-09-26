import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LanguageProvider } from './lib/language'
import ExerciseSession from './screens/ExerciseSession'
import Home from './screens/Home'
import PainCheck from './screens/PainCheck'
import SessionDone from './screens/SessionDone'
import TherapistDashboard from './screens/TherapistDashboard'

// BrowserRouter keeps the old scroll position; each screen should start at its top.
// Braces matter: newer browsers return a Promise from scrollTo, and an effect
// must not return one.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/session" element={<ExerciseSession />} />
          <Route path="/pain-check" element={<PainCheck />} />
          <Route path="/done" element={<SessionDone />} />
          <Route path="/therapist" element={<TherapistDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}
