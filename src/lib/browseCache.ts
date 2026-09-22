import type { Track } from "./types";

const PAGE_CAP = 12;
const cache = new Map<string, Track[]>();

export function cacheKey(kind: "folder" | "playlist", id: string): string {
  return `${kind}:${id}`;
}

export function getCachedTracks(key: string): Track[] | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setCachedTracks(key: string, tracks: Track[]): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, tracks);
  while (cache.size > PAGE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function patchCachedTracks(tracks: Track[]): void {
  if (tracks.length === 0) return;
  const byPath = new Map(tracks.map((track) => [track.path, track]));
  for (const [key, page] of cache) {
    cache.set(
      key,
      page.map((track) => byPath.get(track.path) ?? track),
    );
  }
}

export function dropCachedTracks(key: string): void {
  cache.delete(key);
}
