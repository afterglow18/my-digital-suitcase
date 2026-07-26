/**
 * BgRemovalSheet
 *
 * Full-screen overlay that runs on-device background removal on an existing
 * clothing item's photo and lets the user choose Original or Cleaned before saving.
 *
 * Flow:
 *   mount → side-by-side shown immediately; Original selectable right away;
 *            Cleaned card shows spinner until processing finishes (or error).
 *   → user picks → user taps save → onSaved(chosenUrl) fires immediately (optimistic)
 *   → DB write happens in the caller in the background
 */
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Check, Loader2 } from "lucide-react";
import { removeBackground } from "@/lib/backgroundRemoval";
import { getImageUrl } from "@/lib/utils";

const PINK = "#e8609a";

interface Props {
  /** The stored data-URL (or path) of the current item image. */
  imageObjectPath: string;
  itemName: string;
  /**
   * Called immediately when the user confirms — before the DB write.
   * `wasCleaned` is true when the user kept the cleaned version, false for original.
   */
  onSaved: (chosenDataUrl: string, wasCleaned: boolean) => void;
  onClose: () => void;
}

export function BgRemovalSheet({ imageObjectPath, itemName, onSaved, onClose }: Props) {
  // "cleaning" while the model runs, "done" when it finishes, "error" on failure
  const [cleanState, setCleanState] = useState<"cleaning" | "done" | "error">("cleaning");
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  // Default to "original" so Save is available immediately; auto-switch to
  // "cleaned" once the result arrives (only if they haven't manually picked yet).
  const [selected,    setSelected]    = useState<"original" | "cleaned">("original");
  const userPicked = useRef(false); // true once the user has tapped a card

  // Prevent stale async from writing state after unmount
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // Start removal immediately on mount
  useEffect(() => {
    (async () => {
      try {
        const resultUrl = await removeBackground(imageObjectPath);
        if (!alive.current) return;
        setCleanedUrl(resultUrl);
        setCleanState("done");
        // Only auto-select cleaned if the user hasn't explicitly tapped a card
        if (!userPicked.current) setSelected("cleaned");
      } catch (err) {
        if (!alive.current) return;
        console.warn("BgRemoval failed:", err);
        setErrorMsg("Couldn't remove the background.");
        setCleanState("error");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const originalUrl = getImageUrl(imageObjectPath) ?? imageObjectPath;

  const pick = (which: "original" | "cleaned") => {
    userPicked.current = true;
    setSelected(which);
  };

  const handleSave = () => {
    const wasCleaned = selected === "cleaned" && !!cleanedUrl;
    const chosen     = wasCleaned ? cleanedUrl! : imageObjectPath;
    onSaved(chosen, wasCleaned);
    onClose();
  };

  // Save is disabled only when the user wants the cleaned version but it isn't ready yet
  const saveDisabled = selected === "cleaned" && cleanState !== "done";

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
        <div className="flex flex-col gap-4 p-5">

          <p className="text-center font-display font-bold text-xs uppercase tracking-widest opacity-40">
            {cleanState === "cleaning" ? "Cleaning in progress — tap Original to save now" : "Tap to choose"}
          </p>

          {/* Cards */}
          <div className="flex gap-3">

            {/* Original */}
            <button
              onClick={() => pick("original")}
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
              onClick={() => cleanState !== "error" && pick("cleaned")}
              className="flex-1 overflow-hidden rounded-2xl transition-all"
              style={{
                border: selected === "cleaned" ? `4px solid ${PINK}` : "4px solid rgba(0,0,0,0.15)",
                opacity: selected === "cleaned" ? 1 : (cleanState === "error" ? 0.35 : 0.55),
                background: "none",
                padding: 0,
                cursor: cleanState === "error" ? "default" : "pointer",
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
                {/* Spinner while cleaning */}
                {cleanState === "cleaning" && (
                  <Loader2
                    className="animate-spin text-black/30"
                    size={36}
                    strokeWidth={1.5}
                  />
                )}

                {/* Result image */}
                {cleanState === "done" && cleanedUrl && (
                  <img
                    src={cleanedUrl}
                    alt="Cleaned"
                    style={{ width: "100%", objectFit: "contain", maxHeight: 200, display: "block" }}
                  />
                )}

                {/* Error state */}
                {cleanState === "error" && (
                  <p className="text-xs text-black/40 font-bold uppercase text-center px-2">
                    {errorMsg ?? "Failed"}
                  </p>
                )}

                {selected === "cleaned" && cleanState === "done" && (
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
                {cleanState === "cleaning" ? "Cleaning…" : cleanState === "error" ? "Failed" : "Cleaned ✨"}
              </p>
            </button>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saveDisabled}
            className="w-full flex items-center justify-center gap-2 py-4
                       border-4 border-black rounded-xl font-display font-bold text-sm uppercase
                       shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                       active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all
                       disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
            style={{ background: saveDisabled ? "#ccc" : PINK, color: "white" }}
          >
            {saveDisabled
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Still cleaning…</>
              : <><Check className="w-4 h-4" strokeWidth={3} /> {selected === "cleaned" ? "Save Cleaned Version" : "Save Original"}</>
            }
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
      </div>
    </motion.div>
  );
}
