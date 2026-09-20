import { useEffect, useRef, useState } from "react";

export type MenuAction = {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export type MenuEntry =
  | { kind: "action"; action: MenuAction }
  | { kind: "submenu"; label: string; actions: MenuAction[] }
  | { kind: "sep" };

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 16 - items.length * 32);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] rounded-lg border border-app-border bg-app-raised py-1 shadow-[0_12px_32px_rgb(0_0_0_/_0.35)]"
      style={{ left, top }}
    >
      {items.map((item, index) => {
        if (item.kind === "sep") {
          return <div key={`sep-${index}`} className="my-1 h-px bg-app-line" />;
        }
        if (item.kind === "submenu") {
          return (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => setOpenSub(item.label)}
              onMouseLeave={() => setOpenSub(null)}
            >
              <div className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] font-semibold text-app-text hover:bg-app-hover">
                <span>{item.label}</span>
                <span className="text-app-muted">›</span>
              </div>
              {openSub === item.label ? (
                <div className="absolute left-full top-0 z-10 ml-1 min-w-[160px] rounded-lg border border-app-border bg-app-raised py-1 shadow-lg">
                  {item.actions.length === 0 ? (
                    <p className="px-3 py-1.5 text-[13px] text-app-muted">No playlists yet</p>
                  ) : (
                    item.actions.map((action) => (
                      <MenuButton key={action.label} action={action} onClose={onClose} />
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        }
        return <MenuButton key={item.action.label} action={item.action} onClose={onClose} />;
      })}
    </div>
  );
}

function MenuButton({ action, onClose }: { action: MenuAction; onClose: () => void }) {
  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={() => {
        if (action.disabled) return;
        action.onClick();
        onClose();
      }}
      className={`block w-full px-3 py-1.5 text-left text-[13px] font-semibold disabled:opacity-40 ${
        action.danger ? "text-app-danger hover:bg-app-hover" : "text-app-text hover:bg-app-hover"
      }`}
    >
      {action.label}
    </button>
  );
}
