import { describe, expect, it } from "vitest";
import {
  applySimpleThemeColor,
  hexToRgb,
  mixHex,
  normalizeHex,
  rgbToHex,
  newCustomTheme,
  DEFAULT_THEME_COLORS,
} from "./theme";

describe("normalizeHex", () => {
  it("accepts short and long hex", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("D6A858")).toBe("#d6a858");
  });
});

describe("rgbToHex", () => {
  it("reads space-separated CSS variables", () => {
    expect(rgbToHex("123 158 207")).toBe("#7b9ecf");
  });

  it("reads rgb() strings", () => {
    expect(rgbToHex("rgb(30, 30, 30)")).toBe("#1e1e1e");
  });
});

describe("hexToRgb", () => {
  it("returns CSS triplet values", () => {
    expect(hexToRgb("#7b9ecf")).toBe("123 158 207");
    expect(hexToRgb("#141414")).toBe("20 20 20");
  });
});

describe("mixHex", () => {
  it("lerps toward the other color", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("applySimpleThemeColor", () => {
  it("fills surface colors from background and leaves accent alone", () => {
    const next = applySimpleThemeColor(DEFAULT_THEME_COLORS, "app", "#101010");
    expect(next.app).toBe("#101010");
    expect(next.frame).not.toBe(DEFAULT_THEME_COLORS.frame);
    expect(next.raised).not.toBe(next.app);
    expect(next.hover).not.toBe(next.app);
    expect(next.accent).toBe(DEFAULT_THEME_COLORS.accent);
    expect(next.text).toBe(DEFAULT_THEME_COLORS.text);
  });

  it("dims text against the current background", () => {
    const next = applySimpleThemeColor(DEFAULT_THEME_COLORS, "text", "#ffffff");
    expect(next.text).toBe("#ffffff");
    expect(next.subtle).not.toBe("#ffffff");
    expect(next.muted).not.toBe(next.subtle);
    expect(next.app).toBe(DEFAULT_THEME_COLORS.app);
  });

  it("darkens accent dim from the accent", () => {
    const next = applySimpleThemeColor(DEFAULT_THEME_COLORS, "accent", "#7b9ecf");
    expect(next.accent).toBe("#7b9ecf");
    expect(next.accentDim).not.toBe("#7b9ecf");
    expect(next.play).toBe(DEFAULT_THEME_COLORS.play);
  });

  it("picks a contrasting play icon", () => {
    expect(applySimpleThemeColor(DEFAULT_THEME_COLORS, "play", "#efefef").playFg).toBe("#141414");
    expect(applySimpleThemeColor(DEFAULT_THEME_COLORS, "play", "#1e1e1e").playFg).toBe("#f2f2f2");
  });
});

describe("newCustomTheme", () => {
  it("copies colors and names the theme", () => {
    const theme = newCustomTheme(DEFAULT_THEME_COLORS, "Sunset");
    expect(theme.name).toBe("Sunset");
    expect(theme.id.startsWith("custom-")).toBe(true);
    expect(theme.colors).toEqual(DEFAULT_THEME_COLORS);
    theme.colors.accent = "#ffffff";
    expect(DEFAULT_THEME_COLORS.accent).toBe("#7b9ecf");
  });
});
