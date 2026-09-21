<p align="center">
  <img src="https://github.com/nnapkin12/AudiosPlayer/blob/main/public/audios.png" alt="Audios!" width="360">
</p>

# Architecture

```
React (WebKitGTK)
  player   search   tags   settings
           |
           +-- src/lib/api.ts (only Tauri invoke)
                  |
           Tauri commands
     +------------+-------------+------------+
     |            |             |            |
  Player       Search        Tag IO      Persist
  rodio        yt-dlp        lofty       state.json
  Symphonia    ffmpeg        pictures    custom themes
  walkdir      curl
```

All disk, audio, process, and tag work lives in Rust. The webview renders state and calls `invoke`. If a change needs files, audio, or a child process, add a command in [`src-tauri/src/commands/mod.rs`](../src-tauri/src/commands/mod.rs).

## Frontend

- [`src/App.tsx`](../src/App.tsx) — frameless chrome, `player://state` / `player://tick`, transport keys.
- [`src/store/useAppStore.ts`](../src/store/useAppStore.ts) — last snapshot, cover, tab, status line.
- [`src/lib/api.ts`](../src/lib/api.ts) — only module that talks to Tauri.
- [`src/lib/format.ts`](../src/lib/format.ts) — `errorMessage()` unwraps Tauri failures. Command errors arrive as **strings**, not `Error` objects. Do not use `error instanceof Error` at invoke call sites.

## Backend

- [`src-tauri/src/player/`](../src-tauri/src/player/) — `PlayerEngine` (rodio + Symphonia), recursive scan, queue.
- [`src-tauri/src/eq.rs`](../src-tauri/src/eq.rs) — app-wide graphic EQ (10-band peaking biquads) applied to decoded PCM.
- [`src-tauri/src/search.rs`](../src-tauri/src/search.rs) — ytsearch, cache, remux, optional save.
- [`src-tauri/src/tags/`](../src-tauri/src/tags/) — read/write/batch/pictures/custom frames.
- [`src-tauri/src/persist.rs`](../src-tauri/src/persist.rs) — last folder, volume, repeat/shuffle, ReplayGain/gapless, EQ (enabled, live curve, user presets), themes, playlist names and items. Old `positions` keys in `state.json` are ignored and dropped when you leave that track.
- [`src-tauri/src/playlists.rs`](../src-tauri/src/playlists.rs) — create / rename / delete, add songs. Adding a folder expands to audio paths. Custom pictures are `playlist-covers/{id}.jpg`. If that file is missing, a 2×2 mosaic of embedded track pictures is cached as `{id}.auto.jpg`. The picker sends a filesystem path; Rust reads the image. Do not send picture bytes through IPC.
- [`src-tauri/src/commands/mod.rs`](../src-tauri/src/commands/mod.rs) — IPC only.

Config is under the `directories` crate path for qualifier `com`, org `audios`, app `Audios` (typically `~/.config/audios/Audios/state.json`). Playlist pictures live next to that file in `playlist-covers/`. Search temps are `~/.cache/audios/search/`. The Tauri bundle identifier is `com.audios.desktop` — those names do not match, and changing either one moves user data.

## Playback

Rodio keeps the output stream alive and queues Symphonia decoders. Each queued file is wrapped in an EQ Source on the `audios-rodio` thread (10-band ISO peaking biquads, 32-bit float). Gapless appends the next file about 1.5s before the current track ends; that next Source has its own filter memory so song A’s bass does not leak into song B. Seek resets that source’s biquads. Live slider changes swap gains on the shared EQ params without rebuilding the sink.

Playback order is **decode → EQ → sink volume** (volume × mute × ReplayGain). ReplayGain stays a loudness multiplier from track/album tags (`apply_volume`). EQ is spectral and never writes files or tags. EQ off / Flat is a true bypass (bit-identical to the previous path aside from volume / ReplayGain). User EQ presets live in `state.json` next to custom themes; built-ins are compiled in. Switching tracks forgets the previous file’s saved place so the next play starts at 0:00. Pause does not write a resume offset.

Release builds use `panic = "unwind"` so `catch_unwind` around the decoder can turn a Symphonia panic into an error instead of killing the AppImage.

## Queue order

Tracks are sorted by folder, then disc, then track number, then path. Nested folders play album-to-album in that order.

## Tag writes

