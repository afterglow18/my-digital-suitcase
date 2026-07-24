/**
 * PremiumSheet — mannequin-page paywall, no scrolling.
 *
 * Loads real prices from RevenueCat on mount. Shows a loading spinner
 * and a retry button if offerings cannot be fetched, so App Review
 * reviewers never see a dead "Purchases unavailable" dead-end.
 */
import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Loader2, RefreshCw } from "lucide-react";
import { useRCOfferings } from "@/hooks/useRCOfferings";
import { restorePurchases } from "@/lib/revenuecat";
import { syncTierFromRC } from "@/hooks/useEntitlements";
import type { PurchaseProduct } from "@/lib/entitlements";
import type { PurchaseResult } from "@/hooks/useEntitlements";
import { Capacitor } from "@capacitor/core";

const TERMS_URL   = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL = "https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link";

async function openUrl(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

interface Props { onClose: () => void; }

const FEATURES = [
  "Unlimited clothing items",
  "Unlimited outfits",
  "Save your entire wardrobe",
  "360° Mannequin outfit view",
  "Choose monthly, yearly or lifetime!",
] as const;

type Plan = PurchaseProduct;
interface PlanMeta {
  id: Plan; label: string; period: string;
  bullets: { text: string; accent?: boolean }[];
  bestValue?: boolean;
}

const PLAN_META: PlanMeta[] = [
  {
    id: "monthly", label: "MONTHLY", period: "/month",
    bullets: [{ text: "Cancel anytime" }, { text: "Billed monthly" }],
  },
  {
    id: "annual", label: "YEARLY", period: "/year",
    bullets: [{ text: "Save 17%", accent: true }, { text: "Billed yearly" }],
  },
  {
    id: "lifetime", label: "LIFETIME", period: "one-time",
    bullets: [{ text: "Pay once" }, { text: "Yours forever" }],
    bestValue: true,
  },
];

export function PremiumSheet({ onClose }: Props) {
  const { loading, error, priceFor, retry, purchase } = useRCOfferings();
  const [status,        setStatus]        = useState<"idle" | "pending">("idle");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [plan,          setPlan]          = useState<Plan>("lifetime");
  const [restoreStatus, setRestoreStatus] = useState<"idle" | "pending" | "done" | "none">("idle");

  const activePrice = priceFor(plan);
  const activeCta =
    plan === "monthly"  ? `START MONTHLY – ${activePrice}` :
    plan === "annual"   ? `START YEARLY – ${activePrice}`  :
                          `UNLOCK FOREVER – ${activePrice}`;

  const handleRestore = useCallback(async () => {
    if (restoreStatus === "pending") return;
    setRestoreStatus("pending");
    const tier = await restorePurchases();
    if (tier) {
      await syncTierFromRC();
      setRestoreStatus("done");
      setTimeout(onClose, 800);
    } else {
      setRestoreStatus("none");
    }
  }, [restoreStatus, onClose]);

  const handlePurchase = useCallback(async () => {
    if (status === "pending" || loading || !!error) return;
    setStatus("pending");
    setPurchaseError(null);
    const result: PurchaseResult = await purchase(plan);
    if (result === "success") {
      onClose();
    } else if (result === "unavailable") {
      setStatus("idle");
      setPurchaseError("Could not complete purchase. Please check your internet connection and try again.");
    } else {
      // cancelled — silent
      setStatus("idle");
    }
  }, [status, loading, error, purchase, plan, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto"
      style={{ background: "#F8F4ED" }}
    >
      {/* Close button */}
      <div
        className="flex justify-end px-4 pb-0 flex-shrink-0"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full border-2 border-black flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col px-5 pt-3 pb-2 gap-4">

        {/* Headline */}
        <div>
          <h1 className="font-display font-bold text-[2rem] uppercase tracking-tight leading-[0.9]">
            UNLOCK YOUR FULL SUITCASE
          </h1>
          <p className="text-xs font-semibold text-black/45 mt-1.5">
            Upgrade to access the 360° Mannequin and unlimited packing.
          </p>
        </div>

        {/* Dark features card */}
        <div className="rounded-2xl border-[3px] border-black overflow-hidden" style={{ background: "#111" }}>
          <div className="px-4 py-4 flex flex-col gap-2">
            <p
              className="font-display font-bold uppercase text-[1.35rem] leading-[0.92] tracking-tight"
              style={{ color: "hsl(35 55% 82%)" }}
            >
              360° Mannequin View
            </p>
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span
                  className="flex-shrink-0 flex items-center justify-center rounded-full"
                  style={{ width: 18, height: 18, background: "hsl(35 55% 82%)" }}
                >
                  <svg width="9" height="7" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4.5L4 7.5L10 1" stroke="#0a0a0a" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-[11px] font-semibold text-white/75 leading-tight">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plan picker */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-black/35 text-center mb-1.5">
            Choose Your Plan
          </p>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-black/40">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-semibold">Loading plans…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-2 py-3">
              <p className="text-xs font-semibold text-red-600 text-center leading-snug px-2">
                Could not load plans. Check your connection.
              </p>
              <button
                onClick={retry}
                className="flex items-center gap-1.5 text-xs font-bold text-black/60
                           border border-black/20 rounded-lg px-3 py-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                Try Again
              </button>
            </div>
          )}

          {!loading && !error && (
            <div className="flex gap-2">
              {PLAN_META.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlan(p.id)}
                  className="flex-1 flex flex-col rounded-xl border-[3px] transition-all relative overflow-hidden text-left"
                  style={{
                    borderColor: plan === p.id ? "#000" : "#C9BAA5",
                    background:  plan === p.id ? "hsl(35 55% 82%)" : "hsl(35 30% 93%)",
                    boxShadow:   plan === p.id ? "3px 3px 0px 0px rgba(0,0,0,1)" : "none",
                  }}
                >
                  {p.bestValue && (
                    <span
                      className="absolute top-0 right-0 text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-bl-lg"
                      style={{ background: "#C0390B", color: "#fff" }}
                    >
                      BEST ★
                    </span>
                  )}
                  <div className="px-2.5 pt-3 pb-2.5 flex flex-col gap-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-black/50">{p.label}</p>
                    <p className="font-display font-bold text-[1.2rem] leading-none text-black">
                      {priceFor(p.id)}
                    </p>
                    <p className="text-[9px] font-semibold text-black/45">{p.period}</p>
                    <ul className="flex flex-col gap-0.5 mt-1">
                      {p.bullets.map((b) => (
                        <li key={b.text} className="text-[8px] font-semibold leading-tight"
                            style={{ color: b.accent ? "#C0390B" : "rgba(0,0,0,0.45)" }}>
                          {b.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* CTA footer */}
      <div
        className="px-5 pt-2 flex flex-col gap-2 flex-shrink-0"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={handlePurchase}
          disabled={status === "pending" || loading || !!error}
          className="w-full py-3.5 rounded-2xl font-display font-bold text-lg uppercase
                     tracking-tight border-[3px] border-black text-black
                     active:translate-x-0.5 active:translate-y-0.5 transition-all
                     disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "hsl(35 55% 82%)",
            boxShadow: (status === "pending" || loading || !!error)
              ? "none"
              : "4px 4px 0px rgba(0,0,0,1)",
            letterSpacing: "0.03em",
          }}
        >
          {status === "pending" ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Opening checkout…
            </span>
          ) : loading ? (
            "Loading plans…"
          ) : error ? (
            "Plans unavailable"
          ) : (
            <>{activeCta} <span className="text-lg leading-none">›</span></>
          )}
        </button>

        {purchaseError && (
          <p className="text-xs text-red-600 text-center font-medium px-2">{purchaseError}</p>
        )}

        <button
          onClick={onClose}
          className="text-xs font-bold text-black/35 text-center underline underline-offset-2
                     hover:text-black/55 transition-colors py-0.5"
        >
          Maybe Later
        </button>

        <button
          onClick={handleRestore}
          disabled={restoreStatus === "pending"}
          className="text-xs font-bold text-black/35 text-center underline underline-offset-2
                     hover:text-black/55 transition-colors py-0.5 disabled:opacity-50"
        >
          {restoreStatus === "pending" ? "Restoring…"          :
           restoreStatus === "done"    ? "✓ Purchases Restored" :
           restoreStatus === "none"    ? "No purchases found"   :
           "Restore Purchases"}
        </button>

        {/* Legal links — required by Apple */}
        <p className="text-center leading-relaxed" style={{ fontSize: 9, color: "rgba(0,0,0,0.28)" }}>
          <button
            onClick={() => openUrl(TERMS_URL)}
            className="underline underline-offset-1 active:opacity-60"
          >
            Terms of Use
          </button>
          {" · "}
          <button
            onClick={() => openUrl(PRIVACY_URL)}
            className="underline underline-offset-1 active:opacity-60"
          >
            Privacy Policy
          </button>
        </p>
      </div>
    </motion.div>
  );
}
