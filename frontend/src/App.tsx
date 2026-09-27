import { lazy, Suspense, useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, PublicOnly, RequireAuth } from './lib/auth'
import { LanguageProvider, useLanguage } from './lib/language'
import { exitNativeApp, onNativeBackButton } from './lib/native'
import { usePageTitle } from './lib/usePageTitle'
import Login from './screens/auth/Login'
import Signup from './screens/auth/Signup'
import Welcome from './screens/Welcome'

// The signed-in screens carry the charts (recharts) and the pose runtime
// (MediaPipe), two thirds of the app's code. The landing page and the auth
// screens don't need them, so they load on their own, and are fetched as soon
// as the first screen is idle, so a tap on "Try the demo" doesn't wait on them.
const screens = {
  home: () => import('./screens/Home'),
  session: () => import('./screens/ExerciseSession'),
  painCheck: () => import('./screens/PainCheck'),
  done: () => import('./screens/SessionDone'),
  therapist: () => import('./screens/TherapistDashboard'),
}
const Home = lazy(screens.home)
const ExerciseSession = lazy(screens.session)
const PainCheck = lazy(screens.painCheck)
const SessionDone = lazy(screens.done)
const TherapistDashboard = lazy(screens.therapist)

function usePrefetchScreens() {
  useEffect(() => {
    const load = () => Object.values(screens).forEach((s) => void s().catch(() => {}))
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(load, { timeout: 2000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(load, 1000)
    return () => clearTimeout(id)
  }, [])
}

// Developer tool, not linked from the app; loaded only when visited.
const PoseDebug = lazy(() => import('./pose/debug/PoseDebug'))

// BrowserRouter keeps the old scroll position; each screen should start at its top.
// Braces matter: newer browsers return a Promise from scrollTo, and an effect
// must not return one.
function ScrollToTop() {
  const { pathname } = useLocation()
  usePageTitle(pathname, useLanguage().lang)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function isRootRoute(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '') || '/'
  return clean === '/' || clean === '/welcome' || clean === '/therapist'
}

function NativeNavigationHandler() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathnameRef = useRef(pathname)
  const navigateRef = useRef(navigate)

  useEffect(() => {
    pathnameRef.current = pathname
    navigateRef.current = navigate
  }, [pathname, navigate])

  useEffect(() => {
    const unregister = onNativeBackButton((event) => {
      const current = pathnameRef.current
      const isRoot = isRootRoute(current)
      console.log('[native-back] Event received:', { current, isRoot, canGoBack: event.canGoBack })
      if (isRoot) {
        void exitNativeApp()
      } else {
        navigateRef.current(-1)
      }
    })

    return unregister
  }, [])

  return null
}

export default function App() {
  usePrefetchScreens()
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <NativeNavigationHandler />
          <Suspense fallback={null}>
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

              <Route path="/pose-debug" element={<PoseDebug />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  )
}
