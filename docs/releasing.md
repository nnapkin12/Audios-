<p align="center">
  <img src="https://github.com/nnapkin12/AudiosPlayer/blob/main/public/audios.png" alt="Audios!" width="360">
</p>

# Releasing

The GitHub project is [AudiosPlayer](https://github.com/nnapkin12/AudiosPlayer). The app itself is still Audios!.

There is no CI. Builds and GitHub Releases are manual.

1. `npm run tauri build`
2. Take these two files from `src-tauri/target/release/bundle/`:
   - `appimage/Audios!_0.1.1_amd64.AppImage`
   - `deb/Audios!_0.1.1_amd64.deb`
3. Create or edit a GitHub Release and attach **only** those two files. Do not attach AppDir folders.
4. Close any old AppImage, open the new one, and play one Search result before calling the release done.

`tauri dev` does not prove the AppImage. Search shells out to host yt-dlp (a Python zipapp), ffmpeg, and curl. The AppImage sets `PYTHONHOME`, `LD_LIBRARY_PATH`, and GTK/GIO paths to its mount; without sanitizing that env, Search fails with `Python path configuration:`.
