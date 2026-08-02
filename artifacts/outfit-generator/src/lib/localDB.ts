/**
 * localDB — all CRUD operations on the IndexedDB database.
 *
 * Every function is async and returns plain objects (no reactive signals).
 * React Query hooks in useLocalDB.ts call these functions and handle caching.
 */

import { getDB, type ClothingItem, type SavedOutfit, type StoredClothingItem, type StoredOutfit, type StoredOutfitItem } from "./db";

const CATEGORIES = ["outfits", "beauty", "essentials", "souvenirs"] as const;

// ── Helper: normalise a raw DB record into a ClothingItem with safe defaults ──

function normalise(raw: StoredClothingItem & { id: number }): ClothingItem {
  return {
    id:              raw.id,
    name:            raw.name            ?? "",
    category:        raw.category        ?? "",
    imageObjectPath: raw.imageObjectPath ?? null,
    isFavorite:      raw.isFavorite      ?? false,
    timesWorn:       raw.timesWorn       ?? 0,
    bgRemoved:       raw.bgRemoved       ?? false,
    color:           raw.color           ?? null,
    brand:           raw.brand           ?? null,
    size:            raw.size            ?? null,
    season:          raw.season          ?? null,
    occasion:        raw.occasion        ?? null,
    purchasePrice:   raw.purchasePrice   ?? null,
    purchaseDate:    raw.purchaseDate    ?? null,
    notes:           raw.notes           ?? null,
    createdAt:       raw.createdAt,
    updatedAt:       raw.updatedAt,
    visionLabels:    raw.visionLabels    ?? [],
    visionText:      raw.visionText      ?? [],
    visionVersion:   raw.visionVersion   ?? 0,
  };
}

// ── Clothing items ────────────────────────────────────────────────────────────

