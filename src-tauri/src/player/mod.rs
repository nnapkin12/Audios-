mod convert;
pub mod engine;
pub mod queue;
pub mod scan;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::eq::{self, EqPersist, EqUpdate, EqUserPreset};
use crate::error::{AppError, AppResult};
use crate::persist::Store;

use self::engine::{PlayerEngine, RodioEngine};
use self::queue::{Queue, RepeatMode};
use self::scan::{collect_tracks, replaygain_multiplier, track_from_path, FolderNode, Track};

pub const STATE_EVENT: &str = "player://state";
pub const TICK_EVENT: &str = "player://tick";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSnapshot {
    pub current: Option<Track>,
    pub index: usize,
    pub queue: Vec<Track>,
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub volume: f64,
    pub muted: bool,
    pub repeat: RepeatMode,
    pub shuffle: bool,
    pub replaygain: bool,
    pub gapless: bool,
    pub eq: eq::EqState,
    pub root: Option<String>,
    pub tree: Option<FolderNode>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tick {
    pub position_ms: u64,
    pub duration_ms: u64,
}

struct Logic {
    queue: Queue,
    volume: f64,
    muted: bool,
    replaygain: bool,
    gapless: bool,
    root: Option<PathBuf>,
    error: Option<String>,
    pending_gapless: bool,
    want_playing: bool,
    eq: EqPersist,
}

#[derive(Clone)]
pub struct Player {
    engine: Arc<RodioEngine>,
    logic: Arc<Mutex<Logic>>,
    persist: Store,
    app: AppHandle,
}

impl Player {
    pub fn new(app: AppHandle, persist: Store) -> Self {
        let saved = persist.snapshot();
        let player = Self {
            engine: Arc::new(RodioEngine::new()),
            logic: Arc::new(Mutex::new(Logic {
                queue: Queue::with_modes(saved.repeat, saved.shuffle),
                volume: saved.volume,
                muted: saved.muted,
                replaygain: saved.replaygain,
                gapless: saved.gapless,
                root: None,
                error: None,
                pending_gapless: false,
                want_playing: false,
                eq: saved.eq.clone(),
            })),
            persist,
            app,
        };
        crate::search::clear_temps();
        let _ = player.engine.set_eq(eq::EqParams::from_persist(&saved.eq));

        let weak = player.clone();
        std::thread::Builder::new()
            .name("audios-ticker".into())
            .spawn(move || loop {
                std::thread::sleep(Duration::from_millis(250));
                weak.tick();
            })
            .expect("player ticker");

        player
    }

    pub fn snapshot(&self) -> PlayerSnapshot {
        self.snapshot_eq(false)
    }

    pub fn snapshot_ui(&self) -> PlayerSnapshot {
        self.snapshot_eq(true)
    }

    fn snapshot_eq(&self, eq_catalog: bool) -> PlayerSnapshot {
        let logic = self.logic.lock().expect("player lock");
        PlayerSnapshot {
            current: logic.queue.current().cloned(),
            index: logic.queue.index,
            // Webview only needs the current track. Skip the queue, folder tree,
            // and EQ catalog on volume/seek ticks so IPC stays small.
            queue: Vec::new(),
            playing: self.engine.is_playing(),
            position_ms: self.engine.position_ms(),
            duration_ms: self.current_duration(&logic),
            volume: logic.volume,
            muted: logic.muted,
            repeat: logic.queue.repeat,
            shuffle: logic.queue.shuffle,
            replaygain: logic.replaygain,
            gapless: logic.gapless,
            eq: if eq_catalog {
                eq::state_with_catalog(&logic.eq)
            } else {
                eq::state_from(&logic.eq)
            },
            root: logic
                .root
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            tree: None,
            error: logic.error.clone(),
        }
    }

    pub fn open_path(&self, path: &str) -> AppResult<PlayerSnapshot> {
        self.open_path_inner(path, true)?;
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn play(&self) -> AppResult<PlayerSnapshot> {
        self.engine.play()?;
        self.logic.lock().expect("player lock").want_playing = true;
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn pause(&self) -> AppResult<PlayerSnapshot> {
        self.engine.pause()?;
        self.logic.lock().expect("player lock").want_playing = false;
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn toggle(&self) -> AppResult<PlayerSnapshot> {
        if self.engine.is_playing() {
            self.pause()
        } else {
            if self
                .logic
                .lock()
                .expect("player lock")
                .queue
                .current()
                .is_none()
            {
                return Err(AppError::msg("Nothing playing"));
            }
            self.play()
        }
    }

    pub fn stop(&self) -> AppResult<PlayerSnapshot> {
        self.forget_current();
        self.engine.stop()?;
        self.logic.lock().expect("player lock").want_playing = false;
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn next(&self) -> AppResult<PlayerSnapshot> {
        self.forget_current();
        let next_path = {
            let mut logic = self.logic.lock().expect("player lock");
            logic.pending_gapless = false;
            logic.queue.advance().map(|track| track.path.clone())
        };
        match next_path {
            Some(path) => self.load_and_maybe_play(&path, true)?,
            None => {
                self.engine.pause()?;
                let _ = self.engine.seek(0);
                self.logic.lock().expect("player lock").want_playing = false;
            }
        }
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn previous(&self) -> AppResult<PlayerSnapshot> {
        if self.engine.position_ms() > 3000 {
            self.engine.seek(0)?;
            self.emit_state();
            return Ok(self.snapshot());
        }
        self.forget_current();
        let previous = {
            let mut logic = self.logic.lock().expect("player lock");
            logic.pending_gapless = false;
            logic.queue.retreat().map(|track| track.path.clone())
        };
        if let Some(path) = previous {
            self.load_and_maybe_play(&path, true)?;
        }
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn seek(&self, position_ms: u64) -> AppResult<PlayerSnapshot> {
        self.engine.seek(position_ms)?;
        self.emit_tick();
        Ok(self.snapshot())
    }

    pub fn play_index(&self, index: usize) -> AppResult<PlayerSnapshot> {
        self.forget_current();
        let path = {
            let mut logic = self.logic.lock().expect("player lock");
            logic.pending_gapless = false;
            logic
                .queue
                .play_index(index)
                .map(|track| track.path.clone())
                .ok_or_else(|| AppError::msg("that track is not in the queue"))?
        };
        self.load_and_maybe_play(&path, true)?;
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn play_path(&self, path: &str) -> AppResult<PlayerSnapshot> {
        self.forget_current();
        let index = {
            let logic = self.logic.lock().expect("player lock");
            logic
                .queue
                .tracks
                .iter()
                .position(|track| track.path == path)
        };
        if let Some(index) = index {
            return self.play_index(index);
        }
        if Path::new(path).is_dir() {
            let jumped = {
                let mut logic = self.logic.lock().expect("player lock");
                logic
                    .queue
                    .jump_to_folder(path)
                    .map(|track| track.path.clone())
            };
            if let Some(track_path) = jumped {
                self.load_and_maybe_play(&track_path, true)?;
                self.emit_state();
                return Ok(self.snapshot());
            }
        }
        self.open_path(path)
    }

    pub fn play_queue_paths(
        &self,
        paths: Vec<String>,
        start_path: Option<String>,
    ) -> AppResult<PlayerSnapshot> {
        self.forget_current();
        let mut tracks = Vec::new();
        for path in &paths {
            if let Ok(found) = collect_tracks(Path::new(path)) {
                tracks.extend(found);
            }
        }
        if tracks.is_empty() {
            return Err(AppError::msg("This playlist is empty"));
        }
        let start = start_path
            .as_deref()
            .and_then(|wanted| tracks.iter().position(|track| track.path == wanted))
            .unwrap_or(0);
        let first = {
            let mut logic = self.logic.lock().expect("player lock");
            logic.error = None;
            logic.pending_gapless = false;
            logic.queue.replace(tracks, start);
            logic.queue.current().map(|track| track.path.clone())
        };
        if let Some(first) = first {
            self.load_and_maybe_play(&first, true)?;
        }
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn play_tracks(
        &self,
        tracks: Vec<Track>,
        start_path: Option<String>,
    ) -> AppResult<PlayerSnapshot> {
        self.forget_current();
        if tracks.is_empty() {
            return Err(AppError::msg("Nothing to play"));
        }
        let start = start_path
            .as_deref()
            .and_then(|wanted| tracks.iter().position(|track| track.path == wanted))
            .unwrap_or(0);
        let first = {
            let mut logic = self.logic.lock().expect("player lock");
            logic.error = None;
            logic.pending_gapless = false;
            logic.queue.replace(tracks, start);
            logic.queue.current().map(|track| track.path.clone())
        };
        if let Some(first) = first {
            self.load_and_maybe_play(&first, true)?;
        }
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn set_volume(&self, volume: f64) -> AppResult<PlayerSnapshot> {
        {
            let mut logic = self.logic.lock().expect("player lock");
            logic.volume = volume.clamp(0.0, 1.0);
        }
        self.apply_volume();
        self.persist.update(|data| {
            data.volume = volume.clamp(0.0, 1.0);
        });
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn set_muted(&self, muted: bool) -> AppResult<PlayerSnapshot> {
        self.logic.lock().expect("player lock").muted = muted;
        self.apply_volume();
        self.persist.update(|data| data.muted = muted);
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn set_repeat(&self, repeat: RepeatMode) -> AppResult<PlayerSnapshot> {
        self.logic
            .lock()
            .expect("player lock")
            .queue
            .set_repeat(repeat);
        self.persist.update(|data| data.repeat = repeat);
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn set_shuffle(&self, shuffle: bool) -> AppResult<PlayerSnapshot> {
        self.logic
            .lock()
            .expect("player lock")
            .queue
            .set_shuffle(shuffle);
        self.persist.update(|data| data.shuffle = shuffle);
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn set_replaygain(&self, enabled: bool) -> AppResult<PlayerSnapshot> {
        self.logic.lock().expect("player lock").replaygain = enabled;
        self.persist.update(|data| data.replaygain = enabled);
        self.apply_volume();
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn set_gapless(&self, enabled: bool) -> AppResult<PlayerSnapshot> {
        self.logic.lock().expect("player lock").gapless = enabled;
        self.persist.update(|data| data.gapless = enabled);
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn refresh_metadata(&self, paths: &[String]) -> Vec<Track> {
        let mut fresh = Vec::new();
        for path in paths {
            if !Path::new(path).is_file() {
                continue;
            }
            let track = track_from_path(Path::new(path));
            crate::tags::forget_thumb(path);
            fresh.push(track);
        }
        if fresh.is_empty() {
            return fresh;
        }
        {
            let mut logic = self.logic.lock().expect("player lock");
            for track in &mut logic.queue.tracks {
                if let Some(next) = fresh.iter().find(|item| item.path == track.path) {
                    *track = next.clone();
                }
            }
        }
        self.emit_state();
        fresh
    }

    pub fn set_eq(&self, update: EqUpdate) -> AppResult<PlayerSnapshot> {
        let params = eq::EqParams::from_update(&update);
        {
            let mut logic = self.logic.lock().expect("player lock");
            eq::apply_update(&mut logic.eq, &update);
        }
        let _ = self.engine.set_eq(params);
        self.persist
            .update(|data| eq::apply_update(&mut data.eq, &update));
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn save_custom_eq(&self, preset: EqUserPreset) -> AppResult<PlayerSnapshot> {
        let (eq, params) = {
            let mut logic = self.logic.lock().expect("player lock");
            eq::upsert_user_preset(&mut logic.eq, preset)?;
            (logic.eq.clone(), eq::EqParams::from_persist(&logic.eq))
        };
        self.persist.update(|data| data.eq = eq);
        let _ = self.engine.set_eq(params);
        self.emit_state();
        Ok(self.snapshot())
    }

    pub fn delete_custom_eq(&self, id: String) -> AppResult<PlayerSnapshot> {
        let (eq, params) = {
            let mut logic = self.logic.lock().expect("player lock");
            eq::delete_user_preset(&mut logic.eq, &id)?;
            (logic.eq.clone(), eq::EqParams::from_persist(&logic.eq))
        };
        self.persist.update(|data| data.eq = eq);
        let _ = self.engine.set_eq(params);
        self.emit_state();
        Ok(self.snapshot())
    }

    fn open_path_inner(&self, path: &str, play: bool) -> AppResult<()> {
        let path = PathBuf::from(path);
        if !path.exists() {
            return Err(AppError::msg(format!("missing path: {}", path.display())));
        }
        let tracks = collect_tracks(&path)?;
        if tracks.is_empty() {
            return Err(AppError::msg("No songs here"));
        }
        let root = if path.is_file() {
            path.parent().map(Path::to_path_buf).unwrap_or(path.clone())
        } else {
            path.clone()
        };
        let start = if path.is_file() {
            tracks
                .iter()
                .position(|track| Path::new(&track.path) == path)
                .unwrap_or(0)
        } else {
            0
        };
        let first = {
            let mut logic = self.logic.lock().expect("player lock");
            logic.root = Some(root.clone());
            logic.error = None;
            logic.pending_gapless = false;
            logic.queue.replace(tracks, start);
            logic.queue.current().map(|track| track.path.clone())
        };
        self.persist.update(|data| {
            data.last_root = Some(root.to_string_lossy().to_string());
        });
        if let Some(first) = first {
            self.load_and_maybe_play(&first, play)?;
        }
        Ok(())
    }

    fn load_and_maybe_play(&self, path: &str, play: bool) -> AppResult<()> {
        // The queue keeps the library path. The engine gets a file Symphonia can open.
        let playable = convert::for_playback(Path::new(path))?;
        self.engine.set_uri(&playable)?;
        crate::search::drop_temps_except(Some(Path::new(path)));
        self.apply_volume();
        {
            let mut logic = self.logic.lock().expect("player lock");
            logic.pending_gapless = false;
            logic.want_playing = play;
            logic.error = None;
        }
        if play {
            self.engine.play()?;
        } else {
            self.engine.pause()?;
        }
        Ok(())
    }

    fn apply_volume(&self) {
        let logic = self.logic.lock().expect("player lock");
        let mut volume = if logic.muted { 0.0 } else { logic.volume };
        if logic.replaygain {
            if let Some(track) = logic.queue.current() {
                volume *= replaygain_multiplier(track);
            }
        }
        drop(logic);
        let _ = self.engine.set_volume(volume);
    }

    fn current_duration(&self, logic: &Logic) -> u64 {
        let queried = self.engine.duration_ms();
        if queried > 0 {
            queried
        } else {
            logic
                .queue
                .current()
                .map(|track| track.duration_ms)
                .unwrap_or(0)
        }
    }

    fn forget_current(&self) {
        let path = self
            .logic
            .lock()
            .expect("player lock")
            .queue
            .current()
            .map(|track| track.path.clone());
        if let Some(path) = path {
            self.persist.forget_position(&path);
        }
    }

    fn maybe_queue_gapless(&self) {
        let (gapless, pending, next) = {
            let logic = self.logic.lock().expect("player lock");
            (
                logic.gapless,
                logic.pending_gapless,
                logic.queue.peek_next_index().and_then(|index| {
                    logic
                        .queue
                        .tracks
                        .get(index)
                        .map(|track| track.path.clone())
                }),
            )
        };
        if !gapless || pending {
            return;
        }
        if let Some(path) = next {
            let Ok(playable) = convert::for_playback(Path::new(&path)) else {
                return;
            };
            if self.engine.set_gapless_next(Some(&playable)).is_ok() {
                self.logic.lock().expect("player lock").pending_gapless = true;
            }
        }
    }

    fn on_gapless_started(&self) {
        let changed = {
            let mut logic = self.logic.lock().expect("player lock");
            if !logic.pending_gapless {
                return;
            }
            logic.pending_gapless = false;
            logic.queue.advance();
            true
        };
        if changed {
            self.apply_volume();
            self.emit_state();
        }
    }

    fn on_eos(&self) {
        self.forget_current();
        let next = {
            let mut logic = self.logic.lock().expect("player lock");
            if logic.pending_gapless {
                logic.pending_gapless = false;
                logic.queue.advance().map(|track| track.path.clone())
            } else {
                logic.queue.advance().map(|track| track.path.clone())
            }
        };
        if let Some(path) = next {
            if let Err(error) = self.load_and_maybe_play(&path, true) {
                self.logic.lock().expect("player lock").error = Some(error.to_string());
            }
        } else {
            let _ = self.engine.pause();
            let _ = self.engine.seek(0);
            self.logic.lock().expect("player lock").want_playing = false;
        }
        self.emit_state();
    }

    fn tick(&self) {
        let (want_playing, duration, pending) = {
            let logic = self.logic.lock().expect("player lock");
            (
                logic.want_playing,
                self.current_duration(&logic),
                logic.pending_gapless,
            )
        };
        let position = self.engine.position_ms();
        let queued = self.engine.queued_sources();

        if want_playing && self.engine.is_empty() {
            self.on_eos();
            return;
        }

        if pending && queued <= 1 && position < 800 {
            self.on_gapless_started();
        } else if want_playing && duration > 0 && position + 1600 >= duration {
            self.maybe_queue_gapless();
        }

        self.emit_tick();
    }

    fn emit_state(&self) {
        let _ = self.app.emit(STATE_EVENT, self.snapshot());
    }

    fn emit_tick(&self) {
        let logic = self.logic.lock().expect("player lock");
        let _ = self.app.emit(
            TICK_EVENT,
            Tick {
                position_ms: self.engine.position_ms(),
                duration_ms: self.current_duration(&logic),
            },
        );
    }
}
