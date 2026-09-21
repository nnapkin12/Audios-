use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::{imageops::FilterType, DynamicImage, Rgb, RgbImage};

use crate::error::{AppError, AppResult};
use crate::persist::{Playlist, PlaylistItem, Store};
use crate::tags::CoverArt;

pub fn list(store: &Store) -> Vec<Playlist> {
    store
        .snapshot()
        .playlists
        .into_iter()
        .map(|playlist| with_cover_flag(store, playlist))
        .collect()
}

fn with_cover_flag(store: &Store, mut playlist: Playlist) -> Playlist {
    playlist.has_cover = cover_file(store, &playlist.id).is_some_and(|path| path.is_file());
    playlist
}

pub fn create(store: &Store, name: String) -> AppResult<Vec<Playlist>> {
    let name = name.trim();
    let name = if name.is_empty() {
        let count = store.snapshot().playlists.len() + 1;
        format!("Playlist {count}")
    } else {
        name.to_string()
    };
    store.update(|data| {
        data.playlists.push(Playlist {
            id: format!("pl-{:016x}", fastrand::u64(..)),
            name,
            items: Vec::new(),
            has_cover: false,
        });
    });
    Ok(list(store))
}

pub fn rename(store: &Store, id: String, name: String) -> AppResult<Vec<Playlist>> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::msg("playlist name cannot be empty"));
    }
    let mut found = false;
    store.update(|data| {
        if let Some(playlist) = data.playlists.iter_mut().find(|playlist| playlist.id == id) {
            playlist.name = name.to_string();
            found = true;
        }
    });
    if !found {
        return Err(AppError::msg("playlist not found"));
    }
    Ok(list(store))
}

pub fn delete(store: &Store, id: String) -> AppResult<Vec<Playlist>> {
    store.update(|data| {
        data.playlists.retain(|playlist| playlist.id != id);
    });
    if let Some(path) = cover_file(store, &id) {
        let _ = std::fs::remove_file(path);
    }
    drop_auto_cover(store, &id);
    Ok(list(store))
}

pub fn set_cover(store: &Store, id: String, data: Vec<u8>) -> AppResult<Vec<Playlist>> {
    playlist_exists(store, &id)?;
    let path = cover_file(store, &id).ok_or_else(|| AppError::msg("bad playlist id"))?;
    write_jpeg(&path, &encode_cover_jpeg(&data)?)?;
    Ok(list(store))
}

pub fn set_cover_from_path(store: &Store, id: String, path: String) -> AppResult<Vec<Playlist>> {
    let data = std::fs::read(&path).map_err(|_| AppError::msg("could not read that picture"))?;
    set_cover(store, id, data)
}

pub fn clear_cover(store: &Store, id: String) -> AppResult<Vec<Playlist>> {
    playlist_exists(store, &id)?;
    if let Some(path) = cover_file(store, &id) {
        let _ = std::fs::remove_file(path);
    }
    drop_auto_cover(store, &id);
    Ok(list(store))
}

pub fn cover(store: &Store, id: &str) -> AppResult<Option<CoverArt>> {
    if let Some(art) = jpeg_from_file(cover_file(store, id)) {
        return Ok(Some(art));
    }
    ensure_auto_cover(store, id);
    Ok(jpeg_from_file(auto_cover_file(store, id)))
}

fn playlist_exists(store: &Store, id: &str) -> AppResult<()> {
    if store
        .snapshot()
        .playlists
        .iter()
        .any(|playlist| playlist.id == id)
    {
        Ok(())
    } else {
        Err(AppError::msg("playlist not found"))
    }
}

fn cover_file(store: &Store, id: &str) -> Option<PathBuf> {
    named_cover(store, id, "jpg")
}

fn auto_cover_file(store: &Store, id: &str) -> Option<PathBuf> {
    named_cover(store, id, "auto.jpg")
}

fn named_cover(store: &Store, id: &str, suffix: &str) -> Option<PathBuf> {
    if id.is_empty()
        || !id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return None;
    }
    Some(
        store
            .config_dir()
            .join("playlist-covers")
            .join(format!("{id}.{suffix}")),
    )
}

