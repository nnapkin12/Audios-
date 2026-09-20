import type { ReactNode } from "react";
import {
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "@/lib/api";
import { displayArtist, displayTitle, formatTime } from "@/lib/format";
import type { RepeatMode } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export function NowPlayingBar() {
  const snapshot = useAppStore((state) => state.snapshot);
  const coverUrl = useAppStore((state) => state.coverUrl);
  const position = useAppStore((state) => state.positionMs);
  const duration = useAppStore((state) => state.durationMs);
  const setNowPlayingOpen = useAppStore((state) => state.setNowPlayingOpen);
  const current = snapshot?.current ?? null;
  const playing = snapshot?.playing ?? false;
  const volume = snapshot?.volume ?? 0.85;
  const muted = snapshot?.muted ?? false;
  const repeat = snapshot?.repeat ?? "off";
  const shuffle = snapshot?.shuffle ?? false;

  return (
    <footer className="grid h-[92px] shrink-0 grid-cols-[1fr_minmax(280px,2fr)_1fr] items-center gap-4 border-t-2 border-app-bar-line bg-app-bar px-4 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]">
      <button
        type="button"
        onClick={() => setNowPlayingOpen(true)}
        className="flex min-w-0 items-center gap-3 text-left"
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-app-hover">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-app-hover to-app" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-app-text">
            {current ? displayTitle(current.title, current.path) : "Nothing playing"}
          </p>
          <p className="truncate text-[13px] font-medium text-app-muted">
            {current ? displayArtist(current.artist, current.albumArtist) : "Nothing in Audios! yet"}
          </p>
        </div>
      </button>

      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <IconButton
            label="Shuffle"
            active={shuffle}
            onClick={() => void api.setShuffle(!shuffle).catch(() => undefined)}
          >
            <Shuffle size={15} />
          </IconButton>
          <IconButton label="Previous" onClick={() => void api.previous().catch(() => undefined)}>
            <SkipBack size={16} />
          </IconButton>
          <button
            type="button"
            title={playing ? "Pause" : "Play"}
            onClick={() => void api.toggle().catch(() => undefined)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-app-play text-app-play-fg transition-transform hover:scale-[1.03]"
          >
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
          <IconButton label="Next" onClick={() => void api.next().catch(() => undefined)}>
            <SkipForward size={16} />
          </IconButton>
          <IconButton
            label="Repeat"
            active={repeat !== "off"}
            onClick={() => void api.setRepeat(nextRepeat(repeat)).catch(() => undefined)}
          >
            {repeat === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
          </IconButton>
        </div>
        <div className="flex w-full max-w-[520px] items-center gap-2 text-[12px] font-semibold text-app-muted">
          <span className="w-10 text-right tabular-nums">{formatTime(position)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            value={Math.min(position, duration)}
            onChange={(event) => {
              void api.seek(Number(event.target.value)).catch(() => undefined);
            }}
            className="bar-range w-full"
          />
          <span className="w-10 tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <IconButton
          label={muted ? "Unmute" : "Mute"}
          onClick={() => void api.setMuted(!muted).catch(() => undefined)}
        >
          {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </IconButton>
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : Math.round(volume * 100)}
          onChange={(event) => {
            void api.setVolume(Number(event.target.value) / 100).catch(() => undefined);
          }}
          className="bar-range w-24"
        />
        <IconButton label="Fullscreen" onClick={() => setNowPlayingOpen(true)}>
          <Maximize2 size={16} />
        </IconButton>
      </div>
    </footer>
  );
}

function nextRepeat(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "all";
  if (mode === "all") return "one";
  return "off";
}

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        active ? "text-app-accent" : "text-app-subtle hover:text-app-text"
      }`}
    >
      {children}
    </button>
  );
}
