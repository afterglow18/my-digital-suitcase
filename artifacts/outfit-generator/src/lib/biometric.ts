/**
 * Thin wrapper around @aparajita/capacitor-biometric-auth.
 * All calls are no-ops (success) on non-native platforms.
 */
import { Capacitor } from "@capacitor/core";

export type BiometryType = "face" | "touch" | "none";

/** Granular result so callers can show the right message. */
export type AuthResult =
  | "success"
  | "cancelled"       // user tapped Cancel
  | "denied"          // Face ID permission denied in iOS Settings
  | "unavailable";    // not enrolled, locked out, or other failure

/** Returns what kind of biometry is available, or "none". */
export async function checkBiometryAvailable(): Promise<BiometryType> {
  if (!Capacitor.isNativePlatform()) return "none";
  try {
    const { BiometricAuth, BiometryType: BT } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    const result = await BiometricAuth.checkBiometry();
    if (!result.isAvailable) return "none";
    if (result.biometryType === BT.faceId) return "face";
    return "touch";
  } catch {
    return "none";
  }
}

/**
 * Prompts biometric auth.
 * Returns a granular AuthResult so callers can show the right message.
 */
export async function authenticate(reason: string): Promise<AuthResult> {
  if (!Capacitor.isNativePlatform()) return "success";
  try {
    const { BiometricAuth } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      allowDeviceCredential: false,
    });
    return "success";
  } catch (err: unknown) {
    const code = String((err as { code?: string })?.code ?? "");
    console.warn("[Biometric] authenticate failed:", code, err);

    if (
      code === "userCancel" ||
      code === "appCancel" ||
      code === "systemCancel"
    ) return "cancelled";

    // biometryNotAvailable means iOS hasn't granted the app Face ID permission
    // (or the user denied it). They need to enable it in iOS Settings.
    if (code === "biometryNotAvailable") return "denied";

    return "unavailable";
  }
}
