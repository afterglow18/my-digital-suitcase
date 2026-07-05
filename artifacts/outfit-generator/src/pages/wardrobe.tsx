import React, { useRef, useState, useCallback } from "react";
import {
  useListClothing,
  getListClothingQueryKey,
  useSaveOutfit,
  useListOutfits,
  getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { Shuffle, BookmarkPlus, PersonStanding, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SwipeRow, SwipeRowHandle } from "@/components/SwipeRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { MannequinView } from "@/components/MannequinView";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { PremiumSheet } from "@/components/paywall/PremiumSheet";
import { getImageUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT, FREE_OUTFIT_LIMIT } from "@/lib/entitlements";

type RowKey = "tops" | "bottoms" | "shoes";
type Category = "tops" | "bottoms" | "shoes" | "accessories" | "outerwear" | "dresses";

const ROWS: { key: RowKey; label: string; addLabel: string }[] = [
  { key: "tops",    label: "Tops",    addLabel: "+ Add Top"    },
  { key: "bottoms", label: "Bottoms", addLabel: "+ Add Bottom" },
  { key: "shoes",   label: "Shoes",   addLabel: "+ Add Shoes"  },
];

export default function WardrobePage() {
  const rowRefs = {
    tops:    useRef<SwipeRowHandle>(null),
    bottoms: useRef<SwipeRowHandle>(null),
    shoes:   useRef<SwipeRowHandle>(null),
  };

  // Currently centred item in each row (auto-selected)
  const [centred, setCentred] = useState<Partial<Record<RowKey, ClothingItem>>>({});

  // Quick-add sheet state
  const [addCategory, setAddCategory] = useState<Category | null>(null);

  // Item details sheet state
  const [detailsItem, setDetailsItem] = useState<ClothingItem | null>(null);

  // Mannequin overlay
  const [showMannequin, setShowMannequin] = useState(false);

  // Paywall overlays
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [showPremium, setShowPremium] = useState(false);

  // Save flow
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [saveName,   setSaveName]   = useState("");

  // Data
  const { data: tops    = [] } = useListClothing({ category: "tops"    }, { query: { queryKey: getListClothingQueryKey({ category: "tops"    }) } });
  const { data: bottoms = [] } = useListClothing({ category: "bottoms" }, { query: { queryKey: getListClothingQueryKey({ category: "bottoms" }) } });
  const { data: shoes   = [] } = useListClothing({ category: "shoes"   }, { query: { queryKey: getListClothingQueryKey({ category: "shoes"   }) } });
  const { data: outfits = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { tops, bottoms, shoes };

  // Total items across all three rows (the only categories users can add to)
  const totalItems = tops.length + bottoms.length + shoes.length;

  const saveOutfit  = useSaveOutfit();
  const queryClient = useQueryClient();
  const { tier, caps, canAddItem, canSaveOutfit } = useEntitlements();

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const handleCentred = useCallback(
    (key: RowKey) => (item: ClothingItem | null) =>
      setCentred((prev) => ({ ...prev, [key]: item ?? undefined })),
    []
  );

  const handleItemTap = useCallback((item: ClothingItem) => {
    setDetailsItem(item);
  }, []);

  // Gate: open QuickAddSheet only if within item limit, otherwise show paywall
  const handleAddClick = useCallback((category: Category) => {
    if (canAddItem(totalItems)) {
      setAddCategory(category);
    } else {
      setUpgradeReason("items");
    }
  }, [canAddItem, totalItems]);

  // Gate: open save panel only if within outfit limit, otherwise show paywall
  const handleSaveClick = useCallback(() => {
    if (canSaveOutfit(outfits.length)) {
      setIsSaveOpen(true);
    } else {
      setUpgradeReason("outfits");
    }
  }, [canSaveOutfit, outfits.length]);

  // Gate: open mannequin only with premium entitlement
  const handleMannequinClick = useCallback(() => {
    if (caps.mannequin) {
      setShowMannequin(true);
    } else {
      setShowPremium(true);
    }
  }, [caps.mannequin]);

  // ── Shuffle ───────────────────────────────────────────────────────────────
  const handleShuffle = useCallback(() => {
    ROWS.forEach(({ key }, rowIndex) => {
      const data = rowData[key];
      if (data.length < 2) return;
      const ref = rowRefs[key].current;
      if (!ref) return;
      const targetIdx = Math.floor(Math.random() * data.length);
      setTimeout(() => {
        ref.scrollToIndex(data.length - 1, false);
        setTimeout(() => ref.scrollToIndex(targetIdx, true), 60);
      }, rowIndex * 80);
    });
  }, [rowData]);

  // ── Save outfit ───────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!saveName.trim()) return;
    // Defensive re-check in case the query result became stale between
    // opening the save panel and confirming — guards against concurrent adds.
    if (!canSaveOutfit(outfits.length)) {
      setIsSaveOpen(false);
      setSaveName("");
      setUpgradeReason("outfits");
      return;
    }
    const itemIds = (Object.values(centred) as ClothingItem[]).map((i) => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          setIsSaveOpen(false);
          setSaveName("");
        },
      }
    );
  };

  const canSave = ROWS.every(({ key }) => !!centred[key]);

  // ── Free tier usage indicator ─────────────────────────────────────────────
  const isFree = tier === "free";
  const itemsLeft = isFree ? Math.max(0, FREE_ITEM_LIMIT - totalItems) : null;
  const outfitsLeft = isFree ? Math.max(0, FREE_OUTFIT_LIMIT - outfits.length) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full flex flex-col pt-6 pb-8 bg-background">

      {/* ── Header ── */}
      <header className="px-4 mb-4">
        <h1 className="text-[2.5rem] font-display font-bold uppercase tracking-tighter leading-none">
          My Virtual
        </h1>
        <h1 className="text-[2.5rem] font-display font-bold uppercase tracking-tighter leading-none -mt-1">
          Closet
        </h1>
        <div className="flex items-center justify-between mt-1">
          <p className="text-muted-foreground font-medium text-sm">
            Inspired by the iconic digital closets of the '90s.
          </p>
          {/* Free tier limit badge */}
          {isFree && totalItems > 0 && (
            <button
              onClick={() => setUpgradeReason("items")}
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full
                          border-2 transition-colors
                          ${itemsLeft === 0
                            ? "bg-black text-white border-black"
                            : itemsLeft! <= 5
                            ? "bg-primary border-black text-black"
                            : "bg-white border-black/20 text-black/40 hover:border-black/40"
                          }`}
            >
              {totalItems}/{FREE_ITEM_LIMIT} items
            </button>
          )}
        </div>
      </header>

      {/* ── Three slot-machine rows ── */}
      <div className="flex flex-col">
        {ROWS.map(({ key, label, addLabel }, rowIdx) => {
          const items = rowData[key];
          return (
            <div key={key} data-testid={`row-${key}`}>
              <div className="flex items-center justify-between px-4 mb-1">
                <span className="font-display font-bold text-[10px] uppercase tracking-[0.2em] text-black/50">
                  {label}
                  {items.length > 0 && (
                    <span className="ml-1.5 font-bold text-black/25">{items.length}</span>
                  )}
                </span>
                {items.length > 0 && (
                  <button
                    onClick={() => handleAddClick(key as Category)}
                    className="text-[10px] font-bold uppercase tracking-wide text-black/30 hover:text-black transition-colors"
                  >
                    + Add
                  </button>
                )}
              </div>

              <SwipeRow
                ref={rowRefs[key]}
                items={items}
                addLabel={addLabel}
                onCenteredItem={handleCentred(key)}
                onAddClick={() => handleAddClick(key as Category)}
                onItemTap={handleItemTap}
              />

              {rowIdx < ROWS.length - 1 && (
                <div className="mx-4 mt-2 mb-4 border-t border-black/8" />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Mini outfit preview strip ── */}
      {Object.keys(centred).length > 0 && (
        <div className="flex justify-center gap-2 mt-4 px-4">
          {ROWS.map(({ key, label }) => {
            const item = centred[key];
            return (
              <div key={key} className="flex flex-col items-center gap-1">
                <div
                  className={`w-12 h-14 border-2 rounded-lg overflow-hidden ${
                    item ? "border-black" : "border-dashed border-black/20"
                  }`}
                  style={
                    item?.imageObjectPath
                      ? {
                          backgroundImage:
                            "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
                          backgroundSize: "8px 8px",
                        }
                      : {}
                  }
                >
                  {item?.imageObjectPath ? (
                    <img
                      src={getImageUrl(item.imageObjectPath)!}
                      alt={item.name}
                      className="w-full h-full object-contain"
                    />
                  ) : item ? (
                    <div className="w-full h-full bg-primary flex items-center justify-center p-0.5">
                      <span className="text-[7px] font-bold uppercase text-center leading-tight">
                        {item.name}
                      </span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted/30">
                      <span className="text-[9px] text-black/20">—</span>
                    </div>
                  )}
                </div>
                <span className="text-[8px] font-bold uppercase text-muted-foreground tracking-wide">
                  {label.slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="px-4 mt-5 flex flex-col gap-2">
        <AnimatePresence mode="wait">
          {isSaveOpen ? (
            <motion.div
              key="save-input"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex gap-2"
            >
              <input
                autoFocus
                type="text"
                placeholder="Name this outfit…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="flex-1 border-2 border-black rounded-xl px-4 py-3 text-sm font-bold
                           focus:outline-none focus:ring-2 focus:ring-primary placeholder:font-normal"
                data-testid="input-outfit-name"
              />
              <button
                onClick={() => { setIsSaveOpen(false); setSaveName(""); }}
                className="w-11 h-11 border-2 border-black rounded-xl flex items-center justify-center
                           bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                           active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={handleSave}
                disabled={!saveName.trim() || saveOutfit.isPending}
                className="btn-brutalist px-5 py-3 rounded-xl text-sm disabled:opacity-40"
                data-testid="button-save-outfit-confirm"
              >
                {saveOutfit.isPending ? "…" : "Save"}
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="save-btn"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              onClick={canSave ? handleSaveClick : undefined}
              disabled={!canSave}
              className="btn-brutalist w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm
                         disabled:opacity-35 disabled:cursor-not-allowed disabled:shadow-none
                         disabled:translate-y-0 disabled:translate-x-0"
              data-testid="button-save-outfit"
            >
              <BookmarkPlus className="w-4 h-4" />
              {canSave ? (
                <>
                  Save Outfit
                  {isFree && outfitsLeft !== null && (
                    <span className="ml-1 text-xs font-bold text-black/50">
                      ({outfitsLeft} left)
                    </span>
                  )}
                </>
              ) : (
                "Add items to all rows to save"
              )}
            </motion.button>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleShuffle}
            className="py-3 rounded-xl flex items-center justify-center gap-1.5 text-sm
                       font-bold uppercase tracking-wide border-2 border-black bg-white
                       shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                       hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
            data-testid="button-shuffle"
          >
            <Shuffle className="w-4 h-4" />
            Shuffle
          </button>

          <button
            onClick={handleMannequinClick}
            disabled={!canSave}
            className="py-3 rounded-xl flex items-center justify-center gap-1.5 text-sm
                       font-bold uppercase tracking-wide border-2 border-black bg-white
                       shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                       hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none
                       disabled:translate-y-0 disabled:translate-x-0"
            data-testid="button-view-mannequin"
          >
            <PersonStanding className="w-4 h-4" />
            Mannequin
            {!caps.mannequin && canSave && (
              <span className="text-[9px] font-bold text-black/40 ml-0.5">✦</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Overlays ── */}
      <AnimatePresence>
        {showMannequin && (
          <MannequinView
            top={centred.tops}
            bottom={centred.bottoms}
            shoes={centred.shoes}
            onClose={() => setShowMannequin(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {upgradeReason && (
          <UpgradeSheet
            reason={upgradeReason}
            onClose={() => setUpgradeReason(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPremium && (
          <PremiumSheet onClose={() => setShowPremium(false)} />
        )}
      </AnimatePresence>

      {/* Quick-add sheet */}
      <AnimatePresence>
        {addCategory && (
          <QuickAddSheet
            key={addCategory}
            open={!!addCategory}
            onOpenChange={(open) => !open && setAddCategory(null)}
            category={addCategory}
            existingCount={rowData[addCategory as RowKey]?.length ?? 0}
          />
        )}
      </AnimatePresence>

      {/* Item details sheet */}
      <AnimatePresence>
        {detailsItem && (
          <ItemDetailsSheet
            key={detailsItem.id}
            item={detailsItem}
            onClose={() => setDetailsItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
