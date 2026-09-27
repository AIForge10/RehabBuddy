import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig, normalizePath, type Plugin } from 'vite'

const WEB_NATIVE = normalizePath(fileURLToPath(new URL('./src/lib/native.ts', import.meta.url)))
const APP_NATIVE = normalizePath(fileURLToPath(new URL('../mobile/src/native.ts', import.meta.url)))

/** The iOS/Android build (`--mode native`, run by ../mobile) swaps src/lib/native.ts for the Capacitor version. */
function nativeApp(): Plugin {
  return {
    name: 'native-app',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.endsWith('/native')) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved && normalizePath(resolved.id) === WEB_NATIVE ? APP_NATIVE : null
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), mode === 'native' && nativeApp()],
  // The app has its own settings (which backend, mocks or not): mobile/.env.
  envDir: mode === 'native' ? '../mobile' : undefined,
}))
