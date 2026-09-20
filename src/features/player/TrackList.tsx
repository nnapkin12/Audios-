import type { MouseEvent } from "react";
import { CoverThumb } from "@/lib/covers";
import { displayArtist, displayTitle, formatTime } from "@/lib/format";
import { VirtualList } from "@/lib/virtualList";
import type { Track } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const ROW = 58;

export function TrackList({
  tracks,
  onPlay,
  onContext,
}: {
  tracks: Track[];
  onPlay: (track: Track, index: number) => void;
  onContext: (event: MouseEvent, track: Track, index: number) => void;
}) {
  const currentPath = useAppStore((state) => state.snapshot?.current?.path ?? null);

  if (tracks.length === 0) return null;

  return (
    <VirtualList
      items={tracks}
      rowHeight={ROW}
      className="min-h-0 flex-1 overflow-auto"
      getKey={(track, index) => `${track.path}:${index}`}
      renderRow={(track, index) => {
        const active = track.path === currentPath;
        return (
          <button
            type="button"
            onClick={() => onPlay(track, index)}
            onContextMenu={(event) => onContext(event, track, index)}
            className={`flex h-full w-full items-center gap-3 px-5 text-left transition-colors ${
              active ? "bg-app-hover" : "hover:bg-app-hover/70"
            }`}
          >
            <CoverThumb path={track.path} className="h-11 w-11 rounded-md" />
            <span className="w-7 shrink-0 text-right text-[13px] font-semibold tabular-nums text-app-muted">
              {track.track ?? index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-app-text">
                {displayTitle(track.title, track.path)}
              </span>
              <span className="block truncate text-[13px] font-medium text-app-muted">
                {displayArtist(track.artist, track.albumArtist)}
                {track.album ? `  ·  ${track.album}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-app-muted">
              {formatTime(track.durationMs)}
            </span>
          </button>
        );
      }}
    />
  );
}
