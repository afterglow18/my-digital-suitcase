/**
 * BiometricLockScreen
 *
 * Full-screen overlay shown while the app is locked.
 * Renders over all content until authentication succeeds.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  lockLabel: string; // "Face ID" | "Touch ID" | "Biometrics"
  onAuthenticate: () => Promise<boolean>;
}

export function BiometricLockScreen({ lockLabel, onAuthenticate }: Props) {
  const [loading, setLoading] = useState(false);
  const [failed,  setFailed]  = useState(false);

  const handleTryAgain = async () => {
    setLoading(true);
    setFailed(false);
    const ok = await onAuthenticate();
    setLoading(false);
    if (!ok) setFailed(true);
  };

  const lockIcon =
    lockLabel === "Face ID"
      ? "🔒"
      : lockLabel === "Touch ID" || lockLabel === "Fingerprint"
      ? "👆"
      : "🔒";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#F5F0E8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "40px 32px",
        paddingTop: "max(40px, env(safe-area-inset-top))",
        paddingBottom: "max(40px, env(safe-area-inset-bottom))",
      }}
    >
      {/* App icon / lock symbol */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: "#E8D4B0",
          border: "2px solid black",
          boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
        }}
      >
        {lockIcon}
      </div>

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            color: "#1a0800",
            marginBottom: 6,
          }}
        >
          My Digital Suitcase
        </p>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            color: "rgba(0,0,0,0.5)",
            lineHeight: 1.4,
          }}
        >
          {failed
            ? `${lockLabel} not recognised. Try again.`
            : `Locked with ${lockLabel}`}
        </p>
      </div>

      {/* Try Again / Unlock button */}
      <button
        onClick={handleTryAgain}
        disabled={loading}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingTop: 14,
          paddingBottom: 14,
          paddingLeft: 32,
          paddingRight: 32,
          border: "2px solid black",
          borderRadius: 999,
          background: "#E8D4B0",
          boxShadow: loading ? "none" : "3px 3px 0px 0px rgba(0,0,0,1)",
          fontFamily: "var(--font-sans)",
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: "0.04em",
          textTransform: "uppercase" as const,
          color: "#1a0800",
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.7 : 1,
          transform: loading ? "translate(3px,3px)" : "none",
          transition: "all 0.1s",
          minWidth: 160,
        }}
      >
        {loading ? (
          <Loader2
            style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }}
          />
        ) : (
          <>🔐 {failed ? "Try Again" : `Unlock with ${lockLabel}`}</>
        )}
      </button>
    </div>
  );
}
