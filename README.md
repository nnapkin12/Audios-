<p align="center">
  <img src="public/audios.png" alt="Audios!" width="360">
</p>

<h1 align="center">Audios!</h1>

<p align="center">
  A Linux desktop music player and metadata editor.<br>
  Local libraries, YouTube search via yt-dlp, tag editing, and custom themes.
</p>

<p align="center">
  <a href="docs/features.md">Features</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="https://github.com/nnapkin12/AudiosPlayer/wiki">Wiki</a> ·
  <a href="LICENSE">MIT</a>
</p>

<p align="center">
  GitHub: <a href="https://github.com/nnapkin12/AudiosPlayer">AudiosPlayer</a>
</p>

## What it is

Audios! is a Linux music player for local files. Open a file or a nested album tree, queue it, and play. Search uses [yt-dlp](https://github.com/yt-dlp/yt-dlp) to list YouTube results, then caches a temp file for playback (deleted when the track changes) or saves a copy. The Tags tab edits metadata and artwork. Settings includes built-in themes and a theme builder.

It is built with Rust and a React UI hosted by [Tauri](https://tauri.app/).

It is **not** a Spotify client. Search cannot pull Spotify-hosted audio.

## Features

- **Music file Player** — open files or nested album folders. Queue, next / previous, repeat, shuffle, gapless, ReplayGain. Playlists can be named, custom picture, otherwise a mosaic is built from track artwork. Folder and playlist lists have their own search bars.
- **Search** — query by song and artist (or paste a YouTube URL). Play uses a temp file that is deleted on track change; Download keeps a copy. Each result shows the watch URL.
- **Tags** — title, artists, album, lyrics, ReplayGain, MusicBrainz IDs, custom fields, artwork, and batch apply across a folder.
- **Themes** — Dusk, Midnight, Slate, Paper, plus a theme builder.

A longer list lives in [docs/features.md](docs/features.md).

## Run

You need Rust 1.80+, Node 18+, and the usual Tauri / ALSA packages:

```bash
sudo apt install \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libasound2-dev \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  ffmpeg
```

Then:

```bash
npm install
npm run tauri dev
```

`npm run dev` is a UI-only preview (no playback or tag writes).

### Search extras

Search also needs a **current** yt-dlp. Distro `apt` packages are often years old and fail on current YouTube. Install the GitHub binary:

```bash
mkdir -p ~/.local/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
chmod a+rx ~/.local/bin/yt-dlp
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
hash -r
yt-dlp --version
```

Restart Audios! after installing. Later updates: `yt-dlp -U`.

## Build

```bash
npm run tauri build
```

That writes an **AppImage** and a **.deb** under `src-tauri/target/release/bundle/`.

`npm run tauri dev` uses the host PATH. Search binaries are resolved from PATH, `~/.local/bin`, and pipx.

## Releases

GitHub Release assets are those two installer files only. Search still needs a **host** yt-dlp, ffmpeg, and curl; they are not inside the package.

## License

[MIT](LICENSE). Logo marks: [CREDITS.md](CREDITS.md).
