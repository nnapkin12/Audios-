import { describe, expect, it } from "vitest";
import {
  baseName,
  displayTitle,
  errorMessage,
  formatBytes,
  formatTime,
  safeFileName,
} from "./format";

describe("formatTime", () => {
  it("formats minutes and seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65_000)).toBe("1:05");
    expect(formatTime(3_661_000)).toBe("1:01:01");
  });

  it("guards bad values", () => {
    expect(formatTime(Number.NaN)).toBe("0:00");
    expect(formatTime(-12)).toBe("0:00");
  });
});

describe("formatBytes", () => {
  it("uses readable units", () => {
    expect(formatBytes(800)).toBe("800 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});

describe("displayTitle", () => {
  it("falls back to the file stem", () => {
    expect(displayTitle("", "/music/Album/04 - Hello.flac")).toBe("04 - Hello");
  });
});

describe("baseName", () => {
  it("keeps the last path segment", () => {
    expect(baseName("/home/me/Music")).toBe("Music");
    expect(baseName("C:\\Albums\\Live")).toBe("Live");
  });
});

describe("safeFileName", () => {
  it("strips path characters", () => {
    expect(safeFileName("Artist / Title: Live?")).toBe("Artist Title Live");
    expect(safeFileName("   ")).toBe("audio");
  });
});

describe("errorMessage", () => {
  it("keeps Tauri string payloads", () => {
    expect(errorMessage("yt-dlp is required for search", "Could not play")).toBe(
      "yt-dlp is required for search",
    );
    expect(errorMessage(new Error("cannot decode x.webm"), "Could not play")).toBe(
      "cannot decode x.webm",
    );
    expect(errorMessage({}, "Could not play")).toBe("Could not play");
  });
});
