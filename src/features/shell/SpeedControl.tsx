import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
export const SPEED_STEP = 0.05;

export function SpeedControl() {
  const speed = useAppStore((state) => state.snapshot?.speed ?? 1);
  const setStatus = useAppStore((state) => state.setStatus);
  const applySnapshot = useAppStore((state) => state.applySnapshot);
  const [draft, setDraft] = useState(formatSpeed(speed));

  useEffect(() => {
    setDraft(formatSpeed(speed));
  }, [speed]);

  async function commit(next: number) {
    if (!Number.isFinite(next)) {
      setDraft(formatSpeed(speed));
      return;
    }
    try {
      applySnapshot(await api.setSpeed(next));
    } catch (error) {
      setDraft(formatSpeed(speed));
      setStatus(errorMessage(error, "Couldn't change speed"));
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Slower"
        aria-label="Slower"
        disabled={speed <= SPEED_MIN + 0.001}
        onClick={() => void commit(speed - SPEED_STEP)}
        className="t-btn h-7 w-7 rounded-md text-[16px] font-semibold text-app-muted hover:text-app-text disabled:opacity-40"
      >
        −
      </button>
      <input
        aria-label="Playback speed"
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit(Number(draft))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="w-14 rounded-md border border-app-border bg-app px-1 py-0.5 text-center text-[13px] font-semibold tabular-nums text-app-text"
      />
      <button
        type="button"
        title="Faster"
        aria-label="Faster"
        disabled={speed >= SPEED_MAX - 0.001}
        onClick={() => void commit(speed + SPEED_STEP)}
        className="t-btn h-7 w-7 rounded-md text-[16px] font-semibold text-app-muted hover:text-app-text disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function formatSpeed(speed: number): string {
  return speed.toFixed(2);
}
