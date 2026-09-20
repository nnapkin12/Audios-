import type { Track } from "./types";

const cache = new Map<string, Track[]>();

export function cacheKey(kind: "folder" | "playlist", id: string): string {
  return `${kind}:${id}`;
}

export function getCachedTracks(key: string): Track[] | undefined {
  return cache.get(key);
}

export function setCachedTracks(key: string, tracks: Track[]): void {
  cache.set(key, tracks);
}

export function dropCachedTracks(key: string): void {
  cache.delete(key);
}
