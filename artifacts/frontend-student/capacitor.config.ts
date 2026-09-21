import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the existing Vite build (artifacts/frontend-student) in a native
// iOS/Android shell. This does NOT change how the app is built for the web —
// `vite build` still produces dist/public exactly as before, and that same
// build is deployed to Netlify as usual. Capacitor just also copies that
// build into ios/App/App/public and android/app/src/main/assets/public.
//
// appId: reverse-DNS bundle identifier. This is registered with Apple/Google
// on first submission and is expensive to change later — confirm it before
// running `npx cap add ios` / `npx cap add android` for real. Placeholder
// below; swap to whatever you actually want to publish under.
const config: CapacitorConfig = {
  appId: 'com.medschoolproffs.student',
  appName: 'MedschoolProffs',
  webDir: 'dist/public',
  server: {
    // Default Capacitor behavior serves the app from capacitor://localhost
    // on iOS and http://localhost on Android. Forcing https here makes the
    // WebView's own origin a normal secure context, which matters because
    // the API's session cookie is SameSite=None; Secure (see
    // artifacts/api-server/src/lib/auth.ts) — Secure cookies are dropped
    // outright by an insecure origin. This does NOT fully guarantee the
    // cookie survives iOS's cross-site tracking prevention inside a
    // WKWebView; see MOBILE.md's "cookie auth on iOS" section before
    // shipping — the fallback is the bearer-token path already stubbed out
    // in lib/api-client-react/src/custom-fetch.ts (setAuthTokenGetter).
    androidScheme: 'https',
  },
  // @capacitor/privacy-screen (Capacitor 7+, JS-call-only — there's no
  // config-file toggle for it, unlike the deprecated community plugin it
  // replaced). It's turned on/off from code in nativeScreenshotGuard.ts,
  // scoped to the book reader screen only.
};

export default config;
