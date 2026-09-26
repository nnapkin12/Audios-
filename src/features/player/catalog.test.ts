import { describe, expect, it } from "vitest";
import { buildCatalog, filterArtists, primaryArtist, soloArtists } from "./catalog";
import type { Track } from "@/lib/types";

function track(partial: Partial<Track> & Pick<Track, "path">): Track {
  return {
    title: partial.path,
    artist: "",
    album: "",
    albumArtist: "",
    track: null,
    disc: null,
    durationMs: 0,
    folder: "",
    replaygainTrack: null,
    replaygainAlbum: null,
    ...partial,
  };
}

describe("buildCatalog", () => {
  it("groups artists and albums from tags", () => {
    const { artists, untagged } = buildCatalog([
      track({ path: "a", artist: "Ada", album: "First", track: 1 }),
      track({ path: "b", artist: "ada", album: "First", track: 2 }),
      track({ path: "c", artist: "Ada", album: "Second" }),
      track({ path: "d", artist: "Bea" }),
      track({ path: "e", title: "loose" }),
    ]);

    expect(untagged).toBe(1);
    expect(artists.map((artist) => artist.name)).toEqual(["Ada", "Bea"]);
    expect(artists[0].tracks).toHaveLength(3);
    expect(artists[0].albums.map((album) => album.name)).toEqual(["First", "Second"]);
    expect(artists[0].albums[0].tracks.map((item) => item.path)).toEqual(["a", "b"]);
    expect(artists[1].albums).toEqual([]);
  });

  it("files a feature under the first credited artist", () => {
    expect(soloArtists("Ada feat. Bea")).toEqual(["Ada", "Bea"]);
    expect(primaryArtist("Ada feat. Bea")).toBe("Ada");
    expect(primaryArtist("Bea & Ada")).toBe("Bea");
    expect(primaryArtist("Tyler, The Creator")).toBe("Tyler, The Creator");

    const { artists } = buildCatalog([
      track({ path: "a", artist: "Ada feat. Bea", album: "First" }),
      track({ path: "b", artist: "Ada" }),
      track({ path: "c", artist: "Bea & Ada" }),
    ]);

    expect(artists.map((artist) => artist.name)).toEqual(["Ada", "Bea"]);
    expect(artists[0].tracks.map((item) => item.path)).toEqual(["a", "b"]);
    expect(artists[1].tracks.map((item) => item.path)).toEqual(["c"]);
  });

  it("counts one spelling of an artist once", () => {
    const { artists } = buildCatalog([
      track({ path: "a", artist: "yhapojj" }),
      track({ path: "b", artist: "Yhapojj" }),
      track({ path: "c", artist: "yhapojj feat. Bea" }),
      track({ path: "d", artist: "yhapojj (feat. Co)" }),
      track({ path: "e", artist: "yhapojj/Bea" }),
    ]);
    expect(artists.map((artist) => artist.name)).toEqual(["yhapojj"]);
  });

  it("finds an artist inside the catalog already built", () => {
    const { artists } = buildCatalog(
      Array.from({ length: 200 }, (_, index) =>
        track({ path: `ada-${index}`, artist: "Ada", album: "First", track: index + 1 }),
      ).concat([track({ path: "bea", artist: "Bea", album: "Other" })]),
    );
    expect(artists[0].tracks).toHaveLength(200);
    expect(filterArtists(artists, "  ADA ").map((artist) => artist.name)).toEqual(["Ada"]);
    expect(filterArtists(artists, "zzz")).toEqual([]);
    expect(filterArtists(artists, "")).toHaveLength(2);
  });
});