fn drop_auto_cover(store: &Store, id: &str) {
    if let Some(path) = auto_cover_file(store, id) {
        let _ = std::fs::remove_file(path);
    }
}

fn jpeg_from_file(path: Option<PathBuf>) -> Option<CoverArt> {
    let path = path?;
    let bytes = std::fs::read(&path).ok()?;
    if bytes.is_empty() {
        return None;
    }
    Some(CoverArt {
        mime: "image/jpeg".into(),
        data_base64: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes),
    })
}

fn write_jpeg(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, bytes)?;
    Ok(())
}

fn encode_cover_jpeg(data: &[u8]) -> AppResult<Vec<u8>> {
    if data.is_empty() {
        return Err(AppError::msg("picture data was empty"));
    }
    rgb_to_jpeg(&downscale_rgb(decode_image(data)?, 1600), 88)
}

fn decode_image(data: &[u8]) -> AppResult<RgbImage> {
    let reader = image::ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|_| AppError::msg("that image could not be read"))?;
    reader
        .decode()
        .map(|image| image.to_rgb8())
        .map_err(|_| AppError::msg("that image could not be read"))
}

fn downscale_rgb(image: RgbImage, max_edge: u32) -> RgbImage {
    let (width, height) = image.dimensions();
    if width <= max_edge && height <= max_edge {
        return image;
    }
    DynamicImage::ImageRgb8(image)
        .resize(max_edge, max_edge, FilterType::Triangle)
        .to_rgb8()
}

fn rgb_to_jpeg(image: &RgbImage, quality: u8) -> AppResult<Vec<u8>> {
    let mut out = Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality)
        .encode(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|_| AppError::msg("could not save playlist picture"))?;
    Ok(out.into_inner())
}

fn ensure_auto_cover(store: &Store, id: &str) {
    let Some(path) = auto_cover_file(store, id) else {
        return;
    };
    if path.is_file() {
        return;
    }
    let Some(jpeg) = build_auto_cover(store, id) else {
        return;
    };
    let _ = write_jpeg(&path, &jpeg);
}

fn build_auto_cover(store: &Store, id: &str) -> Option<Vec<u8>> {
    let playlist = store
        .snapshot()
        .playlists
        .into_iter()
        .find(|playlist| playlist.id == id)?;
    let mut paths: Vec<String> = crate::player::scan::collect_many(&flatten_paths(&playlist), true)
        .into_iter()
        .map(|track| track.path)
        .collect();
    if paths.is_empty() {
        return None;
    }
    let mut rng = fastrand::Rng::with_seed(seed_from_id(id));
    rng.shuffle(&mut paths);
    let mut tiles = Vec::new();
    for path in paths.into_iter().take(48) {
        if let Some(image) = rgb_from_audio(&path) {
            tiles.push(image);
            if tiles.len() == 4 {
                break;
            }
        }
    }
    if tiles.is_empty() {
        return None;
    }
    rgb_to_jpeg(&compose_mosaic(&tiles), 86).ok()
}

fn seed_from_id(id: &str) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    id.hash(&mut hasher);
    hasher.finish()
}

fn rgb_from_audio(path: &str) -> Option<RgbImage> {
    let cover = crate::tags::cover_for(path).ok()??;
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        cover.data_base64.as_bytes(),
    )
    .ok()?;
    decode_image(&bytes).ok()
}

fn compose_mosaic(tiles: &[RgbImage]) -> RgbImage {
    const CELL: u32 = 256;
    if tiles.len() == 1 {
        return DynamicImage::ImageRgb8(tiles[0].clone())
            .resize_to_fill(CELL * 2, CELL * 2, FilterType::Triangle)
            .to_rgb8();
    }
    let mut canvas = RgbImage::from_pixel(CELL * 2, CELL * 2, Rgb([36, 36, 36]));
    let slots = [(0, 0), (CELL, 0), (0, CELL), (CELL, CELL)];
    for (tile, (x, y)) in tiles.iter().take(4).zip(slots) {
        let filled = DynamicImage::ImageRgb8(tile.clone())
            .resize_to_fill(CELL, CELL, FilterType::Triangle)
            .to_rgb8();
        image::imageops::replace(&mut canvas, &filled, i64::from(x), i64::from(y));
    }
    canvas
}

