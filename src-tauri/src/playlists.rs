use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::persist::{Playlist, PlaylistItem, Store};

pub fn list(store: &Store) -> Vec<Playlist> {
    store.snapshot().playlists
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
    Ok(list(store))
}

pub fn add_paths(store: &Store, id: String, paths: Vec<String>) -> AppResult<Vec<Playlist>> {
    if paths.is_empty() {
        return Err(AppError::msg("nothing to add"));
    }
    let mut found = false;
    store.update(|data| {
        if let Some(playlist) = data.playlists.iter_mut().find(|playlist| playlist.id == id) {
            found = true;
            for path in &paths {
                if playlist.items.iter().any(|item| item.path == *path) {
                    continue;
                }
                let kind = if Path::new(path).is_dir() {
                    "dir"
                } else {
                    "file"
                };
                playlist.items.push(PlaylistItem {
                    path: path.clone(),
                    kind: kind.into(),
                });
            }
        }
    });
    if !found {
        return Err(AppError::msg("playlist not found"));
    }
    Ok(list(store))
}

pub fn remove_item(store: &Store, id: String, path: String) -> AppResult<Vec<Playlist>> {
    let mut found = false;
    store.update(|data| {
        if let Some(playlist) = data.playlists.iter_mut().find(|playlist| playlist.id == id) {
            found = true;
            playlist.items.retain(|item| item.path != path);
        }
    });
    if !found {
        return Err(AppError::msg("playlist not found"));
    }
    Ok(list(store))
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
    use crate::persist::Store;

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
        let id = playlists[0].id.clone();
        let playlists = add_paths(&store, id, vec!["/a/song.mp3".into()]).unwrap();
        assert_eq!(playlists[0].items.len(), 1);
        assert_eq!(playlists[0].items[0].kind, "file");
    }
}
