/**
 * BgRemovalSheet
 *
 * Full-screen overlay that runs on-device background removal on an existing
 * clothing item's photo and lets the user choose Original or Cleaned before saving.
 *
 * Flow:
 *   mount → "loading" (bg removal running) → "preview" (side-by-side)
 *   → user picks → user taps save → onSaved(chosenUrl) fires immediately (optimistic)
 *   → DB write happens in the caller in the background
 */
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Check, Loader2 } from "lucide-react";
import { removeBackground } from "@/lib/backgroundRemoval";
import { getImageUrl } from "@/lib/utils";

type Phase = "loading" | "preview" | "error";

const PINK = "#e8609a";

interface Props {
  /** The stored data-URL (or path) of the current item image. */
  imageObjectPath: string;
  itemName: string;
  /** Called immediately when the user confirms — before the DB write. */
  onSaved: (chosenDataUrl: string) => void;
  onClose: () => void;
}

export function BgRemovalSheet({ imageObjectPath, itemName, onSaved, onClose }: Props) {
  const [phase,      setPhase]      = useState<Phase>("loading");
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [selected,   setSelected]   = useState<"original" | "cleaned">("cleaned");
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  // Prevent stale async from writing state after unmount
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Start removal immediately on mount
  useEffect(() => {
    let objectUrl: string | null = null;
    (async () => {
      try {
        const resultUrl = await removeBackground(imageObjectPath);
        if (!alive.current) return;
        // resultUrl is a data-URL; also create an object URL for the img tag
        objectUrl = resultUrl; // keep as data-URL for storage
        setCleanedUrl(resultUrl);
        setPhase("preview");
      } catch (err) {
        if (!alive.current) return;
        console.warn("BgRemoval failed:", err);
        setErrorMsg("Could not remove background. The original photo is unchanged.");
        setPhase("error");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const originalUrl = getImageUrl(imageObjectPath) ?? imageObjectPath;

  const handleSave = () => {
    const chosen = selected === "cleaned" && cleanedUrl ? cleanedUrl : imageObjectPath;
    onSaved(chosen);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Clean Up Photo
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
      <div className="flex-1 flex flex-col overflow-y-auto">

        {/* ── Loading ── */}
        {phase === "loading" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
            <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white
                            flex items-center justify-center
                            shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl uppercase tracking-tight">Removing Background…</p>
              <p className="text-sm text-black/50 mt-1">This will take a moment.</p>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {phase === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
            <p className="font-display font-bold text-lg uppercase tracking-tight text-center">
              Something went wrong
            </p>
            <p className="text-sm text-black/60 text-center">{errorMsg}</p>
            <button
              onClick={onClose}
              className="px-6 py-3 border-4 border-black rounded-xl bg-white
                         font-display font-bold text-sm uppercase
                         shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                         active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              Close
            </button>
          </div>
        )}

        {/* ── Preview — side-by-side comparison ── */}
        {phase === "preview" && (
          <div className="flex flex-col gap-4 p-5">

            <p className="text-center font-display font-bold text-xs uppercase tracking-widest opacity-40">
              Tap to choose
            </p>

            {/* Cards */}
            <div className="flex gap-3">

              {/* Original */}
              <button
                onClick={() => setSelected("original")}
                className="flex-1 overflow-hidden rounded-2xl transition-all"
                style={{
                  border: selected === "original" ? `4px solid ${PINK}` : "4px solid rgba(0,0,0,0.15)",
                  opacity: selected === "original" ? 1 : 0.55,
                  background: "none",
                  padding: 0,
                }}
              >
                <div style={{ background: "#c8b49a", minHeight: 200, position: "relative" }}>
                  <img
                    src={originalUrl}
                    alt="Original"
                    style={{ width: "100%", objectFit: "contain", maxHeight: 200, display: "block" }}
                  />
                  {selected === "original" && (
                    <div style={{
                      position: "absolute", top: 8, right: 8,
                      width: 24, height: 24, borderRadius: "50%", background: PINK,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                    }}>
                      <Check size={14} color="white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="text-center font-display font-bold text-xs uppercase tracking-widest py-2">
                  Original
                </p>
              </button>

              {/* Cleaned */}
              <button
                onClick={() => setSelected("cleaned")}
                className="flex-1 overflow-hidden rounded-2xl transition-all"
                style={{
                  border: selected === "cleaned" ? `4px solid ${PINK}` : "4px solid rgba(0,0,0,0.15)",
                  opacity: selected === "cleaned" ? 1 : 0.55,
                  background: "none",
                  padding: 0,
                }}
              >
                {/* Checkerboard reveals transparency */}
                <div style={{
                  background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px",
                  minHeight: 200,
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {cleanedUrl && (
                    <img
                      src={cleanedUrl}
                      alt="Cleaned"
                      style={{ width: "100%", objectFit: "contain", maxHeight: 200, display: "block" }}
                    />
                  )}
                  {selected === "cleaned" && (
                    <div style={{
                      position: "absolute", top: 8, right: 8,
                      width: 24, height: 24, borderRadius: "50%", background: PINK,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                    }}>
                      <Check size={14} color="white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="text-center font-display font-bold text-xs uppercase tracking-widest py-2">
                  Cleaned ✨
                </p>
              </button>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              className="w-full flex items-center justify-center gap-2 py-4
                         border-4 border-black rounded-xl font-display font-bold text-sm uppercase
                         shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                         active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              style={{ background: PINK, color: "white" }}
            >
              <Check className="w-4 h-4" strokeWidth={3} />
              {selected === "cleaned" ? "Save Cleaned Version" : "Save Original"}
            </button>

            <button
              onClick={onClose}
              className="w-full py-3 text-sm font-bold uppercase text-black/40
                         border-2 border-black/15 rounded-xl
                         active:bg-black/5 transition-all"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
