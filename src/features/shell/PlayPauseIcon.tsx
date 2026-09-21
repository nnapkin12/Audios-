import { Pause, Play } from "lucide-react";

export function PlayPauseIcon({ playing, size }: { playing: boolean; size: number }) {
  const Icon = playing ? Pause : Play;
  return (
    <Icon
      key={playing ? "pause" : "play"}
      size={size}
      fill="currentColor"
      className="play-pause-icon"
    />
  );
}