export async function listClothing(category?: string): Promise<ClothingItem[]> {
  const db  = await getDB();
  const all = category
    ? await db.getAllFromIndex("clothing_items", "by_category", category)
    : await db.getAll("clothing_items");

  return (all as (StoredClothingItem & { id: number })[])
    .map(normalise)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getClothingItem(id: number): Promise<ClothingItem | null> {
  const db  = await getDB();
  const raw = await db.get("clothing_items", id);
  return raw ? normalise(raw as StoredClothingItem & { id: number }) : null;
}

export async function createClothingItem(data: {
  name:            string;
  category:        string;
  imageObjectPath?: string | null;
  color?:          string | null;
  brand?:          string | null;
  size?:           string | null;
  season?:         string | null;
  occasion?:       string | null;
  purchasePrice?:  string | null;
  purchaseDate?:   string | null;
  notes?:          string | null;
}): Promise<ClothingItem> {
  const db  = await getDB();
  const now = new Date().toISOString();

  const record: StoredClothingItem = {
    name:           data.name,
    category:       data.category,
    imageObjectPath: data.imageObjectPath ?? null,
    isFavorite:     false,
    timesWorn:      0,
    bgRemoved:      false,
    color:          data.color         ?? null,
    brand:          data.brand         ?? null,
    size:           data.size          ?? null,
    season:         data.season        ?? null,
    occasion:       data.occasion      ?? null,
    purchasePrice:  data.purchasePrice ?? null,
    purchaseDate:   data.purchaseDate  ?? null,
    notes:          data.notes         ?? null,
    createdAt:      now,
    updatedAt:      now,
    visionLabels:   [],
    visionText:     [],
    visionVersion:  0,
  };

  const id = await db.add("clothing_items", record);
  return normalise({ ...record, id: id as number });
}

export async function updateClothingItem(
  id: number,
  updates: Partial<Omit<StoredClothingItem, "id" | "createdAt">>,
): Promise<ClothingItem> {
  const db       = await getDB();
  const existing = await db.get("clothing_items", id) as StoredClothingItem | undefined;
  if (!existing) throw new Error(`Clothing item ${id} not found`);

  const updated: StoredClothingItem = {
    ...existing,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  };

  await db.put("clothing_items", updated);
  return normalise(updated as StoredClothingItem & { id: number });
}

/** Update only the vision analysis fields — lightweight, no updatedAt bump. */
export async function updateVisionData(
  id: number,
  labels: string[],
  text: string[],
  version: number,
): Promise<void> {
  const db       = await getDB();
  const existing = await db.get("clothing_items", id) as StoredClothingItem | undefined;
  if (!existing) return; // item may have been deleted
  await db.put("clothing_items", {
    ...existing,
    id,
    visionLabels:  labels,
    visionText:    text,
    visionVersion: version,
  });
}

export async function deleteClothingItem(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("clothing_items", id);

  const links = await db.getAllFromIndex("outfit_items", "by_item", id);
  const tx    = db.transaction("outfit_items", "readwrite");
  for (const link of links) {
    if (link.id != null) await tx.store.delete(link.id);
  }
  await tx.done;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getWardrobeStats() {
  const db      = await getDB();
  const all     = (await db.getAll("clothing_items")) as ClothingItem[];
  const outfits = (await db.getAll("saved_outfits")) as StoredOutfit[];

  const byCategory = CATEGORIES.map((cat) => ({
    category: cat,
    count:    all.filter((i) => i.category === cat).length,
  }));

  return {
    total:            all.length,
    byCategory,
    favorites:        all.filter((i) => i.isFavorite).length,
    outfitsGenerated: outfits.length,
  };
}

// ── Outfit generation (pure Math.random — no backend needed) ──────────────────

export async function generateOutfit(excludeCategories: string[] = []): Promise<ClothingItem[]> {
  const db          = await getDB();
  const all         = (await db.getAll("clothing_items")) as (StoredClothingItem & { id: number })[];
  const active      = CATEGORIES.filter((c) => !excludeCategories.includes(c));
  const picked: ClothingItem[] = [];

  for (const cat of active) {
    const items = all.filter((i) => i.category === cat);
    if (items.length > 0) {
      picked.push(normalise(items[Math.floor(Math.random() * items.length)]));
    }
  }

  if (picked.length === 0) {
    throw new Error("Your suitcase is empty. Add some items first!");
  }

  return picked;
}

// ── Saved outfits ─────────────────────────────────────────────────────────────

async function hydrateOutfit(outfit: StoredOutfit & { id: number }): Promise<SavedOutfit> {
  const db    = await getDB();
  const links = (await db.getAllFromIndex("outfit_items", "by_outfit", outfit.id)) as StoredOutfitItem[];

  const raws = await Promise.all(
    links.map((l) => db.get("clothing_items", l.clothingItemId))
  );

  return {
    id:        outfit.id,
    name:      outfit.name,
    notes:     outfit.notes ?? null,
    createdAt: outfit.createdAt,
    items:     raws
      .filter(Boolean)
      .map((r) => normalise(r as StoredClothingItem & { id: number })),
  };
}

export async function listOutfits(): Promise<SavedOutfit[]> {
  const db      = await getDB();
  const outfits = (await db.getAll("saved_outfits")) as (StoredOutfit & { id: number })[];
  const sorted  = outfits.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return Promise.all(sorted.map(hydrateOutfit));
}

export async function saveOutfit(data: { name: string; itemIds: number[] }): Promise<SavedOutfit> {
  const db  = await getDB();
  const now = new Date().toISOString();

  const record: StoredOutfit = { name: data.name, notes: null, createdAt: now };
  const outfitId = (await db.add("saved_outfits", record)) as number;

  for (const itemId of data.itemIds) {
    const link: StoredOutfitItem = { outfitId, clothingItemId: itemId };
    await db.add("outfit_items", link);
  }

  return hydrateOutfit({ ...record, id: outfitId });
}

export async function updateOutfit(id: number, data: { name?: string; notes?: string | null }): Promise<void> {
  const db       = await getDB();
  const existing = await db.get("saved_outfits", id) as StoredOutfit | undefined;
  if (!existing) throw new Error(`Outfit ${id} not found`);

  await db.put("saved_outfits", { ...existing, ...data, id });
}

export async function deleteOutfit(id: number): Promise<void> {
  const db    = await getDB();
  const links = (await db.getAllFromIndex("outfit_items", "by_outfit", id)) as StoredOutfitItem[];

  await db.delete("saved_outfits", id);

  const tx = db.transaction("outfit_items", "readwrite");
  for (const link of links) {
    if (link.id != null) await tx.store.delete(link.id);
  }
  await tx.done;
}

export async function addItemToOutfit(outfitId: number, itemId: number): Promise<void> {
  const db    = await getDB();
  const links = (await db.getAllFromIndex("outfit_items", "by_outfit", outfitId)) as StoredOutfitItem[];

  if (links.some((l) => l.clothingItemId === itemId)) return;

  const link: StoredOutfitItem = { outfitId, clothingItemId: itemId };
  await db.add("outfit_items", link);
}

export async function removeItemFromOutfit(outfitId: number, itemId: number): Promise<void> {
  const db    = await getDB();
  const links = (await db.getAllFromIndex("outfit_items", "by_outfit", outfitId)) as StoredOutfitItem[];
  const match = links.find((l) => l.clothingItemId === itemId);
  if (match?.id != null) await db.delete("outfit_items", match.id);
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db  = await getDB();
  const row = await db.get("settings", key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key, value });
}
