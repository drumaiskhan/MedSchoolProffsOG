// Native (iOS/Android) screenshot blocking, layered on top of the
// best-effort browser guards already in BookReader.tsx (see that file's
// header comment). This is the actual OS-level protection those guards
// couldn't be: see the platform note below before assuming both platforms
// behave the same way.
//
// Scope: called from BookReader.tsx on mount/unmount, NOT enabled globally,
// so the rest of the app (marketing pages, dashboard, etc.) is unaffected.
import { Capacitor } from '@capacitor/core';

let PrivacyScreen: typeof import('@capacitor/privacy-screen').PrivacyScreen | null = null;

// Capacitor plugins throw if imported/called outside a native runtime in
// some environments; guard the import itself, not just the calls.
async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!PrivacyScreen) {
    ({ PrivacyScreen } = await import('@capacitor/privacy-screen'));
  }
  return PrivacyScreen;
}

/**
 * Enable native screenshot/recording blocking for the current screen.
 *
 * Platform reality check (do not oversell this to stakeholders):
 *  - Android: WindowManager.FLAG_SECURE actually blocks the OS screenshot
 *    action, the built-in screen recorder, and third-party capture apps —
 *    the capture just comes back blank/black. This is a real block.
 *  - iOS: Apple provides no API to block the system screenshot gesture.
 *    This only hides content in the app-switcher thumbnail. A determined
 *    user can still screenshot an iOS device; the per-page watermark (see
 *    api-server/src/lib/bookReader.ts) is what makes that traceable, same
 *    as on the web.
 */
export async function enableScreenshotGuard(): Promise<void> {
  try {
    const plugin = await getPlugin();
    await plugin?.enable({ ios: { blurEffect: 'dark' }, android: { dimBackground: true } });
  } catch {
    // Never let a plugin failure block the reader from rendering.
  }
}

export async function disableScreenshotGuard(): Promise<void> {
  try {
    const plugin = await getPlugin();
    await plugin?.disable();
  } catch {
    // Best effort.
  }
}
