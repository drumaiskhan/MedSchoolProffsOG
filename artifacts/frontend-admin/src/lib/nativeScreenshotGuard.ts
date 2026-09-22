// Native (iOS/Android) screenshot blocking for the admin app. Unlike the
// student app (which only guards the book reader screen), this is enabled
// once at startup and left on for the whole app — admin surfaces exam
// answer keys and unpublished MCQs on most screens, not just one reader.
//
// Platform reality check (do not oversell this to stakeholders):
//  - Android: WindowManager.FLAG_SECURE actually blocks the OS screenshot
//    action, the built-in screen recorder, and third-party capture apps.
//  - iOS: Apple provides no API to block the system screenshot gesture.
//    This only hides content in the app-switcher thumbnail; a determined
//    user can still screenshot an iOS device.
import { Capacitor } from '@capacitor/core';

export async function enableGlobalScreenshotGuard(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { PrivacyScreen } = await import('@capacitor/privacy-screen');
    await PrivacyScreen.enable({ ios: { blurEffect: 'dark' }, android: { dimBackground: true } });
  } catch {
    // Never let a plugin failure block the app from rendering.
  }
}
