/**
 * Thin wrapper around @aparajita/capacitor-biometric-auth.
 * All calls are no-ops (success) on non-native platforms.
 */
import { Capacitor } from "@capacitor/core";

export type BiometryType = "face" | "touch" | "none";

/** Returns what kind of biometry is available, or "none". */
export async function checkBiometryAvailable(): Promise<BiometryType> {
  if (!Capacitor.isNativePlatform()) return "none";
  try {
    const { BiometricAuth, BiometryType: BT } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    const result = await BiometricAuth.checkBiometry();
    if (!result.isAvailable) return "none";
    // BiometryType enum: 1 = TouchID, 2 = FaceID, 3 = Iris …
    if (result.biometryType === BT.faceId) return "face";
    return "touch";
  } catch {
    return "none";
  }
}

/**
 * Prompts biometric auth.
 * Returns true on success, false on failure or cancellation.
 */
export async function authenticate(reason: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true; // always pass in browser
  try {
    const { BiometricAuth } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      allowDeviceCredential: false,
    });
    return true;
  } catch {
    return false;
  }
}
