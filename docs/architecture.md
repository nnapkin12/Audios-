<p align="center">
  <img src="https://github.com/nnapkin12/Audios-/blob/main/public/audios.png" alt="Audios!" width="360">
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
- [`src-tauri/src/search.rs`](../src-tauri/src/search.rs) — ytsearch, cache, remux, optional save.
- [`src-tauri/src/tags/`](../src-tauri/src/tags/) — read/write/batch/pictures/custom frames.
- [`src-tauri/src/persist.rs`](../src-tauri/src/persist.rs) — last folder, volume, repeat/shuffle, ReplayGain/gapless, resume positions, themes.
- [`src-tauri/src/commands/mod.rs`](../src-tauri/src/commands/mod.rs) — IPC only.

Config is under the `directories` crate path for qualifier `com`, org `audios`, app `Audios` (typically `~/.config/audios/Audios/state.json`). Search temps are `~/.cache/audios/search/`. The Tauri bundle identifier is `com.audios.desktop` — those names do not match, and changing either one moves user data.

## Playback

Rodio keeps the output stream alive and queues Symphonia decoders. Gapless appends the next file about 1.5s before the current one ends. ReplayGain is a volume multiplier from track/album tags. Resume positions drop once a file is within three seconds of the end.

Release builds use `panic = "abort"`. A decoder panic kills the process. Debug builds catch the known Symphonia panic and return an error instead.

## Queue order

Tracks are sorted by folder, then disc, then track number, then path. Nested folders play album-to-album in that order.

## Tag writes

The original file is copied to a sibling temp name, lofty writes the temp, then the temp replaces the original. A failed write deletes the temp and leaves the original untouched. Do not write tags in place. Not every container has the same frames.

## Search (two steps)

1. **List** — `yt-dlp -J --flat-playlist ytsearchN:query`. This is metadata only: title + watch URL. No audio bytes.
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
| `errorMessage()` on the frontend | Tauri serializes `AppError` as a string. `instanceof Error` hides the real message. |

Search runtime dependencies: a **current** yt-dlp, `ffmpeg`, and `curl`. Spotify is not a source. There is no DRM-free Spotify stream API comparable to yt-dlp.

## UI notes

- The window is frameless. Keep the inset frame so Linux compositors that draw a square outer chrome still look finished.
- Stay on WebKit-safe CSS.
- The footer status line is red for errors and muted for info (`Saved tags`, `Getting audio…`, Vite preview).
- Player / Search / Tags / Settings stay mounted and toggle with `hidden` so tab state survives.

## Security notes

- `app.security.csp` is `null`. Tightening CSP will break `data:` cover art and local asset loads unless those are listed.
- Search shells out to `yt-dlp`, `ffmpeg`, and `curl`. Queries are length-limited; URLs are passed as arguments, not a shell string.
- `follow_links(true)` on library walks can loop on cyclic symlinks.

## Known issues / easy-to-break spots

- **YouTube extractor drift.** mediaconnect, format IDs, and public frontends will rot. Fix the extractor args or host list; do not add a stricter `-f bestaudio[ext=m4a]` selector.
- **Library m4a.** Scan treats `.m4a` as playable. Some files will fail the same Symphonia seek panic. Remux is only on the search cache path today.
- **Resume map eviction** is not LRU; it drops arbitrary keys after 500 entries.
- **Search cache** is one file per video id. A failed remux must not leave only an unplayable `.m4a` as the “existing cache” hit — `prepare_for_player` remuxes that path again.
- Search unit tests are JSON/path only. They do not hit live YouTube and do not require yt-dlp or ffmpeg.

## Checks

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
