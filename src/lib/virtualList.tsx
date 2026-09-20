import { useEffect, useRef, useState, type ReactNode } from "react";

export function VirtualList<T>({
  items,
  rowHeight,
  overscan = 8,
  className,
  renderRow,
  getKey,
  onPointerLeave,
}: {
  items: T[];
  rowHeight: number;
  overscan?: number;
  className?: string;
  renderRow: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  onPointerLeave?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const frame = () => setHeight(node.clientHeight);
    frame();
    const observer = new ResizeObserver(frame);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil((height || 1) / rowHeight) + overscan * 2;
  const end = Math.min(items.length, start + visible);
  const slice = items.slice(start, end);

  return (
    <div
      ref={ref}
      className={className}
      onPointerLeave={onPointerLeave}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {slice.map((item, offset) => {
          const index = start + offset;
          return (
            <div
              key={getKey(item, index)}
              style={{
                position: "absolute",
                top: index * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
              }}
            >
              {renderRow(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
