/**
 * AddToLookbookSheet — lets the user add/remove an item from their saved looks.
 *
 * Shows all saved lookbook groups with a 3-thumbnail preview row and a filled
 * checkmark badge on groups that already contain this item.  Tapping a group
 * toggles membership (add or remove).
 */
import React from "react";
import { motion } from "framer-motion";
import { X, Check } from "lucide-react";
import {
  useListOutfits,
  useAddItemToOutfit,
  useRemoveItemFromOutfit,
  getListOutfitsQueryKey,
  type ClothingItem,
  type SavedOutfit,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";

interface Props {
  item: ClothingItem;
  onClose: () => void;
}

/** Three-thumbnail row representing a lookbook group. */
function GroupThumbnails({ outfit }: { outfit: SavedOutfit }) {
  const shown = outfit.items.slice(0, 3);
  return (
    <div className="flex gap-1 flex-shrink-0">
      {Array.from({ length: 3 }).map((_, i) => {
        const member = shown[i];
        return (
          <div
            key={i}
            className="w-12 h-12 border-2 border-black overflow-hidden flex-shrink-0"
            style={{ background: "#F5EDD8" }}
          >
            {member?.imageObjectPath ? (
              <img
                src={getImageUrl(member.imageObjectPath)!}
                alt={member.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-[8px] font-bold text-black/20">—</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AddToLookbookSheet({ item, onClose }: Props) {
  const { data: outfits = [], isLoading } = useListOutfits();
  const addItem    = useAddItemToOutfit();
  const removeItem = useRemoveItemFromOutfit();
  const qc         = useQueryClient();

  const inGroups = new Set(
    outfits
      .filter((o) => o.items.some((i) => i.id === item.id))
      .map((o) => o.id),
  );

  const handleToggle = (outfit: SavedOutfit) => {
    const alreadyIn = inGroups.has(outfit.id);
    if (alreadyIn) {
      removeItem.mutate(
        { id: outfit.id, itemId: item.id },
        { onSuccess: () => qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
      );
    } else {
      addItem.mutate(
        { id: outfit.id, data: { itemId: item.id } },
        { onSuccess: () => qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() }) },
      );
    }
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
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">
            Add to Lookbook
          </h2>
          <p className="text-xs text-black/40 font-medium mt-0.5 truncate max-w-[220px]">
            {item.name}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse border-2 border-black rounded-xl" />
            ))}
          </div>
        ) : outfits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
            <span className="text-3xl">📒</span>
            <p className="text-sm text-muted-foreground font-medium">
              No looks saved yet. Save a look first.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {outfits.map((outfit) => {
              const checked = inGroups.has(outfit.id);
              return (
                <button
                  key={outfit.id}
                  onClick={() => handleToggle(outfit)}
                  className={`w-full flex items-center gap-3 p-3 border-2 rounded-xl text-left transition-all
                    ${checked
                      ? "border-black bg-primary shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                      : "border-black/30 bg-white hover:border-black/60"
                    }`}
                >
                  <GroupThumbnails outfit={outfit} />

                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold text-sm uppercase tracking-tight truncate">
                      {outfit.name}
                    </p>
                    <p className="text-[10px] text-black/40 font-medium mt-0.5">
                      {outfit.items.length} item{outfit.items.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Checkmark */}
                  <div
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                      ${checked
                        ? "border-black bg-black"
                        : "border-black/25 bg-white"
                      }`}
                  >
                    {checked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t-2 border-black bg-white flex-shrink-0">
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl border-4 border-black bg-primary font-display font-bold
                     text-base uppercase tracking-tight
                     shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                     active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}
