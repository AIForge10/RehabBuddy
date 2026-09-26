import type { Language } from '../types/session'

// Patient-facing copy. The therapist dashboard is English-only.
const strings = {
  en: {
    greeting: (name: string) => `Hi, ${name}`,
    today: "Today's exercise",
    target: (reps: number, angle: number) => `${reps} reps, bending to ${angle}°`,
    frequency: (n: number) => `${n}× a week`,
    setupTitle: 'Before you start',
    setup: [
      'Put the camera at knee height, side-on to you.',
      'Make sure your hip, knee and ankle are all in frame.',
      'Good light, plain background if you can.',
    ],
    start: 'Start session',
    loading: 'Loading your plan…',
    loadError: "Couldn't load your plan. Check your connection and try again.",
    retry: 'Try again',

    kneeBend: 'Knee bend',
    targetShort: (a: number) => `target ${a}°`,
    reps: 'Reps',
    finish: 'Finish session',
    saving: 'Saving…',
    saveError: "Couldn't save the session. Try again.",
    cameraStarting: 'Starting camera…',
    cameraDenied: 'Camera blocked. Allow camera access, or keep going in demo mode.',
    legHidden: 'Move so your whole leg is visible',
    demoMode: 'Demo mode',
    coachIdle: 'Bend your knee slowly, then straighten it fully.',

    painTitle: 'How does your knee feel now?',
    painNone: 'No pain',
    painWorst: 'Worst pain',
    painNotes: 'Anything else your therapist should know?',
    painPlaceholder: 'e.g. sharp pain on the inside of the knee',
    painSubmit: 'Send to my therapist',
    painSending: 'Sending…',
    painFlagged: 'Your therapist has been notified.',
    continue: 'Continue',

    doneTitle: 'Session complete',
    doneReps: 'Reps',
    doneDeepest: 'Deepest bend',
    doneTime: 'Time',
    doneForm: 'Form notes',
    doneFormClean: 'None, nice work',
    doneSent: 'Sent to your therapist.',
    backHome: 'Back to home',
  },
  es: {
    greeting: (name: string) => `Hola, ${name}`,
    today: 'Ejercicio de hoy',
    target: (reps: number, angle: number) => `${reps} repeticiones, doblando hasta ${angle}°`,
    frequency: (n: number) => `${n}× por semana`,
    setupTitle: 'Antes de empezar',
    setup: [
      'Coloca la cámara a la altura de la rodilla, de lado.',
      'Asegúrate de que se vean la cadera, la rodilla y el tobillo.',
      'Buena luz y, si puedes, un fondo liso.',
    ],
    start: 'Empezar sesión',
    loading: 'Cargando tu plan…',
    loadError: 'No se pudo cargar tu plan. Revisa tu conexión e inténtalo de nuevo.',
    retry: 'Reintentar',

    kneeBend: 'Flexión de rodilla',
    targetShort: (a: number) => `meta ${a}°`,
    reps: 'Repeticiones',
    finish: 'Terminar sesión',
    saving: 'Guardando…',
    saveError: 'No se pudo guardar la sesión. Inténtalo de nuevo.',
    cameraStarting: 'Iniciando cámara…',
    cameraDenied: 'Cámara bloqueada. Permite el acceso o sigue en modo demo.',
    legHidden: 'Colócate para que se vea toda la pierna',
    demoMode: 'Modo demo',
    coachIdle: 'Dobla la rodilla despacio y luego estírala por completo.',

    painTitle: '¿Cómo sientes la rodilla ahora?',
    painNone: 'Sin dolor',
    painWorst: 'Dolor máximo',
    painNotes: '¿Algo más que deba saber tu terapeuta?',
    painPlaceholder: 'p. ej. dolor agudo en la parte interna de la rodilla',
    painSubmit: 'Enviar a mi terapeuta',
    painSending: 'Enviando…',
    painFlagged: 'Hemos avisado a tu terapeuta.',
    continue: 'Continuar',

    doneTitle: 'Sesión terminada',
    doneReps: 'Repeticiones',
    doneDeepest: 'Flexión máxima',
    doneTime: 'Tiempo',
    doneForm: 'Notas de postura',
    doneFormClean: 'Ninguna, ¡bien hecho!',
    doneSent: 'Enviado a tu terapeuta.',
    backHome: 'Volver al inicio',
  },
} satisfies Record<Language, unknown>

export type Strings = (typeof strings)['en']

export function t(lang: Language): Strings {
  return strings[lang]
}
