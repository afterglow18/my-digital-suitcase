/**
 * UpgradeSheet
 *
 * Full-screen "Unlock Forever" paywall, shown when the user hits the free
 * item limit or the free outfit limit.
 *
 * When a payment provider is wired into useEntitlements, the "Unlock Now"
 * button triggers the real checkout flow.  Until then it shows a polite
 * "coming soon" note.
 */
import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Check, Lock } from "lucide-react";
import { useEntitlements, PurchaseResult } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT, FREE_OUTFIT_LIMIT } from "@/lib/entitlements";

export type UpgradeReason = "items" | "outfits";

interface Props {
  reason: UpgradeReason;
  onClose: () => void;
}

const UNLOCK_FEATURES = [
  { included: true,  text: "Unlimited clothing items" },
  { included: true,  text: "Unlimited saved outfits" },
  { included: true,  text: "All core wardrobe features" },
  { included: true,  text: "Future updates and improvements to the core app" },
  { included: false, text: "Does not include the 3D mannequin feature" },
] as const;

export function UpgradeSheet({ reason, onClose }: Props) {
  const { purchase } = useEntitlements();
  const [status, setStatus] = useState<"idle" | "pending" | "unavailable">("idle");

  const handlePurchase = useCallback(async () => {
    setStatus("pending");
    const result: PurchaseResult = await purchase("unlock");
    if (result === "success") {
      onClose();
    } else if (result === "unavailable") {
      setStatus("unavailable");
    } else {
      setStatus("idle"); // cancelled — let user try again
    }
  }, [purchase, onClose]);

  const limitLabel =
    reason === "items"
      ? `You've added ${FREE_ITEM_LIMIT} items — that's the free limit.`
      : `You've saved ${FREE_OUTFIT_LIMIT} outfits — that's the free limit.`;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b-2 border-black flex-shrink-0">
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Upgrade
        </h2>
        <button
          onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto flex flex-col p-5 gap-5">

        {/* Limit hit notice */}
        <div className="border-2 border-black rounded-2xl bg-white p-4
                        shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 border-2 border-black rounded-xl bg-primary flex-shrink-0
                            flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-black/70 leading-snug pt-1">
              {limitLabel}
              {" "}Unlock forever to keep growing your virtual closet.
            </p>
          </div>
        </div>

        {/* Unlock Forever card */}
        <div className="border-4 border-black rounded-2xl bg-primary
                        shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          {/* Price hero */}
          <div className="px-5 pt-5 pb-4">
            <p className="font-display font-bold text-3xl uppercase tracking-tight leading-none">
              🔓 Unlock Forever
            </p>
            <p className="font-display font-bold text-5xl mt-1 leading-none">$4.99</p>
            <p className="text-sm font-bold text-black/60 mt-1">
              One-time purchase. No subscription.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t-2 border-black/20" />

          {/* Description */}
          <div className="px-5 py-4">
            <p className="text-sm font-medium text-black/70 leading-snug">
              Unlock unlimited clothing items and unlimited saved outfits forever.
            </p>
          </div>
        </div>

        {/* Feature list */}
        <div className="border-2 border-black rounded-2xl bg-white p-4
                        shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <p className="font-display font-bold text-sm uppercase tracking-tight mb-3">
            What's included
          </p>
          <ul className="flex flex-col gap-2.5">
            {UNLOCK_FEATURES.map(({ included, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-sm leading-snug">
                <span
                  className={`mt-0.5 w-4 h-4 border-2 border-black rounded-sm flex-shrink-0
                               flex items-center justify-center text-xs font-bold
                               ${included ? "bg-primary" : "bg-white text-black/40"}`}
                >
                  {included ? (
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                  ) : (
                    "✕"
                  )}
                </span>
                <span className={included ? "text-black/80" : "text-black/40"}>
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

      </div>

      {/* CTA footer */}
      <div className="px-5 pb-6 pt-4 bg-white border-t-2 border-black flex flex-col gap-3 flex-shrink-0">
        <button
          onClick={handlePurchase}
          disabled={status === "pending"}
          className="w-full py-4 rounded-xl flex items-center justify-center gap-2
                     font-display font-bold text-lg uppercase tracking-tight border-4 border-black
                     bg-primary shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                     active:translate-x-1 active:translate-y-1 active:shadow-none
                     disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {status === "pending" ? "Opening checkout…" : "Unlock Now – $4.99"}
        </button>

        {status === "unavailable" && (
          <p className="text-xs text-center text-amber-700 bg-amber-50 border border-amber-200
                        rounded-lg px-3 py-2">
            Payments are not yet set up. Check back soon!
          </p>
        )}

        <button
          onClick={onClose}
          className="text-sm font-bold text-black/40 text-center underline underline-offset-2
                     hover:text-black/60 transition-colors"
        >
          Maybe Later
        </button>
      </div>
    </motion.div>
  );
}
