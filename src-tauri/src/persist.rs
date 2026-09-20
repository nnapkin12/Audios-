use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::player::queue::RepeatMode;

const MAX_POSITIONS: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItem {
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub items: Vec<PlaylistItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistData {
    pub last_root: Option<String>,
    #[serde(default)]
    pub library_roots: Vec<String>,
    pub volume: f64,
    pub muted: bool,
    pub repeat: RepeatMode,
    pub shuffle: bool,
    pub replaygain: bool,
    pub gapless: bool,
    pub positions: HashMap<String, u64>,
    #[serde(default)]
    pub playlists: Vec<Playlist>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_accent")]
    pub accent: String,
    #[serde(default)]
    pub custom_themes: Vec<CustomTheme>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomTheme {
    pub id: String,
    pub name: String,
    pub colors: ThemeColors,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeColors {
    pub frame: String,
    pub app: String,
    pub raised: String,
    pub bar: String,
    pub bar_line: String,
    pub hover: String,
    pub border: String,
    pub line: String,
    pub muted: String,
    pub text: String,
    pub subtle: String,
    pub danger: String,
    pub play: String,
    pub play_fg: String,
    pub accent: String,
    pub accent_dim: String,
}

fn default_theme() -> String {
    "dusk".into()
}

fn default_accent() -> String {
    "blue".into()
}

impl Default for PersistData {
    fn default() -> Self {
        Self {
            last_root: None,
            library_roots: Vec::new(),
            volume: 0.85,
            muted: false,
            repeat: RepeatMode::Off,
            shuffle: false,
            replaygain: true,
            gapless: true,
            positions: HashMap::new(),
            playlists: Vec::new(),
            theme: default_theme(),
            accent: default_accent(),
            custom_themes: Vec::new(),
        }
    }
}

#[derive(Clone)]
pub struct Store {
    path: PathBuf,
    data: Arc<Mutex<PersistData>>,
}

impl Store {
    #[cfg(test)]
    pub fn for_test(dir: &Path) -> Self {
        Self {
            path: dir.join("state.json"),
            data: Arc::new(Mutex::new(PersistData::default())),
        }
    }

    pub fn load() -> Self {
        let path = config_path();
        let mut data: PersistData = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        if data.library_roots.is_empty() {
            if let Some(root) = data.last_root.clone() {
                if !root.trim().is_empty() {
                    data.library_roots.push(root);
                }
            }
        }
        Self {
            path,
            data: Arc::new(Mutex::new(data)),
        }
    }

    pub fn snapshot(&self) -> PersistData {
        self.data.lock().expect("persist lock").clone()
    }

    pub fn update<F>(&self, mutate: F)
    where
        F: FnOnce(&mut PersistData),
    {
        let mut data = self.data.lock().expect("persist lock");
        mutate(&mut data);
        let _ = save_to(&self.path, &data);
    }

    pub fn position_for(&self, path: &str) -> Option<u64> {
        self.data
            .lock()
            .expect("persist lock")
            .positions
            .get(path)
            .copied()
    }

    pub fn remember_position(&self, path: &str, position_ms: u64, duration_ms: u64) {
        self.update(|data| {
            if duration_ms > 0 && position_ms + 3000 >= duration_ms {
                data.positions.remove(path);
                return;
            }
            data.positions.insert(path.to_string(), position_ms);
            if data.positions.len() > MAX_POSITIONS {
                let extra = data.positions.len() - MAX_POSITIONS;
                let keys: Vec<String> = data.positions.keys().take(extra).cloned().collect();
                for key in keys {
                    data.positions.remove(&key);
                }
            }
        });
    }
}

pub fn rename_atomic(from: &Path, to: &Path) -> AppResult<()> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            std::fs::copy(from, to)?;
            std::fs::remove_file(from)?;
            Ok(())
        }
    }
}

fn config_path() -> PathBuf {
    let dirs = directories::ProjectDirs::from("com", "audios", "Audios")
        .expect("a home directory is required");
    let dir = dirs.config_dir();
    let _ = std::fs::create_dir_all(dir);
    dir.join("state.json")
}

fn save_to(path: &Path, data: &PersistData) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(data)?)?;
    rename_atomic(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_volume_is_safe() {
        let data = PersistData::default();
        assert!(data.volume > 0.0 && data.volume <= 1.0);
        assert!(data.gapless);
        assert!(data.replaygain);
        assert!(data.library_roots.is_empty());
        assert!(data.custom_themes.is_empty());
    }

    #[test]
    fn appearance_survives_old_state() {
        let data: PersistData = serde_json::from_str(
            r#"{"lastRoot":null,"volume":0.5,"muted":false,"repeat":"off","shuffle":false,"replaygain":true,"gapless":true,"positions":{}}"#,
        )
        .unwrap();
        assert_eq!(data.theme, "dusk");
        assert!(data.custom_themes.is_empty());
    }

    #[test]
    fn drops_near_end_positions() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store {
            path: dir.path().join("state.json"),
            data: Arc::new(Mutex::new(PersistData::default())),
        };
        store.remember_position("/song.flac", 180_000, 181_000);
        assert!(store.position_for("/song.flac").is_none());
        store.remember_position("/song.flac", 20_000, 181_000);
        assert_eq!(store.position_for("/song.flac"), Some(20_000));
    }
}
