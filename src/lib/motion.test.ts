import { describe, expect, it } from "vitest";
import { followPosition, POSITION_LEAD_MS } from "./motion";

describe("followPosition", () => {
  it("stays within a fraction of a second of the last tick", () => {
    expect(followPosition(10_000, 100, 1)).toBe(10_100);
    expect(followPosition(10_000, 15_000, 1)).toBe(10_000 + POSITION_LEAD_MS);
  });

  it("moves through the song faster when playback is sped up", () => {
    expect(followPosition(0, 200, 1.5)).toBe(300);
  });
});
