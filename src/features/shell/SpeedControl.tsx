import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(formatSpeed(speed));
  }, [speed]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

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

  const changed = Math.abs(speed - 1) > 0.001;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        title="Playback speed"
        aria-label="Playback speed"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`t-btn h-8 min-w-[3.25rem] rounded-md px-1.5 text-[12px] font-semibold tabular-nums ${
          changed ? "text-app-accent" : "text-app-muted hover:text-app-text"
        }`}
      >
        {formatSpeed(speed)}×
      </button>
      {open ? (
        <div className="absolute bottom-[calc(100%+8px)] right-0 z-20 flex items-center gap-1 rounded-lg border border-app-border bg-app-raised px-2 py-1.5 shadow-[0_12px_32px_rgb(0_0_0_/_0.35)]">
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
              if (event.key === "Enter") event.currentTarget.blur();
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
      ) : null}
    </div>
  );
}

function formatSpeed(speed: number): string {
  return speed.toFixed(2);
}