The original file is copied to a sibling temp that **keeps the audio extension** (`.song.audios-tmp.mp3`, not `.song.mp3.audios-tmp`). Lofty’s `read_from_path` decides the format from the extension; a `.audios-tmp` suffix makes it report “no format could be determined”. A failed write deletes the temp and leaves the original untouched. Do not write tags in place. Not every container has the same frames. Artwork is sniffed from magic bytes and kept as JPEG/PNG (or converted to JPEG) so a packed WebKit `File.type` of `""` does not label a PNG as JPEG.

## Search (two steps)

1. **List** — `yt-dlp -J --flat-playlist ytsearchN:query`. This is metadata only: title + watch URL. No audio bytes. Cover search in Tags uses this step with four results and embeds a YouTube thumbnail via curl; it does not download audio.
2. **Play** — `cache_media(watch_url)` downloads a temp file, remuxes it, then `play_tracks` loads that path. Switching tracks deletes other files in the search cache. **Download** copies the remuxed file to a user-chosen path.

The UI already has the title from step 1. Step 2 is not a second text search; it resolves the watch URL into a local file rodio can decode.

### Workarounds (do not revert casually)

| What | Why it is there |
| --- | --- |
| Newest yt-dlp on disk, not the first `PATH` hit | `apt` yt-dlp is often years old and cannot extract current YouTube player responses. Prefer `~/.local/bin` when that copy is newer. Override with `AUDIOS_YTDLP`. |
| `--extractor-args youtube:player_client=mediaconnect` | `android` / `ios` / `tv` / `web` frequently return “requested format is not available”. mediaconnect still yields AAC. |
| `--js-runtimes node` when `node` exists | Helps yt-dlp solve YouTube JS challenges. |
| No `--print filename` / no `--simulate` on download | Those flags skip writing the file. |
| Remux YouTube AAC `.m4a` to mp3/wav via ffmpeg | rodio 0.20 + Symphonia panics (`Seek errors should not occur during initialization`) on these MP4s. Library `.m4a` files can hit the same bug. |
| `catch_unwind` around `Decoder::new` | The panic is inside rodio, not a `Result`. |
| Invidious / Piped HTTP fallbacks | Last resort if yt-dlp download fails. Public instances go stale; treat the host list as disposable. |
| Sanitize child env for yt-dlp / ffmpeg / curl; skip AppImage `APPDIR` on PATH | AppImage AppRun points PYTHONHOME, LD_LIBRARY_PATH, GIO_EXTRA_MODULES, GCONV_PATH, and other vars at `/tmp/.mount_*`. Host Python then dies with `Python path configuration:`. Named poison vars are dropped, plus any env whose value lives under the mount. |

Search runtime dependencies: a **current** yt-dlp, `ffmpeg`, and `curl`. Spotify is not a source. There is no DRM-free Spotify stream API comparable to yt-dlp.

## UI notes

- The window is frameless. Window buttons are custom (minimize / maximize / close) on the top right. The UI fills the client area; `html`/`body` use `--app` so compositor square chrome matches the page. Do not add inset frame padding around the app.
- Stay on WebKit-safe CSS.
- The footer status line is red for errors and muted for info (`Saved tags`, `Getting audio…`, Vite preview).
- Player / Search / Tags / Settings stay mounted and toggle with `hidden` so tab state survives.

## Security notes

- `app.security.csp` is `null`. Tightening CSP will break `data:` cover art and local asset loads unless those are listed.
- Search shells out to `yt-dlp`, `ffmpeg`, and `curl`. Queries are length-limited; URLs are passed as arguments, not a shell string.
- `follow_links(true)` on library walks. WalkDir skips symlink cycles; a symlink farm can still make a scan huge.

## Known issues / easy-to-break spots

- **YouTube extractor drift.** mediaconnect, format IDs, and public frontends will rot. Fix the extractor args or host list; do not add a stricter `-f bestaudio[ext=m4a]` selector.
- **Library m4a.** Scan treats `.m4a` as playable. Some files will fail the same Symphonia seek panic. Remux is only on the search cache path today.
- **Search cache** is one file per video id. A failed remux must not leave only an unplayable `.m4a` as the “existing cache” hit — `prepare_for_player` remuxes that path again.
- Search unit tests are JSON/path only. They do not hit live YouTube and do not require yt-dlp or ffmpeg.

## Checks

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
