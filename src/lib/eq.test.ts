import { describe, expect, it } from "vitest";
import {
  EQ_BAND_COUNT,
  bandsFromSimple,
  clampEqGain,
  effectivePreamp,
  eqStatus,
  newCustomEq,
  normalizeEqGains,
  simpleFromBands,
  EMPTY_EQ,
} from "./eq";

describe("normalizeEqGains", () => {
  it("pads to ten bands and clamps", () => {
    expect(normalizeEqGains([20, -20]).length).toBe(EQ_BAND_COUNT);
    expect(normalizeEqGains([20, -20])[0]).toBe(12);
    expect(normalizeEqGains([20, -20])[1]).toBe(-12);
    expect(normalizeEqGains([20, -20])[9]).toBe(0);
  });
});

describe("simple knobs", () => {
  it("drive all ten bands", () => {
    const gains = bandsFromSimple(6, 0, -4);
    expect(gains).toHaveLength(10);
    expect(gains[0]).toBeGreaterThan(gains[5]);
    expect(gains[9]).toBeLessThan(0);
    const simple = simpleFromBands(gains);
    expect(simple.bass).toBeGreaterThan(simple.mids);
    expect(simple.treble).toBeLessThan(0);
  });
});

describe("effectivePreamp", () => {
  it("turns the mix down from the worst boost", () => {
    expect(effectivePreamp([6, 2, 0, 0, 0, 0, 0, 0, 0, 0], 0, true)).toBe(-6);
    expect(effectivePreamp([6, 2, 0, 0, 0, 0, 0, 0, 0, 0], -9, true)).toBe(-9);
    expect(effectivePreamp([6, 2, 0, 0, 0, 0, 0, 0, 0, 0], 0, false)).toBe(0);
  });
});

describe("eqStatus", () => {
  it("shows off as Flat", () => {
    expect(eqStatus(EMPTY_EQ)).toBe("Off");
  });
});

describe("newCustomEq", () => {
  it("copies the live curve", () => {
    const preset = newCustomEq({ ...EMPTY_EQ, gains: normalizeEqGains([3]), preamp: -2 }, "Desk");
    expect(preset.name).toBe("Desk");
    expect(preset.id.startsWith("custom-")).toBe(true);
    expect(preset.gains[0]).toBe(3);
    expect(preset.preamp).toBe(-2);
  });
});

describe("clampEqGain", () => {
  it("keeps the slider range", () => {
    expect(clampEqGain(0)).toBe(0);
    expect(clampEqGain(99)).toBe(12);
    expect(clampEqGain(-99)).toBe(-12);
  });
});
