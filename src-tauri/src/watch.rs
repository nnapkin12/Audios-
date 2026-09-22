use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::persist::Store;

pub const CHANGED_EVENT: &str = "library://changed";

pub fn spawn(app: AppHandle, store: Store) {
    let _ = std::thread::Builder::new()
        .name("audios-watch".into())
        .spawn(move || run(app, store));
}

fn run(app: AppHandle, store: Store) {
    let (tx, rx) = mpsc::channel();
    let mut watcher =
        notify::recommended_watcher(move |result: Result<notify::Event, notify::Error>| {
            if result.is_ok() {
                let _ = tx.send(());
            }
        })
        .ok();
    let Some(watcher) = watcher.as_mut() else {
        return;
    };
    let mut watching = Vec::new();
    loop {
        rewatch(watcher, &mut watching, dirs_to_watch(&store));
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(()) => {
                while rx.try_recv().is_ok() {}
                std::thread::sleep(Duration::from_millis(400));
                while rx.try_recv().is_ok() {}
                crate::playlists::sync(&store);
                crate::library::prune_missing(&store);
                let _ = app.emit(CHANGED_EVENT, ());
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn rewatch(watcher: &mut RecommendedWatcher, current: &mut Vec<PathBuf>, wanted: Vec<PathBuf>) {
    if *current == wanted {
        return;
    }
    for path in current.drain(..) {
        let _ = watcher.unwatch(&path);
    }
    for path in wanted {
        if watcher.watch(&path, RecursiveMode::Recursive).is_ok() {
            current.push(path);
        }
    }
}

pub fn dirs_to_watch(store: &Store) -> Vec<PathBuf> {
    let data = store.snapshot();
    let mut dirs = Vec::new();
    for root in data.library_roots {
        push_dir(&mut dirs, PathBuf::from(root));
    }
    for playlist in data.playlists {
        for item in playlist.items {
            if item.kind == "exclude" {
                continue;
            }
            let path = PathBuf::from(&item.path);
            if item.kind == "dir" || path.is_dir() {
                push_dir(&mut dirs, path);
            } else if let Some(parent) = path.parent() {
                push_dir(&mut dirs, parent.to_path_buf());
            }
        }
    }
    dirs.sort();
    dirs.dedup();
    let mut covered = Vec::new();
    for dir in dirs {
        if covered
            .iter()
            .any(|parent: &PathBuf| dir.starts_with(parent))
        {
            continue;
        }
        covered.push(dir);
    }
    covered
}

fn push_dir(dirs: &mut Vec<PathBuf>, path: PathBuf) {
    if path.is_dir() {
        dirs.push(path);
    }
}
