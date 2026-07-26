import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

/**
 * One-time ORT configuration — must run before the first imgly call.
 *
 * Why each part is needed:
 *
 * 1. Object.defineProperty(proxy) — @imgly/background-removal internally sets
 *    ort.env.wasm.proxy = false right before it creates the ONNX session (it only
 *    enables the worker proxy when WebGPU is available, which it never is on iOS
 *    Safari / WKWebView). A plain `ort.env.wasm.proxy = true` gets overwritten.
 *    Locking the property with a no-op setter keeps it true so ONNX Runtime runs
 *    inference in a sub-worker instead of freezing the main JS thread.
 *
 * 2. numThreads = 1 — iOS Safari has no SharedArrayBuffer, which WASM
 *    multithreading requires. Leaving threads > 1 causes a silent crash.
 *
 * 3. Dynamic import() — importing onnxruntime-web at module parse time triggers
 *    Vite's dependency pre-bundling mid-session, which forces a full page reload
 *    and corrupts React's internal dispatcher. Importing it lazily (the first time
 *    removeBackground is called, after the app is fully stable) avoids that.
 */
let ortConfigured = false;

async function configureOrt(): Promise<void> {
  if (ortConfigured) return;
  ortConfigured = true;

  const ort = await import("onnxruntime-web");

  // Lock proxy to true — blocks imgly from silently resetting it to false.
  Object.defineProperty(ort.env.wasm, "proxy", {
    get: () => true,
    set: () => {}, // intentional no-op
    configurable: true,
  });

  // Single-threaded: iOS Safari has no SharedArrayBuffer, so threads > 1 crashes.
  ort.env.wasm.numThreads = 1;
}

/**
 * Remove the background from a JPEG/PNG base64 data-URL.
 * Returns a PNG data-URL with transparent background.
 *
 * On first ever call: downloads ~15 MB ONNX model from the imgly CDN (cached
 * by the browser after that). Inference runs in a Web Worker so the UI stays
 * responsive throughout.
 *
 * Throws on network error or unreadable image — callers should catch.
 */
export async function removeBackground(dataUrl: string): Promise<string> {
  await configureOrt();

  const sourceBlob = await dataUrlToBlob(dataUrl);
  const resultBlob = await imglyRemoveBackground(sourceBlob, {
    model: "isnet_fp16",  // valid: "isnet" | "isnet_fp16" | "isnet_quint8"
    output: { format: "image/png", quality: 0.9 },
    // publicPath omitted → uses imgly CDN automatically
  });
  return blobToDataUrl(resultBlob);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
