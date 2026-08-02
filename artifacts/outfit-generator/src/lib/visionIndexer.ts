/**
 * visionIndexer — background photo analysis for search.
 *
 * Version scheme:
 *   0 = unanalyzed
 *   1 = iOS native Vision only (legacy — no canvas colors; re-index to v2)
 *   2 = iOS native Vision + canvas color extraction (current iOS target)
 *   4 = web canvas — labels found
 *   5 = web canvas — no labels (don't retry)
 *
 * needsIndexing:
 *   iOS:  v === 0 or v === 1  (v1 items get re-indexed to pick up canvas colors)
 *   web:  v < 4
 */

import { listClothing, updateVisionData } from "./localDB";
import { extractColorsFromDataUrl } from "./visionWeb";

const DELAY_MS = 350;

// ── Native iOS Vision bridge ──────────────────────────────────────────────────

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

/**
 * Analyze one item on iOS: run native Vision + canvas color extraction in
 * parallel, then merge the results.  Native Vision gives object/scene labels;
 * canvas gives color names that Apple Vision never outputs.
 */
async function analyzeIOSItem(
  imageObjectPath: string,
): Promise<{ labels: string[]; text: string[]; version: number }> {
  const [nativeResult, canvasColors] = await Promise.all([
    analyzeWithNativeVision(imageObjectPath),
    extractColorsFromDataUrl(imageObjectPath),
  ]);

  const nativeLabels = nativeResult?.labels ?? [];
  const nativeText   = nativeResult?.text   ?? [];

  // Merge: canvas colors first (most search-useful), then native object labels.
  // De-duplicate in case Vision ever returns a color word.
  const seen = new Set<string>();
  const mergedLabels: string[] = [];
  for (const l of [...canvasColors, ...nativeLabels]) {
    if (!seen.has(l)) { seen.add(l); mergedLabels.push(l); }
  }

  const hasData = mergedLabels.length > 0 || nativeText.length > 0;
  return { labels: mergedLabels, text: nativeText, version: hasData ? 2 : 5 };
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
  done:     number;
  total:    number;
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

    // needsIndexing:
    //   iOS: v === 0 (never analyzed) OR v === 1 (legacy native-only, missing colors)
    //   web: v < 4
    const toIndex = allItems.filter((item) => {
      if (!item.imageObjectPath) return false;
      const v = item.visionVersion ?? 0;
      return onIOS ? (v === 0 || v === 1) : v < 4;
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
          const { labels, text, version } = await analyzeIOSItem(item.imageObjectPath!);
          await updateVisionData(item.id, labels, text, version);
        } else {
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

        if (isCapacitorIOS()) {
          const { labels, text, version } = await analyzeIOSItem(item.imageObjectPath);
          await updateVisionData(id, labels, text, version);
        } else {
          const labels = await extractColorsFromDataUrl(item.imageObjectPath);
          await updateVisionData(id, labels, [], labels.length > 0 ? 4 : 5);
        }
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
        const { labels, text, version } = await analyzeIOSItem(item.imageObjectPath);
        await updateVisionData(itemId, labels, text, version);
      } else {
        const labels = await extractColorsFromDataUrl(item.imageObjectPath);
        await updateVisionData(itemId, labels, [], labels.length > 0 ? 4 : 5);
      }
    } catch {
      // ignore
    }
  })();
}
