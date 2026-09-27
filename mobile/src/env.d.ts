// Vite fills these in when the frontend builds the app (scripts/build-web.mjs reads
// mobile/.env). Declared here because this package doesn't load Vite's own types.
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_IOS_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
