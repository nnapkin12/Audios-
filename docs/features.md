<p align="center">
  <img src="https://github.com/nnapkin12/Audios-/blob/main/public/audios.png" alt="Audios!" width="360">
</p>

# Audios! full Features list

## Music files Player

- Open a file, a folder, or nested album folders.
- Library roots persist across restarts.
- Queue with next / previous, repeat (off / one / all), and shuffle.
- Gapless: the next file is appended to the rodio sink before the current track ends.
- ReplayGain from track/album tags (can be toggled).
- Resume position per file; cleared when the track is within three seconds of the end.
- Folder tree, playlists, and a virtualized track list.
- Now-playing bar plus a full now-playing view (`f` to open, `Esc` to close).
- Transport keys: Space play/pause, arrows seek ±5s, `n` / `p` next / previous.
- Cover art from embedded pictures.
- Frameless title bar with drag, minimize, maximize, close.

## Music Search (and save)

- `yt-dlp` `ytsearch` lists titles and watch URLs (no audio yet).
- Play downloads a temp file, remuxes it so rodio can decode it, then plays it.
- Temp files are deleted when the user starts a different search track.
- Download keeps a copy via the system save dialog.
- Accepts a search string or a YouTube URL.
- Needs a current yt-dlp (apt package is sometimes old), ffmpeg, and curl.
- best results ive gotten is when typing an artist name and song name together: '|artist| |song name|' or vise versa.

Search is YouTube-backed. It does not log into Spotify and cannot pull Spotify-hosted audio.

## Metadata & Tags

- Read and write the fields [lofty](https://docs.rs/lofty) understands for that container.
- Artwork add / remove / export.
- Lyrics, ReplayGain, MusicBrainz IDs, custom frames.
- Batch apply across a folder of files.
- Writes go through a temp file, then replace the original.

## Theme & Appearance

- Built-in themes: Dusk, Midnight, Slate, Paper.
- Accents: Blue, Amber, Sage, Rose, Violet.
- Theme builder: edit each color, preview, name it, save as a custom theme in `state.json`.

## What this is not

- Not a Spotify client or downloader.
- Not a browser stream player. Search always materializes a local file.
