<p align="center">
  <img src="https://github.com/nnapkin12/AudiosPlayer/blob/main/public/audios.png" alt="Audios!" width="360">
</p>

# Contributing

Audios! is a small desktop app with a hard split between UI and native work.

## Rule

All disk, audio, process, and tag logic lives in Rust. React only renders state and calls `invoke`. If a change needs files, playback, yt-dlp, or ffmpeg, add or extend a command in [`src-tauri/src/commands/mod.rs`](src-tauri/src/commands/mod.rs). Do not do that work in the webview.

Read [`docs/architecture.md`](docs/architecture.md) before changing search or the decoder. Several YouTube/rodio workarounds look optional and are not.

## Commands

Player, tag, appearance, and search commands are the public surface. Keep payloads `camelCase` via serde so they match [`src/lib/types.ts`](src/lib/types.ts). If you add a field, update both sides in the same change.

Tauri returns command errors as strings. Use `errorMessage()` from [`src/lib/format.ts`](src/lib/format.ts) in the UI.

## Player

Playback goes through the `PlayerEngine` trait in [`src-tauri/src/player/engine.rs`](src-tauri/src/player/engine.rs) (rodio + Symphonia). The parametric EQ wraps each decoder in [`src-tauri/src/eq.rs`](src-tauri/src/eq.rs) on that audio thread. One band list feeds both the tone sliders and Advanced in Settings → Equalizer. Do not add a second graphic-EQ processor. Queue order, repeat, and shuffle are pure logic in [`src-tauri/src/player/queue.rs`](src-tauri/src/player/queue.rs) and should stay unit-tested there.

## Search

[`src-tauri/src/search.rs`](src-tauri/src/search.rs) lists results with `--flat-playlist`. Text search is `ytsearch` then `scsearch`. A pasted URL is passed through. Prefer `webpage_url` over building a YouTube link from an id. Do not feed YouTube AAC `.m4a` straight to rodio. Do not pin `-f` to a named format like `bestaudio[ext=m4a]`. `mediaconnect` is for YouTube URLs only. Child processes must go through `spawn_tool` so AppImage Python/GTK env is not leaked into host yt-dlp.

## Tags

[`src-tauri/src/tags/mod.rs`](src-tauri/src/tags/mod.rs) writes through a temp file, then replaces the original. Do not write tags in place. Keep the editor format-aware: not every container has the same frames. Cover search lists four YouTube thumbnails (`search_covers`) and `add_cover_from_url` fetches the JPEG with curl. Do not download audio for artwork.

## UI

Chrome lives in `src/features/shell`. Stay on WebKit-safe CSS. The window is frameless and the UI fills the client area. Window buttons stay on the top right. Playlist pictures are JPEGs next to `state.json` in `playlist-covers/` (`{id}.jpg` custom, `{id}.auto.jpg` mosaic). Set a custom picture with the native file dialog and a path argument. Adding a folder to a playlist keeps the folder; do not snapshot its files. Do not persist per-file resume offsets; leaving a track starts it at 0:00 next time.

## Comments

Comments should use normal engineering terms (extractor client, remux, decoder init). Do not leave chat leftovers or notes aimed at one person.

## Checks

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```
