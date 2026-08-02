/**
 * visionWeb — extracts dominant color names from a photo data URL using a
 * 48×48 canvas.  No external APIs; runs entirely in the browser.
 *
 * Version returned by this module: 4 (labels found) or 5 (no labels).
 */

// ── Color mapping ─────────────────────────────────────────────────────────────

/** Map an RGB pixel to a human-readable color name. */
function pixelToColorName(r: number, g: number, b: number): string {
  const brightness = (r + g + b) / 3;

  // Achromatic range first
  if (brightness < 80)  return "black";
  if (brightness < 110) return "dark grey";
  if (brightness < 175) return "grey";
  if (brightness < 225) return "light grey";

  // White check: high brightness AND low saturation
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (brightness >= 225 && saturation < 0.15) return "white";

  // Beige / tan / brown
  if (r > 180 && g > 140 && b < 120 && saturation < 0.45) return "beige";
  if (r > 150 && g > 100 && b < 80)  return "tan";
  if (r > 100 && g < 80  && b < 60)  return "brown";

  // Hue-based classification
  const hue = rgbToHue(r, g, b);

  if (hue < 15  || hue >= 345) return "red";
  if (hue < 40)                return "orange";
  if (hue < 70)                return "yellow";
  if (hue < 160)               return "green";
  if (hue < 195)               return "teal";
  if (hue < 260)               return "blue";
  if (hue < 290)               return "purple";
  if (hue < 345)               return "pink";

  return "grey";
}

function rgbToHue(r: number, g: number, b: number): number {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;
  if (delta === 0) return 0;

  let h = 0;
  if (max === rf)      h = ((gf - bf) / delta) % 6;
  else if (max === gf) h = (bf - rf) / delta + 2;
  else                 h = (rf - gf) / delta + 4;

  h = h * 60;
  if (h < 0) h += 360;
  return h;
}

// ── Background detection ──────────────────────────────────────────────────────

/** Sample the four 4×4 corner patches and return the most common color. */
function detectBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  const patches: [number, number, number][] = [];

  const corners = [
    [0, 0], [width - 4, 0],
    [0, height - 4], [width - 4, height - 4],
  ];

  for (const [cx, cy] of corners) {
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const i = ((cy + dy) * width + (cx + dx)) * 4;
        patches.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  }

  // Average the corner pixels as a simple background estimate
  const avg = patches.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
    [0, 0, 0],
  );
  return [
    Math.round(avg[0] / patches.length),
    Math.round(avg[1] / patches.length),
    Math.round(avg[2] / patches.length),
  ];
}

/** Returns true if the pixel is close enough to the background to be excluded. */
function isBackground(
  r: number, g: number, b: number,
  bgR: number, bgG: number, bgB: number,
  threshold = 30,
): boolean {
  return (
    Math.abs(r - bgR) < threshold &&
    Math.abs(g - bgG) < threshold &&
    Math.abs(b - bgB) < threshold
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Extracts dominant color names from a data URL image.
 * Returns an array of color name strings that each cover ≥10% of foreground
 * pixels, sorted by frequency descending.
 *
 * Returns an empty array on error (e.g. cross-origin, invalid URL).
 */
export async function extractColorsFromDataUrl(dataUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const SIZE = 48;
          const canvas = document.createElement("canvas");
          canvas.width  = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve([]); return; }

          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

          const [bgR, bgG, bgB] = detectBackgroundColor(data, SIZE, SIZE);

          // Count foreground pixels by color name
          const counts: Record<string, number> = {};
          let foregroundTotal = 0;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 128) continue; // fully transparent
            if (isBackground(r, g, b, bgR, bgG, bgB)) continue;

            foregroundTotal++;
            const name = pixelToColorName(r, g, b);
            counts[name] = (counts[name] ?? 0) + 1;
          }

          if (foregroundTotal === 0) { resolve([]); return; }

          // Keep only colors covering ≥10% of foreground pixels
          const results = Object.entries(counts)
            .filter(([, n]) => n / foregroundTotal >= 0.10)
            .sort(([, a], [, b]) => b - a)
            .map(([name]) => name);

          resolve(results);
        } catch {
          resolve([]);
        }
      };
      img.onerror = () => resolve([]);
      img.src = dataUrl;
    } catch {
      resolve([]);
    }
  });
}
