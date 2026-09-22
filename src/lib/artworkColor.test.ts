import { describe, expect, it } from "vitest";
import { paletteFromPixels } from "./artworkColor";

describe("paletteFromPixels", () => {
  it("builds a dark screen from a saturated cover", () => {
    const data = new Uint8ClampedArray(8 * 8 * 4);
    for (let index = 0; index < data.length; index += 4) {
      data[index] = 190;
      data[index + 1] = 48;
      data[index + 2] = 72;
      data[index + 3] = 255;
    }
    const palette = paletteFromPixels(data);
    expect(palette).not.toBeNull();
    const [red] = palette!.accent.split(" ").map(Number);
    const [bg] = palette!.app.split(" ").map(Number);
    expect(red).toBeGreaterThan(140);
    expect(bg).toBeLessThan(80);
  });

  it("returns null for a flat gray image", () => {
    const data = new Uint8ClampedArray(4 * 4);
    data.fill(40);
    for (let index = 3; index < data.length; index += 4) data[index] = 255;
    expect(paletteFromPixels(data)).toBeNull();
  });
});
