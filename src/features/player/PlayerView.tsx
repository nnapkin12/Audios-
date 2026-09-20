import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Pencil, Play, Search, X } from "lucide-react";
import { filterTracks, invalidateBrowse, openBrowsePage } from "@/features/player/browse";
import { LibraryHome } from "@/features/player/LibraryHome";
import { LibraryNav } from "@/features/player/Playlists";
import { TrackList } from "@/features/player/TrackList";
import { ContextMenu, type MenuEntry } from "@/features/shell/ContextMenu";
import {
  api,
  pickAudioFile,
  pickAudioFiles,
  pickFolder,
  pickImageFile,
  revealInFiles,
} from "@/lib/api";
import { PlaylistCover, dropPlaylistCover } from "@/lib/covers";
import { baseName, errorMessage } from "@/lib/format";
import type { Track } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export function PlayerView() {
  const browse = useAppStore((state) => state.browse);
  const pageTracks = useAppStore((state) => state.pageTracks);
  const pageLoading = useAppStore((state) => state.pageLoading);
  const playlists = useAppStore((state) => state.playlists);
  const setStatus = useAppStore((state) => state.setStatus);
  const setLibraryRoots = useAppStore((state) => state.setLibraryRoots);
  const setPlaylists = useAppStore((state) => state.setPlaylists);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);

  const playlist =
    browse.kind === "playlist" ? playlists.find((item) => item.id === browse.id) : null;

  const browseKey =
    browse.kind === "folder" ? browse.path : browse.kind === "playlist" ? browse.id : "home";

  useEffect(() => {
    setListQuery("");
    setRenaming(false);
    setDraftName(playlist?.name ?? "");
  }, [browseKey, playlist?.name]);

  const visibleTracks = useMemo(
    () => filterTracks(pageTracks, listQuery),
    [pageTracks, listQuery],
  );

  async function openFile() {
    try {
      const path = await pickAudioFile();
      if (path) useAppStore.getState().applySnapshot(await api.openPath(path));
    } catch (error) {
      setStatus(errorMessage(error, "Could not open file"));
    }
  }

  async function addFolder() {
    try {
      const path = await pickFolder();
      if (!path) return;
      const change = await api.addLibraryRoot(path);
      setLibraryRoots(change.roots);
      invalidateBrowse("folder", change.path);
      await openBrowsePage({ kind: "folder", path: change.path }, true);
    } catch (error) {
      setStatus(errorMessage(error, "Could not add folder"));
    }
  }

  async function playTracks(startPath?: string) {
    if (visibleTracks.length === 0) return;
    try {
      useAppStore.getState().applySnapshot(await api.playTracks(visibleTracks, startPath));
    } catch (error) {
      setStatus(errorMessage(error, "Could not play"));
    }
  }

  async function commitRename() {
    if (!playlist) return;
    const next = draftName.trim();
    if (!next || next === playlist.name) {
      setDraftName(playlist.name);
      setRenaming(false);
      return;
    }
    try {
      setPlaylists(await api.renamePlaylist(playlist.id, next));
      setRenaming(false);
    } catch (error) {
      setStatus(errorMessage(error, "Could not rename playlist"));
    }
  }

  async function changeCover() {
    if (!playlist) return;
    const path = await pickImageFile();
    if (!path) return;
    try {
      dropPlaylistCover(playlist.id);
      setPlaylists(await api.setPlaylistCover(playlist.id, path));
    } catch (error) {
      setStatus(errorMessage(error, "Could not set playlist picture"));
    }
  }

  async function removeCover() {
    if (!playlist) return;
    try {
      dropPlaylistCover(playlist.id);
      setPlaylists(await api.clearPlaylistCover(playlist.id));
    } catch (error) {
      setStatus(errorMessage(error, "Could not remove playlist picture"));
    }
  }

  function openMenu(event: MouseEvent, items: MenuEntry[]) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, items });
  }

  function trackMenu(track: Track): MenuEntry[] {
    const source =
      playlist?.items.find(
        (item) =>
          item.path === track.path ||
          track.path.startsWith(`${item.path}/`) ||
          track.path.startsWith(`${item.path}\\`),
      ) ?? null;
    return [
      { kind: "action", action: { label: "Play", onClick: () => void playTracks(track.path) } },
      {
        kind: "submenu",
        label: "Add to playlist",
        actions: playlists.map((item) => ({
          label: item.name,
          onClick: () => {
            void api.addToPlaylist(item.id, [track.path]).then((list) => {
              setPlaylists(list);
              invalidateBrowse("playlist", item.id);
              if (browse.kind === "playlist" && browse.id === item.id) {
                void openBrowsePage({ kind: "playlist", id: item.id }, true);
              }
            });
          },
        })),
      },
      {
        kind: "action",
        action: {
          label: "Edit tags",
          onClick: () => {
            useAppStore.getState().setTagFocusPath(track.path);
            useAppStore.getState().setTab("tags");
          },
        },
      },
      {
        kind: "action",
        action: {
          label: "Show in files",
          onClick: () => {
            void revealInFiles(track.path).catch((error) => {
              setStatus(errorMessage(error, "Could not open files"));
            });
          },
        },
      },
      ...(source
        ? ([
            { kind: "sep" },
            {
              kind: "action",
              action: {
                label: source.kind === "dir" ? "Remove folder from playlist" : "Remove from playlist",
                danger: true,
                onClick: () => {
                  void api.removeFromPlaylist(playlist!.id, source.path).then((list) => {
                    dropPlaylistCover(playlist!.id);
                    setPlaylists(list);
                    invalidateBrowse("playlist", playlist!.id);
                    void openBrowsePage({ kind: "playlist", id: playlist!.id }, true);
                  });
                },
              },
            },
          ] satisfies MenuEntry[])
        : []),
    ];
  }

  const title =
    browse.kind === "home"
      ? "Audios!"
      : browse.kind === "folder"
        ? baseName(browse.path)
        : (playlist?.name ?? "Playlist");

  const filtered = listQuery.trim().length > 0;
  const countLabel = pageLoading
    ? "Reading library…"
    : pageTracks.length === 0
      ? "No tracks"
      : filtered
        ? `${visibleTracks.length} of ${pageTracks.length} track${pageTracks.length === 1 ? "" : "s"}`
        : `${pageTracks.length} track${pageTracks.length === 1 ? "" : "s"}`;

  return (
    <section className="flex min-h-0 flex-1">
      <div className="flex w-[300px] shrink-0 flex-col border-r border-app-line">
        <div className="flex items-center justify-between px-3 py-2.5">
          <button
            type="button"
            onClick={() => void openBrowsePage({ kind: "home" })}
            className="text-[13px] font-semibold uppercase tracking-[0.06em] text-app-muted hover:text-app-text"
          >
            Library
          </button>
          <div className="flex gap-1">
            <button
              type="button"
              title="Open one audio file"
              onClick={() => void openFile()}
              className="rounded-md px-2 py-1 text-[13px] font-semibold text-app-subtle hover:bg-app-hover"
            >
              Add file
            </button>
            <button
              type="button"
              title="Add a folder to the library"
              onClick={() => void addFolder()}
              className="rounded-md px-2 py-1 text-[13px] font-semibold text-app-subtle hover:bg-app-hover"
            >
              Add folder
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
          <LibraryNav
            creating={creatingPlaylist}
            setCreating={setCreatingPlaylist}
            onMenu={openMenu}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {browse.kind === "home" ? (
          <LibraryHome />
        ) : (
          <>
            <div className="flex items-end justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-end gap-4">
                {browse.kind === "playlist" && playlist ? (
                  <button
                    type="button"
                    title={playlist.hasCover ? "Change picture" : "Add picture"}
                    onClick={() => void changeCover()}
                    onContextMenu={(event) =>
                      openMenu(event, [
                        {
                          kind: "action",
                          action: { label: "Change picture", onClick: () => void changeCover() },
                        },
                        ...(playlist.hasCover
                          ? ([
                              {
                                kind: "action",
                                action: {
                                  label: "Remove picture",
                                  onClick: () => void removeCover(),
                                },
                              },
                            ] satisfies MenuEntry[])
                          : []),
                      ])
                    }
                    className="group relative shrink-0"
                  >
                    <PlaylistCover
                      id={playlist.id}
                      className="h-[88px] w-[88px] rounded-xl"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 text-[12px] font-semibold text-white opacity-0 group-hover:opacity-100">
                      {playlist.hasCover ? "Change" : "Add picture"}
                    </span>
                  </button>
                ) : null}
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-app-muted">
                    {browse.kind === "folder" ? "Folder" : "Playlist"}
                  </p>
                  {browse.kind === "playlist" && playlist && renaming ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void commitRename();
                      }}
                    >
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        onBlur={() => void commitRename()}
                        className="mt-0.5 w-full max-w-md rounded-md border border-app-border bg-app px-2 py-1 text-[22px] font-semibold text-app-text"
                      />
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[22px] font-semibold text-app-text">{title}</p>
                      {browse.kind === "playlist" && playlist ? (
                        <button
                          type="button"
                          title="Rename playlist"
                          onClick={() => {
                            setDraftName(playlist.name);
                            setRenaming(true);
                          }}
                          className="rounded-md p-1 text-app-muted hover:bg-app-hover hover:text-app-text"
                        >
                          <Pencil size={14} />
                        </button>
                      ) : null}
                    </div>
                  )}
                  <p className="text-[14px] font-medium text-app-muted">{countLabel}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {browse.kind === "playlist" && playlist ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void pickAudioFilesInto(playlist.id)}
                      className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-app-subtle hover:bg-app-hover"
                    >
                      Add files
                    </button>
                    <button
                      type="button"
                      onClick={() => void pickFolderInto(playlist.id)}
                      className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-app-subtle hover:bg-app-hover"
                    >
                      Add folder
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  disabled={visibleTracks.length === 0}
                  onClick={() => void playTracks()}
                  className="flex items-center gap-1.5 rounded-md bg-app-play px-3 py-1.5 text-[13px] font-semibold text-app-play-fg disabled:opacity-40"
                >
                  <Play size={14} fill="currentColor" />
                  Play
                </button>
              </div>
            </div>
            {pageTracks.length > 0 || listQuery ? (
              <ListSearch value={listQuery} onChange={setListQuery} />
            ) : null}
            {browse.kind === "playlist" && playlist && playlist.items.length > 0 ? (
              <PlaylistSources playlistId={playlist.id} />
            ) : null}
            {pageTracks.length === 0 && !pageLoading ? (
              <div className="px-5">
                <div className="rounded-xl border border-dashed border-app-border bg-app-raised/60 px-4 py-6 text-[14px] font-medium leading-6 text-app-muted">
                  {browse.kind === "playlist"
                    ? "Add files or a folder to this playlist."
                    : "This folder has no audio files Audios! can play."}
                </div>
              </div>
            ) : visibleTracks.length === 0 && filtered ? (
              <div className="px-5">
                <div className="rounded-xl border border-dashed border-app-border bg-app-raised/60 px-4 py-6 text-[14px] font-medium leading-6 text-app-muted">
                  No tracks match that search.
                </div>
              </div>
            ) : (
              <TrackList
                tracks={visibleTracks}
                onPlay={(track) => void playTracks(track.path)}
                onContext={(event, track) => openMenu(event, trackMenu(track))}
              />
            )}
          </>
        )}
      </div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      ) : null}
    </section>
  );
}

function ListSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="px-5 pb-3">
      <label className="relative block">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search this list"
          className="w-full rounded-lg border border-app-border bg-app-raised py-2.5 pl-9 pr-9 text-[15px] text-app-text"
        />
        {value ? (
          <button
            type="button"
            title="Clear search"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-app-muted hover:bg-app-hover hover:text-app-text"
          >
            <X size={14} />
          </button>
        ) : null}
      </label>
    </div>
  );
}

function PlaylistSources({ playlistId }: { playlistId: string }) {
  const playlist = useAppStore((state) => state.playlists.find((item) => item.id === playlistId));
  const setPlaylists = useAppStore((state) => state.setPlaylists);
  if (!playlist || playlist.items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 px-5 pb-2">
      {playlist.items.map((item) => (
        <span
          key={item.path}
          className="flex items-center gap-1 rounded-full border border-app-border bg-app-raised px-2 py-0.5 text-[12px] font-semibold text-app-subtle"
        >
          {baseName(item.path)}
          {item.kind === "dir" ? " · folder" : ""}
          <button
            type="button"
            title="Remove from playlist"
            onClick={() => {
              void api.removeFromPlaylist(playlist.id, item.path).then((list) => {
                dropPlaylistCover(playlist.id);
                setPlaylists(list);
                invalidateBrowse("playlist", playlist.id);
                void openBrowsePage({ kind: "playlist", id: playlist.id }, true);
              });
            }}
            className="text-app-muted hover:text-app-danger"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

async function pickAudioFilesInto(playlistId: string) {
  const paths = await pickAudioFiles();
  if (paths.length === 0) return;
  const list = await api.addToPlaylist(playlistId, paths);
  dropPlaylistCover(playlistId);
  useAppStore.getState().setPlaylists(list);
  invalidateBrowse("playlist", playlistId);
  await openBrowsePage({ kind: "playlist", id: playlistId }, true);
}

async function pickFolderInto(playlistId: string) {
  const folder = await pickFolder();
  if (!folder) return;
  const list = await api.addToPlaylist(playlistId, [folder]);
  dropPlaylistCover(playlistId);
  useAppStore.getState().setPlaylists(list);
  invalidateBrowse("playlist", playlistId);
  await openBrowsePage({ kind: "playlist", id: playlistId }, true);
}
