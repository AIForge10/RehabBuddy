import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'us.bendwith.app',
  appName: 'bendwith.us',
  // The frontend, built for the app by scripts/build-web.mjs.
  webDir: 'www',
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchFadeOutDuration: 200,
      backgroundColor: '#f3f7f7',
    },
  },
}

export default config
