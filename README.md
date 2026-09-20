<p align="center">
  <img src="public/audios.png" alt="Audios!" width="360">
</p>

<h1 align="center">Audios!</h1>

<p align="center">
  A Linux desktop music player and metadata editor.<br>
  Play your folders, search for something to hear, edit all tags, customize theme.
</p>

<p align="center">
  <a href="docs/features.md">Features</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/releasing.md">Releasing</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="CREDITS.md">Credits</a> ·
  <a href="LICENSE">MIT</a>
</p>

## What it is

Audios! is a Music player/finder app for people who keep music locally. Open a file or a whole album tree, queue it, and play. There is a Search tab for finding music and saving it(or just hear it once, it caches and auto deletes when you play anything else), a Tags tab for artwork and all metadata, and Settings for themes (including ones you build yourself).

It is built for Linux. Rust, and the window is a small React UI hosted by [Tauri](https://tauri.app/).

It is **not** a Spotify client. Search talks to YouTube through [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Features

- **Music file Player** — open files or nested album folders. Queue, next / previous, repeat, shuffle, gapless, ReplayGain, resume where you left off.
- **Search Music** — type a song name and artist, play it from a temp file, auto deletes that file when you change tracks, or save a copy if you want to keep it.
- **Tags** — metadata. title, artists, album, lyrics, ReplayGain, MusicBrainz IDs, custom fields, artwork, and batch apply across a folder.
- **UI/Themes** — Dusk, Midnight, Slate, Paper, plus a theme builder for your own colors.

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

Search also needs a **current** yt-dlp. Atleast the Ubuntu `apt` package is usually years old and will fail on today’s YouTube. Install the GitHub binary:

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

## build

```bash
npm run tauri build
```

That writes an **AppImage** and a **.deb** under `src-tauri/target/release/bundle/`.

`npm run tauri dev` is a normal process with your usual PATH.

## Releases

GitHub Release assets are those two installer files only. Search still needs a **host** yt-dlp, ffmpeg, and curl; they are not inside the package.

## License

[MIT](LICENSE). Logo marks: [CREDITS.md](CREDITS.md).
