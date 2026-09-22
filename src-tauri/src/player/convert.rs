use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::error::{AppError, AppResult};

// Some MP4/AAC files make Symphonia panic inside Decoder::new. Play a cached
// transcode of those files. The library file is never modified or removed.
pub fn for_playback(path: &Path) -> AppResult<PathBuf> {
    if let Some(cached) = fresh_cache(path) {
        return Ok(cached);
    }
    match super::engine::probe_audio(path) {
        Ok(()) => Ok(path.to_path_buf()),
        Err(error) if !path.is_file() => Err(error),
        Err(error) => transcode(path).map_err(|convert_error| {
            let detail = convert_error.to_string();
            if detail.to_lowercase().contains("ffmpeg") {
                AppError::msg(format!("{error}. {detail}"))
            } else {
                error
            }
        }),
    }
}

fn fresh_cache(path: &Path) -> Option<PathBuf> {
    let (mp3, wav) = cache_paths(path)?;
    [mp3, wav].into_iter().find(|candidate| {
        candidate.is_file()
            && candidate
                .metadata()
                .map(|meta| meta.len() > 0)
                .unwrap_or(false)
    })
}

fn cache_paths(path: &Path) -> Option<(PathBuf, PathBuf)> {
    let meta = path.metadata().ok()?;
    let stamp = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_nanos();
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .hash(&mut hasher);
    stamp.hash(&mut hasher);
    meta.len().hash(&mut hasher);
    let id = format!("{:016x}", hasher.finish());
    let dir = playback_cache_dir();
    Some((dir.join(format!("{id}.mp3")), dir.join(format!("{id}.wav"))))
}

fn playback_cache_dir() -> PathBuf {
    #[cfg(test)]
    if let Some(dir) = CACHE_OVERRIDE.with(|slot| slot.borrow().clone()) {
        let _ = std::fs::create_dir_all(&dir);
        return dir;
    }
    let dirs = directories::ProjectDirs::from("com", "audios", "Audios")
        .expect("a home directory is required");
    let dir = dirs.cache_dir().join("playback");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn transcode(path: &Path) -> AppResult<PathBuf> {
    if !path.is_file() {
        return Err(AppError::msg(format!("missing path: {}", path.display())));
    }
    let ffmpeg = crate::search::find_tool("ffmpeg").ok_or_else(|| {
        AppError::msg(
            "ffmpeg is required to play this file. Install it with: sudo apt install ffmpeg",
        )
    })?;
    let (mp3, wav) = cache_paths(path).ok_or_else(|| AppError::msg("could not cache playback"))?;
    std::fs::create_dir_all(playback_cache_dir())?;
    if let Some(ready) = run_ffmpeg(
        &ffmpeg,
        path,
        &mp3,
        &["-codec:a", "libmp3lame", "-q:a", "4"],
    ) {
        return Ok(ready);
    }
    if let Some(ready) = run_ffmpeg(
        &ffmpeg,
        path,
        &wav,
        &["-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2"],
    ) {
        return Ok(ready);
    }
    let _ = std::fs::remove_file(&mp3);
    let _ = std::fs::remove_file(&wav);
    Err(AppError::msg("could not convert it for playback"))
}

fn run_ffmpeg(ffmpeg: &Path, source: &Path, dest: &Path, extra: &[&str]) -> Option<PathBuf> {
    let output = crate::search::spawn_tool(ffmpeg)
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(source)
        .args(["-vn"])
        .args(extra)
        .arg(dest)
        .output()
        .ok()?;
    if output.status.success()
        && dest.is_file()
        && dest.metadata().map(|meta| meta.len() > 0).unwrap_or(false)
    {
        return Some(dest.to_path_buf());
    }
    let _ = std::fs::remove_file(dest);
    None
}

#[cfg(test)]
use std::cell::RefCell;

#[cfg(test)]
thread_local! {
    static CACHE_OVERRIDE: RefCell<Option<PathBuf>> = const { RefCell::new(None) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversion_does_not_modify_the_library_file() {
        let dir = tempfile::tempdir().unwrap();
        CACHE_OVERRIDE.with(|slot| *slot.borrow_mut() = Some(dir.path().join("cache")));
        let source = dir.path().join("song.m4a");
        std::fs::write(&source, b"not a real m4a").unwrap();
        let _ = for_playback(&source);
        assert_eq!(std::fs::read(&source).unwrap(), b"not a real m4a");
        CACHE_OVERRIDE.with(|slot| *slot.borrow_mut() = None);
    }
}