pub fn add_paths(store: &Store, id: String, paths: Vec<String>) -> AppResult<Vec<Playlist>> {
    if paths.is_empty() {
        return Err(AppError::msg("Nothing to add"));
    }
    let songs = expand_songs(&paths)?;
    if songs.is_empty() {
        return Err(AppError::msg("No songs here"));
    }
    let mut found = false;
    store.update(|data| {
        if let Some(playlist) = data.playlists.iter_mut().find(|playlist| playlist.id == id) {
            found = true;
            for path in &songs {
                if playlist.items.iter().any(|item| item.path == *path) {
                    continue;
                }
                playlist.items.push(PlaylistItem {
                    path: path.clone(),
                    kind: "file".into(),
                });
            }
        }
    });
    if !found {
        return Err(AppError::msg("playlist not found"));
    }
    drop_auto_cover(store, &id);
    Ok(list(store))
}

pub fn remove_item(store: &Store, id: String, path: String) -> AppResult<Vec<Playlist>> {
    let mut found = false;
    store.update(|data| {
        if let Some(playlist) = data.playlists.iter_mut().find(|playlist| playlist.id == id) {
            found = true;
            playlist.items = split_out_song(&playlist.items, &path);
        }
    });
    if !found {
        return Err(AppError::msg("playlist not found"));
    }
    drop_auto_cover(store, &id);
    Ok(list(store))
}

fn expand_songs(paths: &[String]) -> AppResult<Vec<String>> {
    let mut songs = Vec::new();
    for path in paths {
        let root = Path::new(path);
        if root.is_dir() {
            for file in crate::player::scan::audio_paths(root)? {
                push_unique(&mut songs, file.to_string_lossy().to_string());
            }
            continue;
        }
        if root.exists() && !crate::player::scan::is_audio_path(root) {
            continue;
        }
        push_unique(&mut songs, path.clone());
    }
    Ok(songs)
}

fn split_out_song(items: &[PlaylistItem], path: &str) -> Vec<PlaylistItem> {
    let mut next = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for item in items {
        if item.path == path {
            continue;
        }
        if item.kind == "dir" && Path::new(path).starts_with(Path::new(&item.path)) {
            if let Ok(files) = crate::player::scan::audio_paths(Path::new(&item.path)) {
                for file in files {
                    let song = file.to_string_lossy().to_string();
                    if song == path || !seen.insert(song.clone()) {
                        continue;
                    }
                    next.push(PlaylistItem {
                        path: song,
                        kind: "file".into(),
                    });
                }
            }
            continue;
        }
        if seen.insert(item.path.clone()) {
            next.push(item.clone());
        }
    }
    next
}

fn push_unique(songs: &mut Vec<String>, path: String) {
    if !songs.iter().any(|song| song == &path) {
        songs.push(path);
    }
}

