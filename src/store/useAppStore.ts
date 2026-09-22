import { create } from "zustand";
import { api } from "@/lib/api";
import { pictureSrc } from "@/lib/format";
import { applyAppearance, type CustomTheme } from "@/lib/theme";
import { applyMotion } from "@/lib/motion";
import type { BrowsePage, MissingItem, Playlist, PlayerSnapshot, Tick, Track } from "@/lib/types";

export type AppTab = "player" | "search" | "tags" | "settings";
export type StatusTone = "error" | "info";

interface AppState {
  tab: AppTab;
  nowPlayingOpen: boolean;
  snapshot: PlayerSnapshot | null;
  coverUrl: string | null;
  status: string | null;
  statusTone: StatusTone;
  playlists: Playlist[];
  libraryRoots: string[];
  missing: MissingItem[];
  browse: BrowsePage;
  pageTracks: Track[];
  pageLoading: boolean;
  positionMs: number;
  durationMs: number;
  theme: string;
  accent: string;
  customThemes: CustomTheme[];
  minimizeMovement: boolean;
  tagFocusPath: string | null;
  setTab: (tab: AppTab) => void;
  setNowPlayingOpen: (open: boolean) => void;
  setStatus: (status: string | null, tone?: StatusTone) => void;
  setPlaylists: (playlists: Playlist[]) => void;
  setLibraryRoots: (roots: string[]) => void;
  setMissing: (missing: MissingItem[]) => void;
  setBrowse: (browse: BrowsePage) => void;
  setPageTracks: (tracks: Track[]) => void;
  setPageLoading: (loading: boolean) => void;
  setTagFocusPath: (path: string | null) => void;
  setAppearance: (theme: string, accent: string, customThemes?: CustomTheme[]) => void;
  setMinimizeMovement: (enabled: boolean) => void;
  applySnapshot: (snapshot: PlayerSnapshot) => void;
  applyTick: (tick: Tick) => void;
  refreshCover: (path: string | null) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  tab: "player",
  nowPlayingOpen: false,
  snapshot: null,
  coverUrl: null,
  status: null,
  statusTone: "error",
  playlists: [],
  libraryRoots: [],
  missing: [],
  browse: { kind: "home" },
  pageTracks: [],
  pageLoading: false,
  positionMs: 0,
  durationMs: 0,
  theme: "dusk",
  accent: "blue",
  customThemes: [],
  minimizeMovement: false,
  tagFocusPath: null,
  setTab: (tab) => set({ tab }),
  setNowPlayingOpen: (nowPlayingOpen) => {
    set({ nowPlayingOpen });
    if (nowPlayingOpen) {
      void get().refreshCover(get().snapshot?.current?.path ?? null);
    }
  },
  setStatus: (status, tone = "error") =>
    set({ status, statusTone: status ? tone : "error" }),
  setPlaylists: (playlists) => set({ playlists }),
  setLibraryRoots: (libraryRoots) => set({ libraryRoots }),
  setMissing: (missing) => set({ missing }),
  setBrowse: (browse) => set({ browse }),
  setPageTracks: (pageTracks) => set({ pageTracks }),
  setPageLoading: (pageLoading) => set({ pageLoading }),
  setTagFocusPath: (tagFocusPath) => set({ tagFocusPath }),
  setAppearance: (theme, accent, customThemes) => {
    const nextThemes = customThemes ?? get().customThemes;
    applyAppearance(theme, accent, nextThemes);
    set({ theme, accent, customThemes: nextThemes });
  },
  setMinimizeMovement: (enabled) => {
    applyMotion(enabled);
    set({ minimizeMovement: enabled });
  },
  applySnapshot: (snapshot) => {
    const previous = get().snapshot?.current?.path ?? null;
    const prevEq = get().snapshot?.eq;
    const eq = snapshot.eq
      ? {
          ...snapshot.eq,
          builtins:
            snapshot.eq.builtins.length > 0
              ? snapshot.eq.builtins
              : (prevEq?.builtins ?? []),
        }
      : snapshot.eq;
    set({
      snapshot: { ...snapshot, eq },
      status: snapshot.error,
      statusTone: "error",
      positionMs: snapshot.positionMs,
      durationMs: snapshot.durationMs,
    });
    const next = snapshot.current?.path ?? null;
    if (next !== previous) {
      if (get().nowPlayingOpen) void get().refreshCover(next);
      else set({ coverUrl: null });
    }
  },
  applyTick: (tick) => {
    set({
      positionMs: tick.positionMs,
      durationMs: tick.durationMs || get().durationMs,
    });
  },
  refreshCover: async (path) => {
    if (!path) {
      set({ coverUrl: null });
      return;
    }
    try {
      const cover = await api.coverArt(path);
      set({
        coverUrl: cover ? pictureSrc(cover.mime, cover.dataBase64) : null,
      });
    } catch {
      set({ coverUrl: null });
    }
  },
}));
