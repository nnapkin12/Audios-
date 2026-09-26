<p align="center">
  <img src="https://github.com/nnapkin12/AudiosPlayer/blob/main/public/audios.png" alt="Audios!" width="360">
</p>

# Audios! Features list

## Music Player

- Open a file, folder, or nested folders, to create a library, or a playlist.
- Library folders stay tied to the disk. Songs added or removed outside Audios! show up, including while the app is open and after a restart.
- Library persist across restarts.
- Queue with next / previous, repeat (off / one / all), and shuffle.
- Gapless: the next song is appended to the rodio sink before the current track ends.
- App-wide parametric equalizer in Settings → Equalizer. One curve for everything Audios! plays. A response graph shows that curve. Enable turns it on. Flat, and Off, leave the signal alone.
- Simple view: Bass, Low, Mid, Presence, and Air, each ±12 dB, plus Level and Prevent clipping. Advanced edits frequency, Q, and filter type (peak, low shelf, high shelf) on all ten bands. Paste an AutoEQ ParametricEQ block (preamp, PK, LSC, HSC). Built-in presets cannot be overwritten. Name and save up to 20 of your own; they live in `state.json` with custom themes. An older ten-band graphic curve loads as peaks at the old centers.
- ReplayGain from track/album tags (can be toggled).
- Leaving a song forgets its place.
- Library, playlists, and a virtualized song list.
- Playlists are created by pressing +. Add a file, or a folder. A folder stays linked, so songs added or removed on disk show up in that playlist. A custom picture can be set from a local image. If none is set, Audios! builds a 2×2 mosaic from up to four embedded track pictures. On an open playlist, artist, or album, that cover is a small square above the name so more songs stay on screen.
- Library and playlist views have a search bar that filters the open list.
- Track rows show a play overlay on the cover when you hover, the current playing track shows pause instead, and clicking it pauses.
- Now-playing bar plus a full now-playing view (`f` to open, `Esc` to close). The full view takes its colors from the album art. The rest of the app stays on your theme.
- If a song or album folder was moved or renamed, Audios! relinks it when the file name is unique. Otherwise the item stays listed and **Locate** asks you to point at the new path.
- Transport keys: Space play/pause, arrows seek ±5s, `n` / `p` next / previous.
- Playback speed from 0.5× to 2×. Pitch moves with the tempo. The speed button sits beside the transport so play stays centered. Open it to step by 0.05 or type a number.
- Linux desktops that speak MPRIS (GNOME, KDE, and other bars) show the current song, album art, and play, pause, seek, next, and previous.
- The window resizes from its edges. The minimum size is small enough for a tiling window manager to shrink it.
- Frameless title bar with custom minimize / maximize / close on the top right. A hairline sits on the outer edge.
- An AppImage writes its own menu entry on launch (`~/.local/share/applications`), under Multimedia. A `.deb` install does that through the package.

## Music Search (and save)

- `yt-dlp` lists YouTube and SoundCloud. Paste a link to play a track from another site yt-dlp supports. Each result shows the page URL and can open it in the browser.
- Play downloads a temp file, remuxes it so rodio can decode it, then plays it.
- Temp files are deleted when a different search track starts.
- Download button on each entry, keeps a copy via the system save dialog.
- Accepts a search string, or a link from YouTube, SoundCloud, or another site yt-dlp supports.
- Needs a current yt-dlp (distro packages are often stale), ffmpeg, and curl.
- Queries that include both artist and title usually rank better than a title alone.

Search lists YouTube and SoundCloud. A pasted link can come from another site yt-dlp supports. It does not log into Spotify and cannot pull Spotify-hosted audio.

## Metadata Editor

- Read and write the fields [lofty](https://docs.rs/lofty) understands for that container.
- Artwork add / remove / export. Find artwork searches the track name (same listing as Search) and can embed a thumbnail without leaving the editor.
- Lyrics, ReplayGain, MusicBrainz IDs, custom frames.
- Batch apply across a folder of files.
- Writes go through a temp file, then replace the original. Saving updates the open list and the song that is playing, without a restart.
- Save stays pinned at the bottom of the editor. Ctrl+S saves the open file.

## Theme & Appearance

- Built-in themes: Dusk, Midnight, Slate, Paper.
- Accents: Blue, Amber, Sage, Rose, Violet.
- Minimize movement: fewer UI animations, stored in `state.json`.
- Theme builder: grouped colors first, Advanced for each token, preview, name it, save as a custom theme in `state.json`.

## this is not

-  a Spotify client or downloader.
-  a browser stream player. Search always materializes a local file.
