import { api } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { cacheKey, dropCachedTracks, getCachedTracks, setCachedTracks } from "@/lib/browseCache";
import type { BrowsePage, Track } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export function filterTracks(tracks: Track[], query: string): Track[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tracks;
  return tracks.filter((track) => {
    const hay = [track.title, track.artist, track.albumArtist, track.album]
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  });
}

export function samePage(left: BrowsePage, right: BrowsePage): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "folder" && right.kind === "folder") return left.path === right.path;
  if (left.kind === "playlist" && right.kind === "playlist") return left.id === right.id;
  return left.kind === "home" && right.kind === "home";
}

export function invalidateBrowse(kind: "folder" | "playlist", id: string): void {
  dropCachedTracks(cacheKey(kind, id));
}

export async function openBrowsePage(page: BrowsePage, force = false): Promise<void> {
  const store = useAppStore.getState();
  store.setBrowse(page);
  store.setTab("player");
  if (page.kind === "home") {
    store.setPageTracks([]);
    store.setPageLoading(false);
    return;
  }

  const key = page.kind === "folder" ? cacheKey("folder", page.path) : cacheKey("playlist", page.id);
  const cached = force ? undefined : getCachedTracks(key);
  if (cached) {
    store.setPageTracks(cached);
    store.setPageLoading(false);
    return;
  }

  store.setPageTracks([]);
  store.setPageLoading(true);
  store.setStatus(null);
  try {
    const fast =
      page.kind === "folder"
        ? await api.scanTracks(page.path, true)
        : await api.scanPlaylist(page.id, true);
    if (!samePage(useAppStore.getState().browse, page)) return;
    store.setPageTracks(fast);

    const full =
      page.kind === "folder"
        ? await api.scanTracks(page.path, false)
        : await api.scanPlaylist(page.id, false);
    if (!samePage(useAppStore.getState().browse, page)) return;
    setCachedTracks(key, full);
    store.setPageTracks(full);
  } catch (error) {
    if (samePage(useAppStore.getState().browse, page)) {
      store.setStatus(errorMessage(error, "Could not open that library"));
      store.setPageTracks([]);
    }
  } finally {
    if (samePage(useAppStore.getState().browse, page)) {
      store.setPageLoading(false);
    }
  }
}
