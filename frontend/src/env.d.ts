/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_USE_MOCKS?: string
  readonly VITE_DEMO_PATIENT_ID?: string
  readonly VITE_DEMO_THERAPIST_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
