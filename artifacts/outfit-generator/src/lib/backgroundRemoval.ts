import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

const CDN_VERSION = "1.7.0";
const PUBLIC_PATH = `https://cdn.jsdelivr.net/npm/@imgly/background-removal@${CDN_VERSION}/dist/web/`;

/**
 * Remove the background from an image Blob.
 * Returns a PNG Blob with transparent background.
 * On first ever call downloads ~5 MB ONNX model from jsDelivr CDN (cached after that).
 * Throws on network error or unreadable image — callers should catch and fall back.
 */
export async function removeBackground(blob: Blob): Promise<Blob> {
  return imglyRemoveBackground(blob, {
    publicPath: PUBLIC_PATH,
    model: "isnet_quint8", // smallest model (~5 MB), same as processImage.ts
    output: { format: "image/png", quality: 1 },
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
