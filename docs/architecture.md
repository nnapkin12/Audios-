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
- [`src-tauri/src/eq.rs`](../src-tauri/src/eq.rs) — app-wide parametric EQ, shown under Settings → Equalizer. Ten biquad bands (peak, low shelf, high shelf) are the only curve. Default sliders edit gain on Bass, Low, Mid, Presence, and Air. Bass stays a low shelf and Air a high shelf until Advanced changes frequency or Q, which unlocks that band to a peak. ReplayGain and gapless stay on Settings → Playback.
- [`src-tauri/src/search.rs`](../src-tauri/src/search.rs) — ytsearch, cache, remux, optional save.
- [`src-tauri/src/tags/`](../src-tauri/src/tags/) — read/write/batch/pictures/custom frames.
- [`src-tauri/src/persist.rs`](../src-tauri/src/persist.rs) — last folder, volume, repeat/shuffle, ReplayGain/gapless, EQ (enabled, live curve, user presets), themes, playlist names and items. Old `positions` keys in `state.json` are ignored and dropped when you leave that track.
- [`src-tauri/src/playlists.rs`](../src-tauri/src/playlists.rs) — create / rename / delete, add songs. Adding a folder keeps the folder; open and play read whatever songs are there now. A playlist that was saved as individual songs is linked back to each folder those songs live in, so files dropped in later show up. Songs that were already in that folder and were not on the playlist stay off it. Removing one song excludes that file and leaves the folder linked. A saved file whose parent folder is still on disk, but the file is gone, is dropped. A path on a missing drive is kept. Custom pictures are `playlist-covers/{id}.jpg`. If that file is missing, a 2×2 mosaic of embedded track pictures is cached as `{id}.auto.jpg`. The picker sends a filesystem path; Rust reads the image. Do not send picture bytes through IPC.
- [`src-tauri/src/commands/mod.rs`](../src-tauri/src/commands/mod.rs) — IPC only.

Config is under the `directories` crate path for qualifier `com`, org `audios`, app `Audios` (typically `~/.config/audios/Audios/state.json`). Playlist pictures live next to that file in `playlist-covers/`. Search temps are `~/.cache/audios/search/`. The Tauri bundle identifier is `com.audios.desktop` — those names do not match, and changing either one moves user data.

## Playback

Rodio keeps the output stream alive and queues Symphonia decoders. Output uses the system default device, which on current Linux is PipeWire’s ALSA plugin, with PulseAudio still working when that is the default. Each queued file is wrapped in an EQ Source on the `audios-rodio` thread. Coefficients are calculated in 64-bit and the filter recursion stays 64-bit so a low shelf at high sample rates does not quantize into feedback. Samples handed to the sink are 32-bit. The drawn curve is the magnitude of that same cascade. These are the minimum-phase biquads AutoEQ publishes, so a pasted profile matches that correction. Overlapping bands can sum above any single gain; auto level uses the peak of the combined curve. Gapless appends the next file about 1.5s before the current track ends; that next Source has its own filter memory so song A’s bass does not leak into song B. Seek resets that source’s biquads. Live slider changes swap coefficients on the shared EQ params without rebuilding the sink.

Playback order is **decode → varispeed → EQ → sink volume** (volume × mute × ReplayGain). Varispeed changes tempo and pitch together: 0.5× is one octave down, 2× is one octave up. The playhead is the position in the recording, so a faster speed moves through the song faster. The reported length is the longer of the decoder duration and the tag duration. If playback passes that length, the bar grows with the overrun instead of sitting at the end. The on-screen playhead only runs a fraction of a second ahead of the last audio tick, so a late tick can catch it. ReplayGain stays a loudness multiplier from track/album tags (`apply_volume`). EQ is spectral and never writes files or tags. EQ off / Flat is a true bypass (bit-identical to the previous path aside from volume / ReplayGain / varispeed). User EQ presets live in `state.json` next to custom themes; built-ins are compiled in. An older `gains` array loads as ten peaking bands at the old ISO centers. Switching tracks forgets the previous file’s saved place so the next play starts at 0:00. Pause does not write a resume offset. Speed is remembered.

Release builds use `panic = "unwind"` so `catch_unwind` around the decoder can turn a Symphonia panic into an error instead of killing the AppImage.

## Queue order

Tracks are sorted by folder, then disc, then track number, then path. Nested folders play album-to-album in that order.

## Tag writes

The original file is copied to a sibling temp that **keeps the audio extension** (`.song.audios-tmp.mp3`, not `.song.mp3.audios-tmp`). Lofty’s `read_from_path` decides the format from the extension; a `.audios-tmp` suffix makes it report “no format could be determined”. A failed write deletes the temp and leaves the original untouched. Do not write tags in place. Not every container has the same frames. Artwork is sniffed from magic bytes and kept as JPEG/PNG (or converted to JPEG) so a packed WebKit `File.type` of `""` does not label a PNG as JPEG.

