import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export function applyMotion(minimize: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.motion = minimize ? "min" : "full";
}

export function useSmoothPosition(playing: boolean): number {
  const tick = useAppStore((state) => state.positionMs);
  const duration = useAppStore((state) => state.durationMs);
  const minimize = useAppStore((state) => state.minimizeMovement);
  const trackPath = useAppStore((state) => state.snapshot?.current?.path ?? null);
  const [shown, setShown] = useState(tick);
  const origin = useRef({ pos: tick, at: 0 });

  useEffect(() => {
    origin.current = { pos: tick, at: performance.now() };
    setShown(tick);
  }, [tick, duration, trackPath]);

  useEffect(() => {
    if (
      !playing ||
      minimize ||
      duration <= 0 ||
      (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      return;
    }
    let id = 0;
    const step = () => {
      setShown(Math.min(duration, origin.current.pos + (performance.now() - origin.current.at)));
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [playing, minimize, duration, tick]);

  if (!playing || minimize || duration <= 0) return tick;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return tick;
  }
  return shown;
}
