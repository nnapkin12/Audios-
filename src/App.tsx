import { useEffect } from "react";
import { NowPlayingBar } from "@/features/shell/NowPlayingBar";
import { NowPlayingFull } from "@/features/shell/NowPlayingFull";
import { Sidebar } from "@/features/shell/Sidebar";
import { Titlebar } from "@/features/shell/Titlebar";
import { PlayerView } from "@/features/player/PlayerView";
import { SearchView } from "@/features/search/SearchView";
import { SettingsView } from "@/features/settings/SettingsView";
import { TagsView } from "@/features/tags/TagsView";
import { api, isTauri, listen } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { applyAppearance } from "@/lib/theme";
import type { PlayerSnapshot, Tick } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export default function App() {
  const tab = useAppStore((state) => state.tab);
  const status = useAppStore((state) => state.status);
  const statusTone = useAppStore((state) => state.statusTone);
  const nowPlayingOpen = useAppStore((state) => state.nowPlayingOpen);
  const applySnapshot = useAppStore((state) => state.applySnapshot);
  const applyTick = useAppStore((state) => state.applyTick);
  const setStatus = useAppStore((state) => state.setStatus);
  const setNowPlayingOpen = useAppStore((state) => state.setNowPlayingOpen);
  const setPlaylists = useAppStore((state) => state.setPlaylists);
  const setLibraryRoots = useAppStore((state) => state.setLibraryRoots);
  const setAppearance = useAppStore((state) => state.setAppearance);

  useEffect(() => {
    if (!isTauri()) {
      applyAppearance("dusk", "blue");
      setStatus("Preview only. Run npm run tauri dev for playback and tags in Audios!.", "info");
      return;
    }
    let disposed = false;
    const stop: Array<() => void> = [];

    void (async () => {
      try {
        const [snapshot, playlists, appearance, roots] = await Promise.all([
          api.state(),
          api.listPlaylists(),
          api.getAppearance(),
          api.listLibraryRoots(),
        ]);
        if (disposed) return;
        applySnapshot(snapshot);
        setPlaylists(playlists);
        setLibraryRoots(roots);
        setAppearance(appearance.theme, appearance.accent, appearance.customThemes ?? []);
      } catch (error) {
        if (!disposed) {
          applyAppearance("dusk", "blue");
          setStatus(errorMessage(error, "Could not load player"));
        }
      }
      stop.push(await listen<PlayerSnapshot>("player://state", applySnapshot));
      stop.push(await listen<Tick>("player://tick", applyTick));
    })();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNowPlayingOpen(false);
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        void api.toggle();
      }
      if (event.key === "f") setNowPlayingOpen(true);
      if (event.key === "ArrowRight") void api.seek((useAppStore.getState().snapshot?.positionMs ?? 0) + 5000);
      if (event.key === "ArrowLeft") void api.seek(Math.max(0, (useAppStore.getState().snapshot?.positionMs ?? 0) - 5000));
      if (event.key === "n") void api.next();
      if (event.key === "p") void api.previous();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      disposed = true;
      stop.forEach((fn) => fn());
      window.removeEventListener("keydown", onKey);
    };
  }, [applySnapshot, applyTick, setAppearance, setLibraryRoots, setNowPlayingOpen, setPlaylists, setStatus]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app">
      <Titlebar />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className={tab === "player" ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
            <PlayerView />
          </div>
          <div className={tab === "search" ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
            <SearchView />
          </div>
          <div className={tab === "tags" ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
            <TagsView />
          </div>
          <div className={tab === "settings" ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
            <SettingsView />
          </div>
          {status ? (
            <p
              className={`shrink-0 border-t border-app-line px-4 py-1.5 text-[13px] font-semibold ${
                statusTone === "info" ? "text-app-muted" : "text-app-danger"
              }`}
            >
              {status}
            </p>
          ) : null}
        </main>
        {nowPlayingOpen ? <NowPlayingFull /> : null}
      </div>
      {nowPlayingOpen ? null : <NowPlayingBar />}
    </div>
  );
}