MP4-family files (`.m4a`, `.mp4`, and the same container under other names) sometimes store `mdat` with a 64-bit size. Lofty then skips eight bytes past that atom and reports that `moov` is missing. When that size still fits in 32 bits, tag reads use an in-memory copy whose header is rewritten to a normal 8-byte atom. Saving writes that adjustment only onto the staging file, then replaces the original if the tag write succeeds. Audio samples are not rewritten. Chunk offsets move back by those eight bytes.

## Search (two steps)

1. **List** — `yt-dlp -J --flat-playlist`. A text search runs `ytsearchN:` first, then `scsearchN:` for SoundCloud. A pasted link is passed through as-is, so Bandcamp and other yt-dlp sites work when you have the URL. This step is metadata only. Cover search in Tags stays on YouTube thumbnails and does not download audio. A SoundCloud hit keeps its `webpage_url`; do not turn that id into a YouTube watch URL.
2. **Play** — `cache_media(watch_url)` downloads a temp file, remuxes it, then `play_tracks` loads that path. Switching tracks deletes other files in the search cache. **Download** copies the remuxed file to a user-chosen path.

The UI already has the title from step 1. Step 2 is not a second text search; it resolves the watch URL into a local file rodio can decode.

### Workarounds (do not revert casually)

| What | Why it is there |
| --- | --- |
| Newest yt-dlp on disk, not the first `PATH` hit | `apt` yt-dlp is often years old and cannot extract current YouTube player responses. Prefer `~/.local/bin` when that copy is newer. Override with `AUDIOS_YTDLP`. |
| `--extractor-args youtube:player_client=mediaconnect` | `android` / `ios` / `tv` / `web` frequently return “requested format is not available”. mediaconnect still yields AAC. Send it only for YouTube URLs. SoundCloud and other sites use yt-dlp's own defaults. |
| `--js-runtimes node` when `node` exists | Helps yt-dlp solve YouTube JS challenges. |
| No `--print filename` / no `--simulate` on download | Those flags skip writing the file. |
| Remux YouTube AAC `.m4a` to mp3/wav via ffmpeg | rodio 0.20 + Symphonia panics (`Seek errors should not occur during initialization`) on these MP4s. Library `.m4a` files can hit the same bug. |
| `catch_unwind` around `Decoder::new` | The panic is inside rodio, not a `Result`. |
| Library file that fails `Decoder::new` is transcoded into `~/.cache/audios/playback/` | Search remux deletes its source. A library file must stay where it is. ffmpeg writes an mp3, then wav, and playback uses that copy. |
| Invidious / Piped HTTP fallbacks | Last resort if yt-dlp download fails. Public instances go stale; treat the host list as disposable. |
| Sanitize child env for yt-dlp / ffmpeg / curl; skip AppImage `APPDIR` on PATH | AppImage AppRun points PYTHONHOME, LD_LIBRARY_PATH, GIO_EXTRA_MODULES, GCONV_PATH, and other vars at `/tmp/.mount_*`. Host Python then dies with `Python path configuration:`. Named poison vars are dropped, plus any env whose value lives under the mount. |

Search runtime dependencies: a **current** yt-dlp, `ffmpeg`, and `curl`. Spotify is not a source. There is no DRM-free Spotify stream API comparable to yt-dlp.

## UI notes

- The window is frameless. Window buttons are custom (minimize / maximize / close) on the top right. The UI fills the client area; `html`/`body` use `--app` so compositor square chrome matches the page. Do not add inset frame padding around the app. Columns and lists use the window width and wrap; do not pin a page to a fixed narrow measure.
- The full now-playing view sets its own `--app` and `--app-accent` from the album art. Those variables stay on that overlay. The rest of the app keeps the saved theme.
- Stay on WebKit-safe CSS.
- The footer status line is red for errors and muted for info (`Saved tags`, `Getting audio…`, Vite preview).
- Player / Search / Tags / Settings stay mounted and toggle with `hidden` so tab state survives.

## Security notes

- `app.security.csp` is `null`. Tightening CSP will break `data:` cover art and local asset loads unless those are listed.
- Search shells out to `yt-dlp`, `ffmpeg`, and `curl`. Queries are length-limited; URLs are passed as arguments, not a shell string.
- `follow_links(true)` on library walks. WalkDir skips symlink cycles; a symlink farm can still make a scan huge.

## Known issues / easy-to-break spots

- **YouTube extractor drift.** mediaconnect, format IDs, and public frontends will rot. Fix the extractor args or host list; do not add a stricter `-f bestaudio[ext=m4a]` selector.
- **Library decode.** `.m4a` and other containers are still scanned as playable. If Symphonia cannot open one, playback uses the ffmpeg cache copy. The original file is not rewritten.
- **Search cache** is one file per video id. A failed remux must not leave only an unplayable `.m4a` as the “existing cache” hit — `prepare_for_player` remuxes that path again.
- Search unit tests are JSON/path only. They do not hit live YouTube and do not require yt-dlp or ffmpeg.

## Checks

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
