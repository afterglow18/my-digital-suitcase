/**
 * Local IndexedDB database for My Digital Suitcase.
 *
 * Schema v1: clothing_items, saved_outfits, outfit_items, settings
 * Schema v2: adds visionLabels / visionText / visionVersion to clothing_items
 *            (non-destructive — existing records default to [] / [] / 0)
 */

import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME    = "my-digital-suitcase";
export const DB_VERSION = 2;

// ── Stored types (IndexedDB records) ─────────────────────────────────────────

export interface StoredClothingItem {
  id?:             number;        // auto-incremented
  name:            string;
  category:        string;        // "outfits" | "beauty" | "souvenirs" | "essentials"
  imageObjectPath: string | null; // JPEG data URL  (e.g. "data:image/jpeg;base64,...")
  isFavorite:      boolean;
  timesWorn:       number;
  bgRemoved?:      boolean;       // true once background removal has been applied & saved
  color?:          string | null;
  brand?:          string | null;
  size?:           string | null;
  season?:         string | null;
  occasion?:       string | null;
  purchasePrice?:  string | null;
  purchaseDate?:   string | null;
  notes?:          string | null;
  createdAt:       string;
  updatedAt:       string;
  // ── Vision indexing (v2) ─────────────────────────────────────────────────
  visionLabels?:   string[];      // color/object labels from photo analysis
  visionText?:     string[];      // text detected inside photo
  visionVersion?:  number;        // 0=unanalyzed, 1=iOS Vision, 4=web canvas, 5=web/no labels
}

export interface StoredOutfit {
  id?:       number;
  name:      string;
  notes?:    string | null;
  createdAt: string;
}

export interface StoredOutfitItem {
  id?:             number;
  outfitId:        number;
  clothingItemId:  number;
}

export interface StoredSetting {
  key:   string;
  value: string;
}

// ── Public types (consumed by hooks and pages) ────────────────────────────────

/** All fields are required at runtime; vision arrays default to [] / 0. */
export interface ClothingItem {
  id:              number;
  name:            string;
  category:        string;
  imageObjectPath: string | null;
  isFavorite:      boolean;
  timesWorn:       number;
  bgRemoved:       boolean;
  color:           string | null;
  brand:           string | null;
  size:            string | null;
  season:          string | null;
  occasion:        string | null;
  purchasePrice:   string | null;
  purchaseDate:    string | null;
  notes:           string | null;
  createdAt:       string;
  updatedAt:       string;
  visionLabels:    string[];
  visionText:      string[];
  visionVersion:   number;
}

export interface SavedOutfit {
  id:        number;
  name:      string;
  notes?:    string | null;
  createdAt: string;
  items:     ClothingItem[];
}

// ── Singleton DB connection ───────────────────────────────────────────────────

let _db: IDBPDatabase | null = null;

export async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;

  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── v1: create all stores ────────────────────────────────────────────
      if (oldVersion < 1) {
        const itemStore = db.createObjectStore("clothing_items", {
          keyPath:       "id",
          autoIncrement: true,
        });
        itemStore.createIndex("by_category", "category");
        itemStore.createIndex("by_favorite", "isFavorite");

        db.createObjectStore("saved_outfits", {
          keyPath:       "id",
          autoIncrement: true,
        });

        const junctionStore = db.createObjectStore("outfit_items", {
          keyPath:       "id",
          autoIncrement: true,
        });
        junctionStore.createIndex("by_outfit", "outfitId");
        junctionStore.createIndex("by_item",   "clothingItemId");

        db.createObjectStore("settings", { keyPath: "key" });
      }

      // ── v2: adds visionLabels / visionText / visionVersion ───────────────
      // No structural changes — optional fields on existing records.
      // Existing items will read as visionVersion=0 (unanalyzed) via defaults
      // applied in localDB read helpers.
      if (oldVersion < 2) {
        // Nothing to do structurally
      }
    },

    blocked() {
      console.warn("[DB] Upgrade blocked — close other tabs");
    },

    blocking() {
      _db?.close();
      _db = null;
    },
  });

  return _db;
}
