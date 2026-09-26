import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LanguageProvider } from './lib/language'
import ExerciseSession from './screens/ExerciseSession'
import Home from './screens/Home'
import PainCheck from './screens/PainCheck'
import SessionDone from './screens/SessionDone'
import TherapistDashboard from './screens/TherapistDashboard'

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
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
