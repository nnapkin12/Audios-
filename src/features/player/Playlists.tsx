import { useState, type MouseEvent } from "react";
import { Music, Plus, X } from "lucide-react";
import { invalidateBrowse, openBrowsePage, samePage } from "@/features/player/browse";
import { api, pickAudioFiles, pickFolder, pickImageFile, revealInFiles } from "@/lib/api";
import { PlaylistCover, dropPlaylistCover } from "@/lib/covers";
import { baseName, errorMessage } from "@/lib/format";
import type { Playlist } from "@/lib/types";
import type { MenuEntry } from "@/features/shell/ContextMenu";
import { useAppStore } from "@/store/useAppStore";

export function LibraryNav({
  creating,
  setCreating,
  onMenu,
  onAddFile,
  onAddFolder,
}: {
  creating: boolean;
  setCreating: (value: boolean) => void;
  onMenu: (event: MouseEvent, items: MenuEntry[]) => void;
  onAddFile: () => void;
  onAddFolder: () => void;
}) {
  const playlists = useAppStore((state) => state.playlists);
  const libraryRoots = useAppStore((state) => state.libraryRoots);
  const browse = useAppStore((state) => state.browse);
  const setPlaylists = useAppStore((state) => state.setPlaylists);
  const setLibraryRoots = useAppStore((state) => state.setLibraryRoots);
  const setStatus = useAppStore((state) => state.setStatus);
  const [name, setName] = useState("");

  async function create() {
    try {
      const list = await api.createPlaylist(name.trim());
      setPlaylists(list);
      setName("");
      setCreating(false);
      const created = list[list.length - 1];
      if (created) await openBrowsePage({ kind: "playlist", id: created.id });
    } catch (error) {
      setStatus(errorMessage(error, "Could not create playlist"));
    }
  }

  async function removeRoot(path: string) {
    try {
      const roots = await api.removeLibraryRoot(path);
      setLibraryRoots(roots);
      if (browse.kind === "folder" && browse.path === path) {
        await openBrowsePage({ kind: "home" });
      }
    } catch (error) {
      setStatus(errorMessage(error, "Couldn't remove this"));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={() => void openBrowsePage({ kind: "home" })}
        className={`mb-3 flex items-center gap-2 rounded-lg px-2 py-2 text-left ${
          browse.kind === "home" ? "bg-app-hover" : "hover:bg-app-hover"
        }`}
      >
        <img src="/audios.png" alt="" className="h-8 w-8 rounded-md bg-white object-cover" />
        <span className="truncate text-[15px] font-semibold">Audios!</span>
      </button>

      <div className="mb-1 flex items-center justify-between gap-2 px-1 pb-1">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-app-muted">
          Library
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            title="Play a song"
            onClick={onAddFile}
            className="rounded-md px-2 py-1 text-[13px] font-semibold text-app-subtle hover:bg-app-hover"
          >
            Play song
          </button>
          <button
            type="button"
            title="Add music to your library"
            onClick={onAddFolder}
            className="rounded-md px-2 py-1 text-[13px] font-semibold text-app-subtle hover:bg-app-hover"
          >
            Add music
          </button>
        </div>
      </div>
      {libraryRoots.length === 0 ? (
        <p className="mb-3 px-1 text-[13px] leading-5 text-app-muted">
          Add music to get started.
        </p>
      ) : (
        <div className="mb-3 flex flex-col gap-0.5">
          {libraryRoots.map((path) => {
            const active = browse.kind === "folder" && browse.path === path;
            return (
              <div
                key={path}
                className={`flex items-center gap-1 rounded-md pr-1 ${
                  active ? "bg-app-hover" : "hover:bg-app-hover"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void openBrowsePage({ kind: "folder", path })}
                  onContextMenu={(event) =>
                    onMenu(event, folderMenu(path, removeRoot, setStatus))
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                >
                  <Music size={15} className="shrink-0 text-app-muted" />
                  <span className="truncate text-[14px] font-semibold">{baseName(path)}</span>
                </button>
                <button
                  type="button"
                  title="Remove from library"
                  onClick={() => void removeRoot(path)}
                  className="rounded p-1 text-app-muted hover:text-app-danger"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between px-1 pb-1">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-app-muted">
          Playlists
        </p>
        <button
          type="button"
          title="New playlist"
          onClick={() => setCreating(true)}
          className="rounded-md p-1 text-app-subtle hover:bg-app-hover hover:text-app-text"
        >
          <Plus size={16} />
        </button>
      </div>
      {creating ? (
        <form
          className="mb-2 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (!name.trim()) setCreating(false);
            }}
            placeholder="Playlist name"
            className="w-full rounded-md border border-app-border bg-app px-2 py-1.5 text-[14px]"
          />
        </form>
      ) : null}
      {playlists.length === 0 && !creating ? (
        <p className="px-1 text-[13px] leading-5 text-app-muted">
          Press + to make a playlist, then add songs.
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {playlists.map((playlist) => (
            <PlaylistRow
              key={playlist.id}
              playlist={playlist}
              onMenu={onMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlaylistRow({
  playlist,
  onMenu,
}: {
  playlist: Playlist;
  onMenu: (event: MouseEvent, items: MenuEntry[]) => void;
}) {
  const browse = useAppStore((state) => state.browse);
  const setPlaylists = useAppStore((state) => state.setPlaylists);
  const setStatus = useAppStore((state) => state.setStatus);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(playlist.name);
  const active = browse.kind === "playlist" && browse.id === playlist.id;

  async function playFrom(startPath?: string) {
    try {
      useAppStore.getState().applySnapshot(await api.playPlaylist(playlist.id, startPath));
    } catch (error) {
      setStatus(errorMessage(error, "Could not play playlist"));
    }
  }

  async function addFiles() {
    const paths = await pickAudioFiles();
    if (paths.length === 0) return;
    setPlaylists(await api.addToPlaylist(playlist.id, paths));
    dropPlaylistCover(playlist.id);
    invalidateBrowse("playlist", playlist.id);
    if (active) await openBrowsePage({ kind: "playlist", id: playlist.id }, true);
  }

  async function addFolder() {
    const folder = await pickFolder("Add album");
    if (!folder) return;
    setPlaylists(await api.addToPlaylist(playlist.id, [folder]));
    dropPlaylistCover(playlist.id);
    invalidateBrowse("playlist", playlist.id);
    if (active) await openBrowsePage({ kind: "playlist", id: playlist.id }, true);
  }

  async function commitRename() {
    const next = draft.trim();
    if (!next || next === playlist.name) {
      setDraft(playlist.name);
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
    try {
      dropPlaylistCover(playlist.id);
      setPlaylists(await api.clearPlaylistCover(playlist.id));
    } catch (error) {
      setStatus(errorMessage(error, "Could not remove playlist picture"));
    }
  }

  async function remove() {
    dropPlaylistCover(playlist.id);
    setPlaylists(await api.deletePlaylist(playlist.id));
    if (active) await openBrowsePage({ kind: "home" });
  }

  return (
    <div
      className={`flex items-center gap-1 rounded-md pr-1 ${
        active ? "bg-app-hover" : "hover:bg-app-hover"
      }`}
    >
      {renaming ? (
        <form
          className="min-w-0 flex-1 px-1 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            void commitRename();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commitRename()}
            className="w-full rounded-md border border-app-border bg-app px-2 py-1 text-[13px]"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => void openBrowsePage({ kind: "playlist", id: playlist.id })}
          onDoubleClick={(event) => {
            event.preventDefault();
            setDraft(playlist.name);
            setRenaming(true);
          }}
          onContextMenu={(event) =>
            onMenu(event, [
              {
                kind: "action",
                action: {
                  label: "Open",
                  onClick: () => void openBrowsePage({ kind: "playlist", id: playlist.id }),
                },
              },
              { kind: "action", action: { label: "Play", onClick: () => void playFrom() } },
              {
                kind: "action",
                action: {
                  label: "Rename",
                  onClick: () => {
                    setDraft(playlist.name);
                    setRenaming(true);
                  },
                },
              },
              { kind: "action", action: { label: "Change picture", onClick: () => void changeCover() } },
              ...(playlist.hasCover
                ? ([
                    {
                      kind: "action",
                      action: { label: "Remove picture", onClick: () => void removeCover() },
                    },
                  ] satisfies MenuEntry[])
                : []),
              { kind: "action", action: { label: "Add songs", onClick: () => void addFiles() } },
              { kind: "action", action: { label: "Add album", onClick: () => void addFolder() } },
              { kind: "sep" },
              {
                kind: "action",
                action: { label: "Delete playlist", danger: true, onClick: () => void remove() },
              },
            ])
          }
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
        >
          <PlaylistCover
            id={playlist.id}
            className="h-10 w-10 rounded-md"
          />
          <span className="truncate text-[14px] font-semibold">{playlist.name}</span>
        </button>
      )}
      <button
        type="button"
        title="Delete playlist"
        onClick={() => void remove()}
        className="rounded p-1 text-app-muted hover:text-app-danger"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function folderMenu(
  path: string,
  removeRoot: (path: string) => Promise<void>,
  setStatus: (status: string | null) => void,
): MenuEntry[] {
  const playlists = useAppStore.getState().playlists;
  return [
    {
      kind: "action",
      action: {
        label: "Open",
        onClick: () => void openBrowsePage({ kind: "folder", path }),
      },
    },
    {
      kind: "action",
      action: {
        label: "Play",
        onClick: () => {
          void api.playQueuePaths([path]).then((snapshot) => {
            useAppStore.getState().applySnapshot(snapshot);
          }).catch((error) => {
            setStatus(errorMessage(error, "Couldn't play this"));
          });
        },
      },
    },
    {
      kind: "submenu",
      label: "Add to playlist",
      actions: playlists.map((playlist) => ({
        label: playlist.name,
        onClick: () => {
          void api.addToPlaylist(playlist.id, [path]).then((list) => {
            useAppStore.getState().setPlaylists(list);
            refreshPlaylist(playlist.id);
          });
        },
      })),
    },
    {
      kind: "action",
      action: {
        label: "Show in Files",
        onClick: () => {
          void revealInFiles(path).catch((error) => {
            setStatus(errorMessage(error, "Couldn't open Files"));
          });
        },
      },
    },
    { kind: "sep" },
    {
      kind: "action",
      action: { label: "Remove from library", danger: true, onClick: () => void removeRoot(path) },
    },
  ];
}

function refreshPlaylist(playlistId: string) {
  dropPlaylistCover(playlistId);
  invalidateBrowse("playlist", playlistId);
  const browse = useAppStore.getState().browse;
  if (samePage(browse, { kind: "playlist", id: playlistId })) {
    void openBrowsePage({ kind: "playlist", id: playlistId }, true);
  }
}

export function AddToPlaylistButton({ path }: { path: string }) {
  const playlists = useAppStore((state) => state.playlists);
  const setPlaylists = useAppStore((state) => state.setPlaylists);
  const [open, setOpen] = useState(false);
  if (playlists.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        title="Add to playlist"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="rounded p-0.5 text-app-muted hover:text-app-text"
      >
        <Plus size={13} />
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[140px] rounded-md border border-app-border bg-app-raised py-1 shadow-lg">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void api.addToPlaylist(playlist.id, [path]).then((list) => {
                  setPlaylists(list);
                  refreshPlaylist(playlist.id);
                });
                setOpen(false);
              }}
              className="block w-full truncate px-2 py-1 text-left text-[13px] hover:bg-app-hover"
            >
              {playlist.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
