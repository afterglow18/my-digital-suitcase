/**
 * BiometricLockContext
 *
 * Manages the app-lock state:
 *  - Reads persisted "lock enabled" flag from localStorage.
 *  - On mount (app launch), if lock is on → show LockedScreen and trigger auth.
 *  - On app resume from background, if lock is on → lock and re-trigger auth.
 *  - Exposes setLockEnabled so Settings can toggle the feature (requires auth).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { authenticate, checkBiometryAvailable, BiometryType } from "@/lib/biometric";
import { LockedScreen } from "@/components/LockedScreen";

const STORAGE_KEY = "biometric-lock-enabled";

interface BiometricLockContextType {
  isLockEnabled: boolean;
  biometryType: BiometryType;
  /** Toggle lock on/off. Requires auth. Returns true if changed successfully. */
  setLockEnabled: (enabled: boolean) => Promise<boolean>;
}

const BiometricLockContext = createContext<BiometricLockContextType>({
  isLockEnabled: false,
  biometryType: "none",
  setLockEnabled: async () => false,
});

export function useBiometricLock() {
  return useContext(BiometricLockContext);
}

function readStoredEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function BiometricLockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLockEnabled, setIsLockEnabled] = useState<boolean>(readStoredEnabled);
  const [isLocked, setIsLocked] = useState<boolean>(readStoredEnabled); // start locked if enabled
  const [isPending, setIsPending] = useState(false);
  const [biometryType, setBiometryType] = useState<BiometryType>("none");

  // Keep a ref so the appStateChange listener always sees the latest value
  const lockEnabledRef = useRef(isLockEnabled);
  lockEnabledRef.current = isLockEnabled;

  // ── Check what biometry hardware is available ──────────────────────────────
  useEffect(() => {
    checkBiometryAvailable().then(setBiometryType);
  }, []);

  // ── Trigger auth prompt ────────────────────────────────────────────────────
  const triggerAuth = useCallback(async () => {
    if (isPending) return;
    setIsPending(true);
    const ok = await authenticate("Unlock My Suitcase");
    setIsPending(false);
    if (ok) setIsLocked(false);
  }, [isPending]);

  // ── Initial lock: auto-prompt on mount if locked ───────────────────────────
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (isLocked) {
      // Slight delay so the UI renders the locked screen first before the
      // system auth dialog overlays it.
      setTimeout(() => triggerAuth(), 300);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Background → foreground: re-lock and re-prompt ────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let inBackground = false;

    const listenerPromise = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        inBackground = true;
      } else if (inBackground) {
        inBackground = false;
        if (lockEnabledRef.current) {
          setIsLocked(true);
          setIsPending(false);
          // Slight delay so locked screen renders before system dialog
          setTimeout(async () => {
            setIsPending(true);
            const ok = await authenticate("Unlock My Suitcase");
            setIsPending(false);
            if (ok) setIsLocked(false);
          }, 300);
        }
      }
    });

    return () => {
      listenerPromise.then((l) => l.remove());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings toggle ───────────────────────────────────────────────────────
  const setLockEnabled = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      const reason = enabled
        ? "Enable Face ID / Touch ID lock"
        : "Disable Face ID / Touch ID lock";
      const ok = await authenticate(reason);
      if (!ok) return false;

      setIsLockEnabled(enabled);
      lockEnabledRef.current = enabled;
      try {
        localStorage.setItem(STORAGE_KEY, String(enabled));
      } catch {}
      // If turning off, ensure we're not in a locked state
      if (!enabled) setIsLocked(false);
      return true;
    },
    [],
  );

  return (
    <BiometricLockContext.Provider
      value={{ isLockEnabled, biometryType, setLockEnabled }}
    >
      {isLocked ? (
        <LockedScreen onTryAgain={triggerAuth} isPending={isPending} />
      ) : (
        children
      )}
    </BiometricLockContext.Provider>
  );
}
