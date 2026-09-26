import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, PublicOnly, RequireAuth } from './lib/auth'
import { LanguageProvider } from './lib/language'
import Login from './screens/auth/Login'
import Signup from './screens/auth/Signup'
import ExerciseSession from './screens/ExerciseSession'
import Home from './screens/Home'
import PainCheck from './screens/PainCheck'
import SessionDone from './screens/SessionDone'
import TherapistDashboard from './screens/TherapistDashboard'
import Welcome from './screens/Welcome'

// Developer tool, not linked from the app; loaded only when visited.
const PoseDebug = lazy(() => import('./pose/debug/PoseDebug'))

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
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            {/* Signed out: the splash, log in and sign up. */}
            <Route path="/welcome" element={<PublicOnly><Welcome /></PublicOnly>} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />

            {/* Signed in: each role only sees its own side. */}
            <Route path="/" element={<RequireAuth role="patient"><Home /></RequireAuth>} />
            <Route path="/session" element={<RequireAuth role="patient"><ExerciseSession /></RequireAuth>} />
            <Route path="/pain-check" element={<RequireAuth role="patient"><PainCheck /></RequireAuth>} />
            <Route path="/done" element={<RequireAuth role="patient"><SessionDone /></RequireAuth>} />
            <Route path="/therapist" element={<RequireAuth role="therapist"><TherapistDashboard /></RequireAuth>} />

            <Route path="/pose-debug" element={<Suspense fallback={null}><PoseDebug /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  )
}
