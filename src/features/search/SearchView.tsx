import { useState, type FormEvent, type MouseEvent } from "react";
import { Download, Play, Search } from "lucide-react";
import { api, openExternal, pickSavePath } from "@/lib/api";
import { errorMessage, safeFileName } from "@/lib/format";
import type { MediaHit } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export function SearchView() {
  const setStatus = useAppStore((state) => state.setStatus);
  const applySnapshot = useAppStore((state) => state.applySnapshot);
  const currentTitle = useAppStore((state) => state.snapshot?.current?.title ?? "");
  const playing = useAppStore((state) => state.snapshot?.playing ?? false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    const next = query.trim();
    if (!next) return;
    setLoading(true);
    setStatus(null);
    try {
      setResults(await api.searchMedia(next));
    } catch (error) {
      setResults([]);
      setStatus(errorMessage(error, "Search failed"));
    } finally {
      setLoading(false);
    }
  }

  async function playHit(hit: MediaHit) {
    setPlayingUrl(hit.url);
    setStatus("Getting audio…", "info");
    try {
      applySnapshot(await api.playMedia(hit.title, hit.url, hit.pageUrl));
      setStatus(null);
    } catch (error) {
      setPlayingUrl(null);
      setStatus(errorMessage(error, "Could not play"));
    }
  }

  async function playFirst() {
    const next = query.trim();
    if (!next) return;
    setLoading(true);
    setStatus(null);
    try {
      const hit = await api.searchStream(next);
      setResults([hit]);
      await playHit(hit);
    } catch (error) {
      setStatus(errorMessage(error, "Could not play"));
    } finally {
      setLoading(false);
    }
  }

  async function downloadHit(event: MouseEvent, hit: MediaHit) {
    event.preventDefault();
    event.stopPropagation();
    const dest = await pickSavePath(safeFileName(hit.title), "Save audio");
    if (!dest) return;
    setSavingUrl(hit.url);
    setStatus(null);
    try {
      await api.saveMedia(hit.url, dest, hit.pageUrl);
    } catch (error) {
      setStatus(errorMessage(error, "Could not save"));
    } finally {
      setSavingUrl(null);
    }
  }

  return (
    <section className="min-h-0 flex-1 overflow-auto px-8 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Search</h1>
          <p className="mt-1 text-[14px] font-medium text-app-muted">
            Search lists YouTube titles and watch URLs. Play downloads a temp audio file and
            deletes it when the track changes. Download keeps a copy.
          </p>
        </div>

        <form onSubmit={(event) => void onSearch(event)} className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Song, artist, or link"
              autoFocus
              className="w-full rounded-lg border border-app-border bg-app-raised py-2.5 pl-9 pr-3 text-[15px] text-app-text"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded-lg border border-app-border px-4 py-2 text-[14px] font-semibold text-app-subtle hover:bg-app-hover disabled:opacity-50"
          >
            {loading ? "Searching" : "Search"}
          </button>
          <button
            type="button"
            disabled={loading || !query.trim()}
            onClick={() => void playFirst()}
            className="rounded-lg bg-app-play px-4 py-2 text-[14px] font-semibold text-app-play-fg disabled:opacity-50"
          >
            Play
          </button>
        </form>

        {results.length === 0 && !loading ? (
          <p className="text-[15px] text-app-subtle">
            Type a search and press Enter for results, or Play to start the first match.
          </p>
        ) : null}

        <ul className="flex flex-col gap-1">
          {results.map((hit) => {
            const fetching = playingUrl === hit.url && !playing;
            const active = playing && currentTitle === hit.title;
            return (
              <li key={`${hit.title}:${hit.url}`}>
                <div
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 ${
                    fetching || active ? "bg-app-hover" : "hover:bg-app-hover/70"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1">
                    <button
                      type="button"
                      onClick={() => void playHit(hit)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-app-raised text-app-text"
                    >
                      <Play size={16} fill="currentColor" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => void playHit(hit)}
                        className="block w-full truncate text-left text-[15px] font-semibold text-app-text"
                      >
                        {hit.title}
                      </button>
                      <span className="block truncate text-[13px] font-medium text-app-muted">
                        {fetching ? "Getting audio…" : active ? "Playing" : "Play"}
                      </span>
                      <button
                        type="button"
                        title="Open source"
                        onClick={() => void openExternal(sourceUrl(hit))}
                        className="mt-0.5 block w-full truncate text-left text-[12px] font-medium text-app-accent hover:underline"
                      >
                        {sourceUrl(hit)}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    title="Download"
                    aria-label={`Download ${hit.title}`}
                    disabled={savingUrl === hit.url}
                    onClick={(event) => void downloadHit(event, hit)}
                    className="mr-1 flex h-10 w-10 items-center justify-center rounded-md text-app-muted hover:bg-app-raised hover:text-app-text disabled:opacity-50"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function sourceUrl(hit: MediaHit): string {
  return hit.pageUrl || hit.url;
}
