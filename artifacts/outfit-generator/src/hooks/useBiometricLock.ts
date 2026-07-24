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
  type BiometryType,
} from "@/lib/biometric";

const STORAGE_KEY = "suitcase_biometric_lock";

function labelFor(type: BiometryType): string {
  if (type === "face")  return "Face ID";
  if (type === "touch") return "Touch ID";
  return "Biometrics";
}

export type { BiometryType };

export interface BiometricLock {
  isEnabled:    boolean;
  lockLabel:    string;
  /** Prompt biometric auth. Returns true on success. */
  authenticate: (reason: string) => Promise<boolean>;
  /** Authenticate → enable lock. Returns true if enabled. */
  enableLock:   () => Promise<boolean>;
  /** Authenticate → disable lock. Returns true if disabled. */
  disableLock:  () => Promise<boolean>;
}

export function useBiometricLock(): BiometricLock {
  const [isEnabled, setIsEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "1",
  );

  const auth = useCallback(
    (reason: string): Promise<boolean> => authenticate(reason),
    [],
  );

  const enableLock = useCallback(async (): Promise<boolean> => {
    const type = await checkBiometryAvailable();
    const label = labelFor(type);
    const ok = await auth(`Enable ${label} lock`);
    if (ok) {
      localStorage.setItem(STORAGE_KEY, "1");
      setIsEnabled(true);
    }
    return ok;
  }, [auth]);

  const disableLock = useCallback(async (): Promise<boolean> => {
    const type = await checkBiometryAvailable();
    const label = labelFor(type);
    const ok = await auth(`Confirm to turn off ${label} lock`);
    if (ok) {
      localStorage.setItem(STORAGE_KEY, "0");
      setIsEnabled(false);
    }
    return ok;
  }, [auth]);

  return {
    isEnabled,
    lockLabel: "Face ID / Touch ID",
    authenticate: auth,
    enableLock,
    disableLock,
  };
}
