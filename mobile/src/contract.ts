// Compile-time check, never bundled: the app's native.ts must export everything
// the web's does, with compatible types, since the native build swaps one for
// the other. `npm run typecheck` fails here if they drift apart.
import type * as Web from '../../frontend/src/lib/native'
import type * as App from './native'

export type Contract = typeof App extends typeof Web ? true : never
export const contract: Contract = true
