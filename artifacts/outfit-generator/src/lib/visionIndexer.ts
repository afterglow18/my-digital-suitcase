/**
 * visionIndexer — background photo analysis for search.
 *
 * Version scheme:
 *   0 = unanalyzed
 *   1 = indexed by iOS Vision (handled natively, not touched here)
 *   4 = indexed by web canvas — labels found
 *   5 = indexed by web canvas — no labels (don't retry)
 *
 * On web: process any item whose visionVersion is 0 (or undefined).
 * Re-process items with visionVersion 1–3 to pick up the web canvas results.
 * Do NOT re-process items at version 4 or 5.
 */

import { listClothing, updateVisionData } from "./localDB";
import { extractColorsFromDataUrl } from "./visionWeb";

const DELAY_MS = 350;

// ── Native iOS Vision bridge ──────────────────────────────────────────────────
// Dynamically registered so the web build doesn't error when Capacitor is absent.

interface NativeVisionResult {
  labels: string[];
  text:   string[];
}

async function analyzeWithNativeVision(dataUrl: string): Promise<NativeVisionResult | null> {
  try {
    // @ts-ignore — registerPlugin is a Capacitor runtime API
    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin<{
      analyze(opts: { imageDataUrl: string }): Promise<NativeVisionResult>;
    }>("VisionAnalyzer");
    return await plugin.analyze({ imageDataUrl: dataUrl });
  } catch {
    return null;
  }
}

/** Returns true when running inside a Capacitor iOS WebView. */
function isCapacitorIOS(): boolean {
  try {
    // @ts-ignore
    return typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

// ── Pending queue for newly added items ───────────────────────────────────────

const pendingQueue = new Set<number>();

/** Queue a specific item for immediate analysis on the next indexer tick. */
export function queueItemForIndexing(itemId: number): void {
  pendingQueue.add(itemId);
}

// ── Progress event ────────────────────────────────────────────────────────────

export const INDEXER_EVENT = "visionIndexer:progress";

interface IndexerProgress {
  done:  number;
  total: number;
  finished: boolean;
}

function emit(progress: IndexerProgress): void {
  window.dispatchEvent(new CustomEvent(INDEXER_EVENT, { detail: progress }));
}

// ── Core indexer ──────────────────────────────────────────────────────────────

let indexerRunning = false;

/**
 * Start the background indexer.  Safe to call multiple times — only one
 * instance runs at a time.  Call from main.tsx after app init.
 */
export async function startVisionIndexer(): Promise<void> {
  if (indexerRunning) return;
  indexerRunning = true;

  try {
    const allItems = await listClothing();
    const onIOS    = isCapacitorIOS();

    // Items needing analysis:
    //   web:    visionVersion < 4 (includes 0,1,2,3)
    //   iOS:    visionVersion === 0 only (native handles everything)
    const toIndex = allItems.filter((item) => {
      if (!item.imageObjectPath) return false;
      const v = item.visionVersion ?? 0;
      return onIOS ? v === 0 : v < 4;
    });

    if (toIndex.length === 0) {
      emit({ done: 0, total: 0, finished: true });
      indexerRunning = false;
      return;
    }

    emit({ done: 0, total: toIndex.length, finished: false });

    for (let i = 0; i < toIndex.length; i++) {
      const item = toIndex[i];

      try {
        if (onIOS) {
          // Native Vision: labels + OCR text
          const result = await analyzeWithNativeVision(item.imageObjectPath!);
          if (result) {
            const version = result.labels.length > 0 || result.text.length > 0 ? 1 : 5;
            await updateVisionData(item.id, result.labels, result.text, version);
          }
        } else {
          // Web canvas: color extraction only
          const labels = await extractColorsFromDataUrl(item.imageObjectPath!);
          await updateVisionData(item.id, labels, [], labels.length > 0 ? 4 : 5);
        }
      } catch {
        // Silently skip failed items — text search still works
      }

      emit({ done: i + 1, total: toIndex.length, finished: i + 1 === toIndex.length });

      if (i < toIndex.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
  } finally {
    indexerRunning = false;
  }

  // Drain the queue of newly added items
  if (pendingQueue.size > 0) {
    const ids = [...pendingQueue];
    pendingQueue.clear();
    for (const id of ids) {
      try {
        const { getClothingItem } = await import("./localDB");
        const item = await getClothingItem(id);
        if (!item?.imageObjectPath) continue;
        const labels = await extractColorsFromDataUrl(item.imageObjectPath);
        await updateVisionData(id, labels, [], labels.length > 0 ? 4 : 5);
      } catch {
        // ignore
      }
    }
  }
}

/** Immediately analyze a single newly added/updated item (non-blocking). */
export function indexItemNow(itemId: number): void {
  (async () => {
    try {
      const { getClothingItem } = await import("./localDB");
      const item = await getClothingItem(itemId);
      if (!item?.imageObjectPath) return;
      if (isCapacitorIOS()) {
        const result = await analyzeWithNativeVision(item.imageObjectPath);
        if (result) {
          const v = result.labels.length > 0 || result.text.length > 0 ? 1 : 5;
          await updateVisionData(itemId, result.labels, result.text, v);
        }
      } else {
        const labels = await extractColorsFromDataUrl(item.imageObjectPath);
        await updateVisionData(itemId, labels, [], labels.length > 0 ? 4 : 5);
      }
    } catch {
      // ignore
    }
  })();
}
