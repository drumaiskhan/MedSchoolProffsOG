import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the existing Vite build (artifacts/frontend-admin) in a native
// iOS/Android shell. See artifacts/frontend-student/capacitor.config.ts for
// the full explanation of these settings — this file mirrors it.
const config: CapacitorConfig = {
  appId: 'com.medschoolproffs.admin',
  appName: 'MedschoolProffs Admin',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
  },
  // @capacitor/privacy-screen (Capacitor 7+, JS-call-only). Enabled
  // globally from src/main.tsx rather than per-screen, since admin sees
  // exam answer keys and unpublished MCQs throughout — unlike the student
  // app, which only guards the book reader.
};

export default config;
