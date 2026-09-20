<p align="center">
  <img src="https://github.com/nnapkin12/AudiosPlayer/blob/main/public/audios.png" alt="Audios!" width="360">
</p>

# Audios! full Features list

## Music files Player

- Open a file, a folder, or nested album folders.
- Library roots persist across restarts.
- Queue with next / previous, repeat (off / one / all), and shuffle.
- Gapless: the next file is appended to the rodio sink before the current track ends.
- ReplayGain from track/album tags (can be toggled).
- Leaving a song forgets its place.
- Folder tree, playlists, and a virtualized track list.
- Playlists can be renamed after they are saved. A custom picture can be set from a local image file. If none is set, Audios! builds a 2×2 mosaic from up to four embedded track pictures.
- Folder and playlist views have a search bar that filters the open list.
- Track rows show a play overlay on the cover when you hover, the current playing track shows pause instead, and clicking it pauses.
- Now-playing bar plus a full now-playing view (`f` to open, `Esc` to close).
- Transport keys: Space play/pause, arrows seek ±5s, `n` / `p` next / previous.
- Cover art from embedded pictures.
- Frameless title bar with custom minimize / maximize / close on the top right.

## Music Search (and save)

- `yt-dlp` `ytsearch` lists titles and watch URLs (no audio yet). Each result shows the watch URL and can open it in the browser.
- Play downloads a temp file, remuxes it so rodio can decode it, then plays it.
- Temp files are deleted when a different search track starts.
- Download button on each entry, keeps a copy via the system save dialog.
- Accepts a search string or a YouTube URL.
- Needs a current yt-dlp (distro packages are often stale), ffmpeg, and curl.
- Queries that include both artist and title usually rank better than a title alone.

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