pub fn flatten_paths(playlist: &Playlist) -> Vec<String> {
    playlist
        .items
        .iter()
        .map(|item| item.path.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persist::{PlaylistItem, Store};

    fn store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::for_test(dir.path());
        (dir, store)
    }

    #[test]
    fn create_and_add() {
        let (_dir, store) = store();
        let playlists = create(&store, "Late".into()).unwrap();
        assert_eq!(playlists.len(), 1);
        assert!(!playlists[0].has_cover);
        let id = playlists[0].id.clone();
        let playlists = add_paths(&store, id, vec!["/a/song.mp3".into()]).unwrap();
        assert_eq!(playlists[0].items.len(), 1);
        assert_eq!(playlists[0].items[0].kind, "file");
    }

    #[test]
    fn add_folder_stores_songs() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::for_test(dir.path());
        let album = dir.path().join("album");
        std::fs::create_dir_all(&album).unwrap();
        std::fs::write(album.join("a.mp3"), []).unwrap();
        std::fs::write(album.join("b.mp3"), []).unwrap();
        std::fs::write(album.join("notes.txt"), []).unwrap();
        let playlists = create(&store, "Late".into()).unwrap();
        let id = playlists[0].id.clone();
        let playlists = add_paths(&store, id, vec![album.to_string_lossy().into()]).unwrap();
        assert_eq!(playlists[0].items.len(), 2);
        assert!(playlists[0].items.iter().all(|item| item.kind == "file"));
    }

    #[test]
    fn add_empty_folder_fails() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::for_test(dir.path());
        let album = dir.path().join("empty");
        std::fs::create_dir_all(&album).unwrap();
        let playlists = create(&store, "Late".into()).unwrap();
        let id = playlists[0].id.clone();
        assert!(add_paths(&store, id, vec![album.to_string_lossy().into()]).is_err());
    }

    #[test]
    fn remove_song_splits_legacy_folder() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::for_test(dir.path());
        let album = dir.path().join("album");
        std::fs::create_dir_all(&album).unwrap();
        let a = album.join("a.mp3");
        let b = album.join("b.mp3");
        std::fs::write(&a, []).unwrap();
        std::fs::write(&b, []).unwrap();
        let playlists = create(&store, "Late".into()).unwrap();
        let id = playlists[0].id.clone();
        store.update(|data| {
            data.playlists[0].items = vec![PlaylistItem {
                path: album.to_string_lossy().into(),
                kind: "dir".into(),
            }];
        });
        let playlists = remove_item(&store, id, a.to_string_lossy().into()).unwrap();
        assert_eq!(playlists[0].items.len(), 1);
        assert_eq!(playlists[0].items[0].path, b.to_string_lossy());
        assert_eq!(playlists[0].items[0].kind, "file");
    }

    #[test]
    fn encode_cover_jpeg_accepts_png() {
        let image = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            2,
            2,
            image::Rgb([10, 20, 30]),
        ));
        let mut png = Cursor::new(Vec::new());
        image.write_to(&mut png, image::ImageFormat::Png).unwrap();
        let jpeg = encode_cover_jpeg(png.get_ref()).unwrap();
        assert_eq!(&jpeg[0..2], &[0xFF, 0xD8]);
    }

    #[test]
    fn playlist_cover_round_trip() {
        let (_dir, store) = store();
        let playlists = create(&store, "Late".into()).unwrap();
        let id = playlists[0].id.clone();
        let image = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            2,
            2,
            image::Rgb([10, 20, 30]),
        ));
        let mut png = Cursor::new(Vec::new());
        image.write_to(&mut png, image::ImageFormat::Png).unwrap();
        let playlists = set_cover(&store, id.clone(), png.into_inner()).unwrap();
        assert!(playlists[0].has_cover);
        assert!(cover(&store, &id).unwrap().is_some());
        let playlists = clear_cover(&store, id).unwrap();
        assert!(!playlists[0].has_cover);
    }

    #[test]
    fn mosaic_uses_up_to_four_tiles() {
        let red = RgbImage::from_pixel(8, 8, Rgb([200, 20, 20]));
        let mosaic = compose_mosaic(&[red.clone()]);
        assert_eq!(mosaic.dimensions(), (512, 512));
        let mosaic = compose_mosaic(&[
            red,
            RgbImage::from_pixel(8, 8, Rgb([20, 200, 20])),
            RgbImage::from_pixel(8, 8, Rgb([20, 20, 200])),
            RgbImage::from_pixel(8, 8, Rgb([200, 200, 20])),
        ]);
        assert_eq!(mosaic.get_pixel(10, 10), &Rgb([200, 20, 20]));
        assert_eq!(mosaic.get_pixel(300, 10), &Rgb([20, 200, 20]));
    }
}
