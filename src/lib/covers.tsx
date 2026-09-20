import { useEffect, useRef, useState } from "react";
import { ListMusic } from "lucide-react";
import { api, isTauri } from "./api";
import { pictureSrc } from "./format";

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

export function cachedCover(path: string): string | null | undefined {
  return cache.has(path) ? cache.get(path) ?? null : undefined;
}

export function loadCoverThumb(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = inflight.get(path);
  if (pending) return pending;
  if (!isTauri()) {
    cache.set(path, null);
    return Promise.resolve(null);
  }
  const request = api
    .coverThumb(path)
    .then((cover) => {
      const url = cover ? pictureSrc(cover.mime, cover.dataBase64) : null;
      cache.set(path, url);
      return url;
    })
    .catch(() => {
      cache.set(path, null);
      return null;
    })
    .finally(() => {
      inflight.delete(path);
    });
  inflight.set(path, request);
  return request;
}

export function CoverThumb({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null | undefined>(() => cachedCover(path));

  useEffect(() => {
    setSrc(cachedCover(path));
  }, [path]);

  useEffect(() => {
    if (src !== undefined) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void loadCoverThumb(path).then(setSrc);
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [path, src]);

  return (
    <div
      ref={ref}
      className={`shrink-0 overflow-hidden rounded bg-app-hover ${className ?? "h-10 w-10"}`}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-app-hover to-app" />
      )}
    </div>
  );
}

const playlistCache = new Map<string, string | null>();
const playlistInflight = new Map<string, Promise<string | null>>();

export function dropPlaylistCover(id: string): void {
  playlistCache.delete(id);
}

function loadPlaylistCover(id: string): Promise<string | null> {
  const hit = playlistCache.get(id);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = playlistInflight.get(id);
  if (pending) return pending;
  if (!isTauri()) {
    playlistCache.set(id, null);
    return Promise.resolve(null);
  }
  const request = api
    .playlistCover(id)
    .then((cover) => {
      const url = cover ? pictureSrc(cover.mime, cover.dataBase64) : null;
      playlistCache.set(id, url);
      return url;
    })
    .catch(() => {
      playlistCache.set(id, null);
      return null;
    })
    .finally(() => {
      playlistInflight.delete(id);
    });
  playlistInflight.set(id, request);
  return request;
}

export function PlaylistCover({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null | undefined>(() =>
    playlistCache.has(id) ? playlistCache.get(id) ?? null : undefined,
  );

  useEffect(() => {
    setSrc(playlistCache.has(id) ? playlistCache.get(id) ?? null : undefined);
  }, [id]);

  useEffect(() => {
    if (src !== undefined) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void loadPlaylistCover(id).then(setSrc);
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [id, src]);

  return (
    <div
      ref={ref}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-app-hover ${className ?? "h-10 w-10"}`}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <ListMusic size={16} className="text-app-accent" />
      )}
    </div>
  );
}
