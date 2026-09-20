import { describe, expect, it } from "vitest";
import {
  hexToRgb,
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
