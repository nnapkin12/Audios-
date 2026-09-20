import { ChevronDown, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { api } from "@/lib/api";
import { displayArtist, displayTitle, formatTime } from "@/lib/format";
import type { RepeatMode } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export function NowPlayingFull() {
  const snapshot = useAppStore((state) => state.snapshot);
  const coverUrl = useAppStore((state) => state.coverUrl);
  const position = useAppStore((state) => state.positionMs);
  const duration = useAppStore((state) => state.durationMs);
  const setNowPlayingOpen = useAppStore((state) => state.setNowPlayingOpen);
  const current = snapshot?.current ?? null;
  const playing = snapshot?.playing ?? false;
  const repeat = snapshot?.repeat ?? "off";
  const shuffle = snapshot?.shuffle ?? false;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-app">
      <div className="flex items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => setNowPlayingOpen(false)}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-[15px] font-semibold text-app-subtle hover:bg-app-hover"
        >
          <ChevronDown size={22} />
          Now playing
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pb-10">
        <div className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-app-hover shadow-[0_18px_50px_rgb(0_0_0_/_0.28)]">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="aspect-square w-full bg-gradient-to-br from-app-hover to-app" />
          )}
        </div>

        <div className="mt-8 w-full max-w-[560px] text-center">
          <h1 className="truncate text-[28px] font-semibold tracking-tight">
            {current ? displayTitle(current.title, current.path) : "Nothing playing"}
          </h1>
          <p className="mt-2 truncate text-[17px] font-medium text-app-muted">
            {current
              ? `${displayArtist(current.artist, current.albumArtist)}${current.album ? `  ·  ${current.album}` : ""}`
              : "Open a file or folder"}
          </p>
        </div>

        <div className="mt-8 flex w-full max-w-[560px] items-center gap-3 text-[13px] font-semibold text-app-muted">
          <span className="w-12 text-right tabular-nums">{formatTime(position)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            value={Math.min(position, duration)}
            onChange={(event) => void api.seek(Number(event.target.value))}
            className="w-full"
          />
          <span className="w-12 tabular-nums">{formatTime(duration)}</span>
        </div>

        <div className="mt-6 flex items-center gap-5">
          <button
            type="button"
            title="Shuffle"
            onClick={() => void api.setShuffle(!shuffle)}
            className={shuffle ? "text-app-accent" : "text-app-muted hover:text-app-text"}
          >
            <Shuffle size={22} />
          </button>
          <button
            type="button"
            title="Previous"
            onClick={() => void api.previous()}
            className="text-app-text"
          >
            <SkipBack size={28} fill="currentColor" />
          </button>
          <button
            type="button"
            title={playing ? "Pause" : "Play"}
            onClick={() => void api.toggle()}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-app-play text-app-play-fg"
          >
            {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </button>
          <button type="button" title="Next" onClick={() => void api.next()} className="text-app-text">
            <SkipForward size={28} fill="currentColor" />
          </button>
          <button
            type="button"
            title="Repeat"
            onClick={() => void api.setRepeat(nextRepeat(repeat))}
            className={repeat !== "off" ? "text-app-accent" : "text-app-muted hover:text-app-text"}
          >
            {repeat === "one" ? <Repeat1 size={22} /> : <Repeat size={22} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function nextRepeat(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "all";
  if (mode === "all") return "one";
  return "off";
}
