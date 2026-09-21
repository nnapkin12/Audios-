import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Save, Search, Trash2, Upload, X } from "lucide-react";
import { api, isTauri, pickAudioFile, pickFolder, pickSavePath } from "@/lib/api";
import { displayTitle, errorMessage, formatBytes, formatTime, pictureSrc } from "@/lib/format";
import {
  COMMON_FIELDS,
  EMPTY_FIELDS,
  EXTENDED_FIELDS,
  type MediaHit,
  type TagDoc,
  type TagFields,
} from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export function TagsView() {
  const snapshot = useAppStore((state) => state.snapshot);
  const setStatus = useAppStore((state) => state.setStatus);
  const tagFocusPath = useAppStore((state) => state.tagFocusPath);
  const setTagFocusPath = useAppStore((state) => state.setTagFocusPath);
  const [doc, setDoc] = useState<TagDoc | null>(null);
  const [fields, setFields] = useState<TagFields>(EMPTY_FIELDS);
  const [paths, setPaths] = useState<string[]>([]);
  const [apply, setApply] = useState<string[]>([]);
  const [customKey, setCustomKey] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [pictureKind, setPictureKind] = useState("front");
  const [busy, setBusy] = useState(false);
  const [coverHits, setCoverHits] = useState<MediaHit[]>([]);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverApplying, setCoverApplying] = useState<string | null>(null);
  const coverReq = useRef(0);
  const [dropHot, setDropHot] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const dropLock = useRef(0);
  const dropHotRef = useRef(false);

  const dirty = useMemo(
    () => JSON.stringify(normalize(doc)) !== JSON.stringify(fields),
    [doc, fields],
  );

  async function loadPath(path: string) {
    setBusy(true);
    coverReq.current += 1;
    setCoverHits([]);
    setCoverApplying(null);
    try {
      const next = await api.readTags(path);
      setDoc(next);
      setFields(normalize(next));
      setPaths((current) => (current.includes(path) ? current : [path, ...current]));
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error, "Could not read tags"));
    } finally {
      setBusy(false);
    }
  }

  async function searchCovers() {
    if (!doc) return;
    const query = coverQuery(fields, doc.path);
    if (!query) return;
    const gen = ++coverReq.current;
    setCoverLoading(true);
    setStatus(null);
    try {
      const hits = (await api.searchCovers(query)).slice(0, 4);
      if (gen !== coverReq.current) return;
      setCoverHits(hits);
      if (hits.length === 0) setStatus("No artwork found");
    } catch (error) {
      if (gen !== coverReq.current) return;
      setCoverHits([]);
      setStatus(errorMessage(error, "Couldn't find artwork"));
    } finally {
      if (gen === coverReq.current) setCoverLoading(false);
    }
  }

  async function useCover(hit: MediaHit) {
    if (!doc || !hit.thumbnailUrl) return;
    setCoverApplying(hit.url);
    setBusy(true);
    try {
      const next = await api.addCoverFromUrl(doc.path, hit.thumbnailUrl, pictureKind);
      setDoc(next);
      setStatus("Artwork added", "info");
    } catch (error) {
      setStatus(errorMessage(error, "Couldn't add artwork"));
    } finally {
      setCoverApplying(null);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!tagFocusPath) return;
    void loadPath(tagFocusPath);
    setTagFocusPath(null);
  }, [tagFocusPath, setTagFocusPath]);

  async function openFile() {
    const path = await pickAudioFile("Open file");
    if (path) await loadPath(path);
  }

  async function openFolder() {
    const folder = await pickFolder("Open folder");
    if (!folder) return;
    setBusy(true);
    try {
      const listed = await api.listAudioPaths(folder);
      if (listed.length === 0) {
        setStatus("No audio files in that folder");
        return;
      }
      setPaths(listed);
      await loadPath(listed[0]);
    } catch (error) {
      setStatus(errorMessage(error, "Could not open folder"));
    } finally {
      setBusy(false);
    }
  }

  async function loadDropped(paths: string[]) {
    const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
    if (unique.length === 0) return;
    setBusy(true);
    try {
      const listed: string[] = [];
      for (const path of unique) {
        listed.push(...(await api.listAudioPaths(path)));
      }
      const next = [...new Set(listed)];
      if (next.length === 0) {
        setStatus("No audio files in that drop");
        return;
      }
      setPaths((current) => {
        const merged = [...current];
        for (const path of next) {
          if (!merged.includes(path)) merged.push(path);
        }
        return merged;
      });
      await loadPath(next[0]);
    } catch (error) {
      setStatus(errorMessage(error, "Could not open dropped files"));
    } finally {
      setBusy(false);
    }
  }

  function setHot(value: boolean) {
    dropHotRef.current = value;
    setDropHot(value);
  }

  function takeDrop(paths: string[]) {
    const now = Date.now();
    if (now - dropLock.current < 400) return;
    dropLock.current = now;
    setHot(false);
    void loadDropped(paths);
  }

  useEffect(() => {
    if (doc || !isTauri()) return;
    let gone = false;
    let stop: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (gone) return;
        const payload = event.payload;
        const zone = zoneRef.current;
        if (payload.type === "leave") {
          setHot(false);
          return;
        }
        if (!zone) return;
        if (payload.type === "over" || payload.type === "enter") {
          const box = zone.getBoundingClientRect();
          const scale = window.devicePixelRatio || 1;
          const x = payload.position.x / scale;
          const y = payload.position.y / scale;
          setHot(x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
          return;
        }
        if (payload.type === "drop") {
          const box = zone.getBoundingClientRect();
          const scale = window.devicePixelRatio || 1;
          const x = payload.position.x / scale;
          const y = payload.position.y / scale;
          const inside = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
          if (inside || dropHotRef.current) takeDrop(payload.paths);
          else setHot(false);
        }
      });
      if (gone) unlisten();
      else stop = unlisten;
    })();
    return () => {
      gone = true;
      stop?.();
    };
  }, [doc]);

  async function saveCurrent() {
    if (!doc) return;
    setBusy(true);
    try {
      const next = await api.writeTags(doc.path, fields);
      setDoc(next);
      setFields(normalize(next));
      setStatus("Saved tags", "info");
    } catch (error) {
      setStatus(errorMessage(error, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveBatch() {
    if (paths.length === 0) return;
    setBusy(true);
    try {
      const count = await api.batchWrite(paths, fields, apply);
      setStatus(`Updated ${count} files`, "info");
      if (doc) await loadPath(doc.path);
    } catch (error) {
      setStatus(errorMessage(error, "Batch save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function addPictureFromFiles(files: FileList | null) {
    if (!doc || !files?.[0]) return;
    const file = files[0];
    const data = Array.from(new Uint8Array(await file.arrayBuffer()));
    setBusy(true);
    try {
      const next = await api.addPicture(doc.path, data, imageMime(file), pictureKind);
      setDoc(next);
    } catch (error) {
      setStatus(errorMessage(error, "Could not add artwork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="px-8 pt-6 pb-4">
        <h1 className="text-[28px] font-semibold tracking-tight">Metadata Editor</h1>
        <p className="mt-2 max-w-3xl text-[15px] font-medium leading-6 text-app-muted">
          Edit Common fields, ReplayGain, MusicBrainz IDs, Lyrics, artwork, custom frames. Empty
          fields clear any existing tags, make sure you fill everything necessary out.
        </p>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[280px] shrink-0 flex-col border-r border-app-line">
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-app-muted">Files</h2>
          <div className="flex gap-1">
            <button type="button" onClick={() => void openFile()} className="rounded-md px-2 py-1 text-[13px] font-semibold text-app-subtle hover:bg-app-hover">
              Open file
            </button>
            <button type="button" onClick={() => void openFolder()} className="rounded-md px-2 py-1 text-[13px] font-semibold text-app-subtle hover:bg-app-hover">
              Open folder
            </button>
          </div>
        </div>
        {snapshot?.current ? (
          <button
            type="button"
            onClick={() => void loadPath(snapshot.current!.path)}
            className="mx-3 mb-2 rounded-md border border-app-border px-2 py-1.5 text-left text-[13px] font-semibold text-app-subtle hover:bg-app-hover"
          >
            Use current track
          </button>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
          {paths.length === 0 ? (
            <p className="px-2 text-[14px] font-medium leading-5 text-app-muted">
              Open a file, a folder, or pull the track that is playing.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {paths.map((path) => (
                <li key={path} className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-app-hover">
                  <button
                    type="button"
                    onClick={() => void loadPath(path)}
                    className={`min-w-0 flex-1 truncate px-1 text-left text-[14px] font-semibold ${
                      doc?.path === path ? "text-app-text" : "text-app-subtle"
                    }`}
                  >
                    {displayTitle("", path)}
                  </button>
                  <button
                    type="button"
                    title="Remove from list"
                    onClick={() => {
                      const next = paths.filter((item) => item !== path);
                      setPaths(next);
                      if (doc?.path === path) {
                        if (next[0]) void loadPath(next[0]);
                        else {
                          setDoc(null);
                          setFields(EMPTY_FIELDS);
                        }
                      }
                    }}
                    className="rounded p-1 text-app-muted hover:text-app-danger"
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-5 py-4">
        {!doc ? (
          <div
            ref={zoneRef}
            onDragEnter={(event) => {
              event.preventDefault();
              setHot(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setHot(true);
            }}
            onDragLeave={() => setHot(false)}
            onDrop={(event) => {
              event.preventDefault();
              const paths: string[] = [];
              for (const file of Array.from(event.dataTransfer.files)) {
                const path = (file as File & { path?: string }).path;
                if (path) paths.push(path);
              }
              takeDrop(paths);
            }}
            className={`flex min-h-[280px] flex-1 items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center text-[15px] font-medium leading-6 ${
              dropHot ? "drop-ready" : "border-app-border bg-app-raised/60 text-app-muted"
            }`}
          >
            Drop a file or folder here
          </div>
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-5 overflow-auto pb-16">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[12px] text-app-muted">
                  {doc.format} · {doc.tagType}
                  {doc.sampleRate ? ` · ${doc.sampleRate} Hz` : ""}
                  {doc.bitDepth ? ` · ${doc.bitDepth}-bit` : ""}
                  {doc.bitrateKbps ? ` · ${doc.bitrateKbps} kbps` : ""}
                  {` · ${formatTime(doc.durationMs)}`}
                </p>
                <h2 className="mt-1 break-all text-[15px]">{doc.path}</h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !dirty}
                  onClick={() => void saveCurrent()}
                  className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-[12px] text-app-text disabled:opacity-40"
                >
                  <Save size={13} />
                  Save file
                </button>
                <button
                  type="button"
                  disabled={busy || paths.length === 0 || apply.length === 0}
                  onClick={() => void saveBatch()}
                  className="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-3 py-1.5 text-[12px] text-app-subtle disabled:opacity-40"
                >
                  <Upload size={13} />
                  Apply to {paths.length}
                </button>
              </div>
            </header>

            <FieldCard title="Common" fields={COMMON_FIELDS} values={fields} apply={apply} setApply={setApply} onChange={setFields} />
            <FieldCard title="Extended" fields={EXTENDED_FIELDS} values={fields} apply={apply} setApply={setApply} onChange={setFields} />

            <section className="rounded-xl border border-app-border bg-app-raised/70 p-4">
              <h3 className="mb-3 text-[13px] text-app-text">Lyrics</h3>
              <label className="mb-3 block text-[12px] text-app-muted">
                Unsynced
                <textarea
                  value={fields.lyrics}
                  onChange={(event) => setFields({ ...fields, lyrics: event.target.value })}
                  rows={6}
                  className="mt-1 w-full resize-y rounded-md border border-app-border bg-app px-2 py-2 text-[13px] text-app-text"
                />
              </label>
              <label className="block text-[12px] text-app-muted">
                Synced
                <textarea
                  value={fields.syncedLyrics}
                  onChange={(event) => setFields({ ...fields, syncedLyrics: event.target.value })}
                  rows={4}
                  className="mt-1 w-full resize-y rounded-md border border-app-border bg-app px-2 py-2 text-[13px] text-app-text"
                />
              </label>
            </section>

            <section className="rounded-xl border border-app-border bg-app-raised/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] text-app-text">Pictures</h3>
                <div className="flex items-center gap-2 text-[12px]">
                  <select
                    value={pictureKind}
                    onChange={(event) => setPictureKind(event.target.value)}
                    className="rounded-md border border-app-border bg-app px-2 py-1 text-app-subtle"
                  >
                    <option value="front">Front</option>
                    <option value="back">Back</option>
                    <option value="artist">Artist</option>
                    <option value="leaflet">Leaflet</option>
                    <option value="other">Other</option>
                  </select>
                  <label className="flex cursor-pointer items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-app-subtle">
                    <ImagePlus size={13} />
                    Add
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        void addPictureFromFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || coverLoading}
                    onClick={() => void searchCovers()}
                    className="flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-app-subtle disabled:opacity-40"
                  >
                    <Search size={13} />
                    {coverLoading ? "Searching…" : "Find artwork"}
                  </button>
                </div>
              </div>
              {coverHits.length > 0 ? (
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {coverHits.map((hit) => (
                    <figure
                      key={hit.url}
                      className="overflow-hidden rounded-lg border border-app-border"
                    >
                      {hit.thumbnailUrl ? (
                        <img
                          src={hit.thumbnailUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-24 w-full object-cover"
                        />
                      ) : (
                        <div className="h-24 bg-app-hover" />
                      )}
                      <figcaption className="flex items-center justify-between gap-1 px-2 py-1.5">
                        <span className="min-w-0 truncate text-[11px] text-app-muted" title={hit.title}>
                          {hit.title}
                        </span>
                        <button
                          type="button"
                          disabled={busy || !hit.thumbnailUrl}
                          onClick={() => void useCover(hit)}
                          className="shrink-0 text-[11px] font-semibold text-app-accent disabled:opacity-40"
                        >
                          {coverApplying === hit.url ? "Adding…" : "Use"}
                        </button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
              {doc.pictures.length === 0 ? (
                <p className="text-[12px] text-app-muted">No embedded pictures.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {doc.pictures.map((picture) => (
                    <figure key={`${picture.index}-${picture.size}`} className="overflow-hidden rounded-lg border border-app-border">
                      <img
                        src={pictureSrc(picture.mime, picture.dataBase64)}
                        alt={picture.kind}
                        className="h-40 w-full object-cover"
                      />
                      <figcaption className="flex items-center justify-between px-2 py-1.5 text-[11px] text-app-muted">
                        <span>
                          {picture.kind} · {formatBytes(picture.size)}
                        </span>
                        <span className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void (async () => {
                                const dest = await pickSavePath(`cover-${picture.index}.jpg`);
                                if (dest) await api.exportPicture(doc.path, picture.index, dest);
                              })();
                            }}
                          >
                            Export
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void api.removePicture(doc.path, picture.index).then(setDoc);
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-app-border bg-app-raised/70 p-4">
              <h3 className="mb-3 text-[13px] text-app-text">Advanced / raw frames</h3>
              <div className="mb-3 flex gap-2">
                <input
                  value={customKey}
                  onChange={(event) => setCustomKey(event.target.value)}
                  placeholder="Key"
                  className="w-40 rounded-md border border-app-border bg-app px-2 py-1 text-[12px]"
                />
                <input
                  value={customValue}
                  onChange={(event) => setCustomValue(event.target.value)}
                  placeholder="Value"
                  className="flex-1 rounded-md border border-app-border bg-app px-2 py-1 text-[12px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    void api
                      .addCustomField(doc.path, customKey, customValue)
                      .then((next) => {
                        setDoc(next);
                        setCustomKey("");
                        setCustomValue("");
                      });
                  }}
                  className="rounded-md bg-white/[0.06] px-2 py-1 text-[12px] text-app-subtle"
                >
                  Add
                </button>
              </div>
              <div className="overflow-hidden rounded-md border border-app-border">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-white/[0.03] text-app-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Key</th>
                      <th className="px-2 py-1.5 font-medium">Value</th>
                      <th className="w-16 px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {doc.raw.map((item) => (
                      <tr key={`${item.key}-${item.value}`} className="border-t border-app-line">
                        <td className="px-2 py-1.5 text-app-subtle">
                          {item.key}
                          {item.known ? "" : " · custom"}
                        </td>
                        <td className="px-2 py-1.5 break-all text-app-muted">{item.value}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              void api.removeCustomField(doc.path, item.key).then(setDoc);
                            }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
      </div>
    </section>
  );
}

function FieldCard({
  title,
  fields,
  values,
  apply,
  setApply,
  onChange,
}: {
  title: string;
  fields: Array<[keyof TagFields, string]>;
  values: TagFields;
  apply: string[];
  setApply: (apply: string[]) => void;
  onChange: (fields: TagFields) => void;
}) {
  return (
    <section className="rounded-xl border border-app-border bg-app-raised/70 p-4">
      <h3 className="mb-3 text-[15px] font-semibold text-app-text">{title}</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {fields.map(([key, label]) => (
          <label key={key} className="block text-[13px] font-semibold text-app-muted">
            <span className="mb-1 flex items-center justify-between">
              {label}
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide">
                batch
                <input
                  type="checkbox"
                  checked={apply.includes(key)}
                  onChange={(event) => {
                    setApply(
                      event.target.checked ? [...apply, key] : apply.filter((item) => item !== key),
                    );
                  }}
                />
              </span>
            </span>
            <input
              value={values[key]}
              onChange={(event) => onChange({ ...values, [key]: event.target.value })}
              className="w-full rounded-md border border-app-border bg-app px-2 py-1.5 text-[13px] text-app-text"
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function coverQuery(fields: TagFields, path: string): string {
  const title = fields.title.trim();
  const artist = (fields.artists || fields.albumArtist).trim();
  if (title && artist) return `${artist} ${title}`;
  if (title) return title;
  return displayTitle("", path);
}

function imageMime(file: File): string {
  if (file.type.startsWith("image/")) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

function normalize(doc: TagDoc | null): TagFields {
  if (!doc) return { ...EMPTY_FIELDS };
  return {
    ...EMPTY_FIELDS,
    ...Object.fromEntries(
      Object.entries(doc.fields).map(([key, value]) => [key, value ?? ""]),
    ),
  } as TagFields;
}
