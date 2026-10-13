import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the built web app (dist/) in a native iOS/Android shell.
//   npm i @capacitor/ios @capacitor/android && npx cap add ios && npx cap add android
//   VITE_API_URL=https://your-app.vercel.app npm run cap:sync
const config: CapacitorConfig = {
  appId: 'app.khondo.agent',
  appName: 'Khondo',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};

export default config;
