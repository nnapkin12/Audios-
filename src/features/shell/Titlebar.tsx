import { windowAction } from "@/lib/api";

export function Titlebar() {
  return (
    <header
      data-tauri-drag-region
      className="drag-region flex h-10 shrink-0 items-center justify-between border-b border-app-line bg-app-raised px-3"
    >
      <div className="no-drag flex items-center gap-2">
        <Traffic color="#c97a7a" label="Close" onClick={() => void windowAction("close")} />
        <Traffic color="#c9b27a" label="Minimize" onClick={() => void windowAction("minimize")} />
        <Traffic
          color="#8aa37a"
          label="Maximize"
          onClick={() => void windowAction("toggleMaximize")}
        />
      </div>
      <p
        data-tauri-drag-region
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[14px] font-semibold text-app-subtle"
      >
        Audios!
      </p>
      <div className="w-[52px]" />
    </header>
  );
}

function Traffic({
  color,
  label,
  onClick,
}: {
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="h-[12px] w-[12px] rounded-full border border-black/20 transition-opacity hover:opacity-80"
      style={{ background: color }}
    />
  );
}
