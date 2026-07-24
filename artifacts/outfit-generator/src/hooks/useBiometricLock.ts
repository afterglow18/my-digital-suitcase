/**
 * useBiometricLock
 *
 * Manages the biometric app-lock setting.
 *   - Reads/writes localStorage key `suitcase_biometric_lock`
 *   - Wraps the biometric.ts auth helper for Face ID / Touch ID prompts
 *   - enableLock / disableLock each require a successful auth first
 *
 * Biometry availability is checked lazily (on first enable/disable tap) rather
 * than on mount, so it never fires a native bridge call during page load.
 */
import { useState, useCallback } from "react";
import {
  authenticate,
  checkBiometryAvailable,
  type AuthResult,
  type BiometryType,
} from "@/lib/biometric";

const STORAGE_KEY = "suitcase_biometric_lock";

function labelFor(type: BiometryType): string {
  if (type === "face")  return "Face ID";
  if (type === "touch") return "Touch ID";
  return "Biometrics";
}

export type { BiometryType, AuthResult };

export type LockToggleResult = "success" | "cancelled" | "denied" | "unavailable";

export interface BiometricLock {
  isEnabled:    boolean;
  lockLabel:    string;
  /** Prompt biometric auth. Returns granular result. */
  authenticate: (reason: string) => Promise<AuthResult>;
  /** Authenticate → enable lock. */
  enableLock:   () => Promise<LockToggleResult>;
  /** Authenticate → disable lock. */
  disableLock:  () => Promise<LockToggleResult>;
}

export function useBiometricLock(): BiometricLock {
  const [isEnabled, setIsEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "1",
  );

  const auth = useCallback(
    (reason: string): Promise<AuthResult> => authenticate(reason),
    [],
  );

  const enableLock = useCallback(async (): Promise<LockToggleResult> => {
    const type = await checkBiometryAvailable();
    if (type === "none") return "unavailable";
    const label = labelFor(type);
    const result = await auth(`Enable ${label} lock`);
    if (result === "success") {
      localStorage.setItem(STORAGE_KEY, "1");
      setIsEnabled(true);
    }
    return result;
  }, [auth]);

  const disableLock = useCallback(async (): Promise<LockToggleResult> => {
    const type = await checkBiometryAvailable();
    if (type === "none") return "unavailable";
    const label = labelFor(type);
    const result = await auth(`Confirm to turn off ${label} lock`);
    if (result === "success") {
      localStorage.setItem(STORAGE_KEY, "0");
      setIsEnabled(false);
    }
    return result;
  }, [auth]);

  return {
    isEnabled,
    lockLabel: "Face ID / Touch ID",
    authenticate: auth,
    enableLock,
    disableLock,
  };
}
