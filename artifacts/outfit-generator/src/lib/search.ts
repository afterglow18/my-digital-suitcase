/**
 * search.ts — full-text search across all locally stored item and group data.
 *
 * Scoring weights (higher = more relevant):
 *   name/brand: 10/8  color/category/size: 5  season/occasion/notes: 4
 *   price/date: 2     group name/notes: 6      vision labels/text: 2/1
 */

import { listClothing, listOutfits } from "./localDB";
import type { ClothingItem, SavedOutfit } from "./db";

export interface SearchResults {
  items: Array<{ item: ClothingItem; score: number }>;
  groups: Array<{ outfit: SavedOutfit; matchingItems: ClothingItem[]; score: number }>;
}

/** Returns true if haystack contains the needle (case-insensitive). */
function contains(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

/** Score how well a single item matches the query. 0 = no match. */
function scoreItem(item: ClothingItem, q: string): number {
  let score = 0;
  if (contains(item.name,          q)) score += 10;
  if (contains(item.brand,         q)) score += 8;
  if (contains(item.color,         q)) score += 5;
  if (contains(item.category,      q)) score += 5;
  if (contains(item.size,          q)) score += 5;
  if (contains(item.season,        q)) score += 4;
  if (contains(item.occasion,      q)) score += 4;
  if (contains(item.notes,         q)) score += 4;
  if (contains(item.purchasePrice, q)) score += 2;
  if (contains(item.purchaseDate,  q)) score += 2;

  // Vision fields (lowest weight)
  if (item.visionLabels?.some((l) => l.toLowerCase().includes(q))) score += 2;
  if (item.visionText?.some((t)  => t.toLowerCase().includes(q))) score += 1;

  return score;
}

/**
 * Search everything in the local database.
 * Items are scored per field weight; groups match if their name, notes, or any
 * contained item matches. Results are sorted by score descending.
 *
 * Trims and lower-cases the query before matching.
 */
export async function searchEverything(rawQuery: string): Promise<SearchResults> {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return { items: [], groups: [] };

  const [allItems, allOutfits] = await Promise.all([
    listClothing(),
    listOutfits(),
  ]);

  // ── Score individual items ────────────────────────────────────────────────
  const scoredItems = allItems
    .map((item) => ({ item, score: scoreItem(item, q) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  // Build a quick lookup: itemId → score
  const itemScoreMap = new Map(scoredItems.map(({ item, score }) => [item.id, score]));

  // ── Score groups ──────────────────────────────────────────────────────────
  const scoredGroups = allOutfits
    .map((outfit) => {
      let groupScore = 0;
      if (contains(outfit.name,  q)) groupScore += 6;
      if (contains(outfit.notes, q)) groupScore += 4;

      const matchingItems = outfit.items.filter((i) => (itemScoreMap.get(i.id) ?? 0) > 0);
      const bestItemScore  = matchingItems.reduce(
        (best, i) => Math.max(best, itemScoreMap.get(i.id) ?? 0),
        0,
      );

      const score = groupScore + bestItemScore;
      return { outfit, matchingItems, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return { items: scoredItems, groups: scoredGroups };
}
