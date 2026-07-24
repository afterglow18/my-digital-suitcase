/**
 * UpgradeSheet — three-tier paywall (Monthly / Yearly / Lifetime).
 *
 * Single-screen, no scroll. Lifetime pre-selected as "Best Value".
 * All accent colour uses bg-primary (warm tan hsl(35 55% 82%)).
 *
 * RC package identifiers expected in the default offering:
 *   $rc_monthly   → Monthly  $1.99
 *   $rc_annual    → Yearly   $19.99
 *   $rc_lifetime  → Lifetime $9.99 (one-time)
 *
 * Loads real prices from RevenueCat on mount via useRCOfferings().
 * Shows a loading spinner and retry button if offerings cannot be fetched.
 */
import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Check, Loader2, RefreshCw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useRCOfferings } from "@/hooks/useRCOfferings";
import { restorePurchases } from "@/lib/revenuecat";
import { syncTierFromRC } from "@/hooks/useEntitlements";
import type { PurchaseProduct } from "@/lib/entitlements";

const PRIVACY_URL = "https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link";
const TERMS_URL   = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

async function openUrl(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export type UpgradeReason = "items" | "outfits" | "mannequin";
type TierId = PurchaseProduct;

interface Props {
  reason:  UpgradeReason;
  onClose: () => void;
}

// ── Copy ──────────────────────────────────────────────────────────────────────

const HEADLINES: Record<UpgradeReason, string> = {
  items:     "UNLOCK YOUR UNLIMITED DIGITAL SUITCASE",
  outfits:   "UNLOCK YOUR UNLIMITED DIGITAL SUITCASE",
  mannequin: "UNLOCK YOUR UNLIMITED DIGITAL SUITCASE",
};

const SUBTITLES: Record<UpgradeReason, string> = {
  items:     "You've reached the free 20 item limit.\nUpgrade once, pack everything.",
  outfits:   "You've hit the free outfit limit. Upgrade to save every look.",
  mannequin: "A premium feature — unlock it once.",
};

interface TierMeta {
  id: TierId;
  label: string;
  period: string;
  notes: [string, string];
  best?: true;
}

const TIER_META: TierMeta[] = [
  { id: "monthly",  label: "MONTHLY",  period: "/month",   notes: ["Cancel anytime", "Billed monthly"] },
  { id: "annual",   label: "YEARLY",   period: "/year",    notes: ["Save 17%",       "Billed yearly"]  },
  { id: "lifetime", label: "LIFETIME", period: "one-time", notes: ["Pay once",       "Yours forever"],  best: true },
];

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({
  id, selected, onSelect, price, period, notes, label, best,
}: {
  id: TierId; selected: boolean; onSelect: (id: TierId) => void;
  price: string; period: string; notes: [string, string]; label: string; best?: true;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      className="flex-1 flex flex-col rounded-xl border-[3px] transition-all relative overflow-hidden text-left"
      style={{
        borderColor: selected ? "#000" : "#C9BAA5",
        background:  selected ? "hsl(35 55% 82%)" : "hsl(35 30% 93%)",
        boxShadow:   selected ? "3px 3px 0px 0px rgba(0,0,0,1)" : "none",
      }}
    >
      {best && (
        <span
          className="absolute top-0 right-0 text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-bl-lg"
          style={{ background: "#C0390B", color: "#fff" }}
        >
          BEST ★ VALUE
        </span>
      )}
      <div className="px-2.5 pt-3 pb-2.5 flex flex-col gap-1">
        <p className="text-[9px] font-bold uppercase tracking-widest text-black/50">{label}</p>
        <p className="font-display font-bold text-[1.3rem] leading-none text-black">{price}</p>
        <p className="text-[9px] font-semibold text-black/45">{period}</p>
        <ul className="flex flex-col gap-0.5 mt-1.5">
          {notes.map((n) => (
            <li key={n} className="flex items-center gap-1">
              <Check className="w-2.5 h-2.5 shrink-0 text-black/60" strokeWidth={3} />
              <span className="text-[8.5px] font-semibold text-black/55 leading-tight">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

export function UpgradeSheet({ reason, onClose }: Props) {
  const { loading, error, priceFor, retry, purchase } = useRCOfferings();
  const [selected, setSelected] = useState<TierId>("lifetime");
  const [status,   setStatus]   = useState<"idle" | "pending" | "restoring">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const prices: Record<TierId, string> = {
    monthly:  priceFor("monthly"),
    annual:   priceFor("annual"),
    lifetime: priceFor("lifetime"),
  };

  const ctaLabel =
    status === "pending"       ? "Opening…"
    : loading                  ? "Loading plans…"
    : selected === "lifetime"  ? `UNLOCK FOREVER – ${prices.lifetime} ›`
    : selected === "annual"    ? `SUBSCRIBE – ${prices.annual}/YR ›`
    :                            `SUBSCRIBE – ${prices.monthly}/MO ›`;

  const handlePurchase = useCallback(async () => {
    if (status !== "idle" || loading || !!error) return;
    setErrorMsg(null);
    setStatus("pending");

    const result = await purchase(selected);
    if (result === "success") {
      onClose();
    } else if (result === "unavailable") {
      setStatus("idle");
      setErrorMsg("Could not complete purchase. Please check your connection and try again.");
    } else {
      // cancelled — silent reset
      setStatus("idle");
    }
  }, [status, loading, error, purchase, selected, onClose]);

  const handleRestore = useCallback(async () => {
    if (status !== "idle") return;
    setErrorMsg(null);
    setStatus("restoring");
    try {
      const active = await restorePurchases();
      if (active) {
        await syncTierFromRC();
        onClose();
      } else {
        setStatus("idle");
        setErrorMsg("No purchases found for this Apple ID.");
      }
    } catch {
      setStatus("idle");
      setErrorMsg("Could not restore purchases. Please try again.");
    }
  }, [status, onClose]);

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
      <div className="flex justify-end px-4 pb-0 flex-shrink-0"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
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

      {/* Content — fills remaining height, no scroll */}
      <div className="flex-1 min-h-0 flex flex-col justify-between px-5 pt-3 pb-2">

        {/* Headline */}
        <div>
          <h1 className="font-display font-bold text-[2.1rem] uppercase tracking-tight leading-[0.88]">
            {HEADLINES[reason]}
          </h1>
          <p className="text-xs font-semibold text-black/45 mt-1.5" style={{ whiteSpace: "pre-line" }}>
            {SUBTITLES[reason]}
          </p>
        </div>

        {/* Features card */}
        <div className="rounded-2xl border-[3px] border-black overflow-hidden" style={{ background: "#111" }}>
          <div className="px-4 py-4 flex flex-col gap-2">
            <p className="font-display font-bold uppercase text-[1.45rem] leading-[0.92] tracking-tight"
               style={{ color: "hsl(35 55% 82%)" }}>
              Unlimited packed suitcases
            </p>
            <p className="font-display font-bold uppercase text-[1.45rem] leading-[0.92] tracking-tight"
               style={{ color: "hsl(35 55% 82%)" }}>
              Unlimited saved outfits
            </p>
            <p className="text-white/60 text-xs font-medium mt-1 leading-snug">
              Your entire wardrobe, beautifully packed — forever.
            </p>
          </div>
        </div>

        {/* Plan selector */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-black/35 text-center mb-1.5">
            Choose Your Plan
          </p>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-black/40">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-semibold">Loading plans…</span>
            </div>
          )}

          {/* Error state */}
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

          {/* Tier cards */}
          {!loading && !error && (
            <div className="flex gap-2">
              {TIER_META.map((t) => (
                <TierCard
                  key={t.id}
                  id={t.id}
                  selected={selected === t.id}
                  onSelect={setSelected}
                  label={t.label}
                  price={prices[t.id]}
                  period={t.period}
                  notes={t.notes}
                  best={t.best}
                />
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
        {/* Error message */}
        {errorMsg && (
          <p className="text-center text-[11px] font-semibold text-red-600 leading-snug px-1">
            {errorMsg}
          </p>
        )}

        {/* Main purchase button */}
        <button
          onClick={handlePurchase}
          disabled={status !== "idle" || loading || !!error}
          className="w-full py-3.5 rounded-2xl font-display font-bold text-lg uppercase
                     tracking-tight border-[3px] border-black text-black
                     active:translate-x-0.5 active:translate-y-0.5 transition-all
                     disabled:opacity-60 disabled:cursor-not-allowed bg-primary"
          style={{
            boxShadow: (status !== "idle" || loading || !!error) ? "none" : "4px 4px 0px 0px rgba(0,0,0,1)",
          }}
        >
          {status === "pending" ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Opening…
            </span>
          ) : ctaLabel}
        </button>

        {/* Maybe Later + Restore row */}
        <div className="flex items-center justify-between px-1">
          <button
            onClick={onClose}
            className="text-sm font-semibold text-black/35 hover:text-black/55 transition-colors"
          >
            Maybe Later
          </button>
          <button
            onClick={handleRestore}
            disabled={status !== "idle"}
            className="text-sm font-semibold text-black/35 hover:text-black/55 transition-colors disabled:opacity-40"
          >
            {status === "restoring" ? "Restoring…" : "Restore Purchases"}
          </button>
        </div>

        {/* Legal links — required by Apple */}
        <div className="flex items-center justify-center gap-3 pb-0.5">
          <button
            onClick={() => openUrl(PRIVACY_URL)}
            className="text-[10px] font-medium text-black/30 underline underline-offset-2 hover:text-black/50 transition-colors"
          >
            Privacy Policy
          </button>
          <span className="text-[10px] text-black/20">·</span>
          <button
            onClick={() => openUrl(TERMS_URL)}
            className="text-[10px] font-medium text-black/30 underline underline-offset-2 hover:text-black/50 transition-colors"
          >
            Terms of Use
          </button>
        </div>
      </div>
    </motion.div>
  );
}
