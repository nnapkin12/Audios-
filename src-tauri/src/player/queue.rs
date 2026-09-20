use serde::{Deserialize, Serialize};

use super::scan::Track;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepeatMode {
    #[default]
    Off,
    One,
    All,
}

#[derive(Debug, Clone)]
pub struct Queue {
    pub tracks: Vec<Track>,
    pub index: usize,
    pub repeat: RepeatMode,
    pub shuffle: bool,
    order: Vec<usize>,
    order_pos: usize,
}

impl Default for Queue {
    fn default() -> Self {
        Self {
            tracks: Vec::new(),
            index: 0,
            repeat: RepeatMode::Off,
            shuffle: false,
            order: Vec::new(),
            order_pos: 0,
        }
    }
}

impl Queue {
    pub fn with_modes(repeat: RepeatMode, shuffle: bool) -> Self {
        Self {
            repeat,
            shuffle,
            ..Self::default()
        }
    }

    pub fn replace(&mut self, tracks: Vec<Track>, start: usize) {
        self.tracks = tracks;
        self.index = start.min(self.tracks.len().saturating_sub(1));
        if self.tracks.is_empty() {
            self.index = 0;
        }
        self.rebuild_order();
    }

    pub fn current(&self) -> Option<&Track> {
        self.tracks.get(self.index)
    }

    pub fn play_index(&mut self, index: usize) -> Option<&Track> {
        if index >= self.tracks.len() {
            return None;
        }
        self.index = index;
        self.rebuild_order();
        self.current()
    }

    pub fn set_repeat(&mut self, repeat: RepeatMode) {
        self.repeat = repeat;
    }

    pub fn set_shuffle(&mut self, shuffle: bool) {
        self.shuffle = shuffle;
        self.rebuild_order();
    }

    pub fn peek_next_index(&self) -> Option<usize> {
        if self.tracks.is_empty() {
            return None;
        }
        if self.repeat == RepeatMode::One {
            return Some(self.index);
        }
        if self.order_pos + 1 < self.order.len() {
            return Some(self.order[self.order_pos + 1]);
        }
        if self.repeat == RepeatMode::All {
            return self.order.first().copied();
        }
        None
    }

    pub fn advance(&mut self) -> Option<&Track> {
        let next = self.peek_next_index()?;
        if self.repeat == RepeatMode::One {
            return self.current();
        }
        let wrapping = self.order_pos + 1 >= self.order.len();
        self.index = next;
        if wrapping && self.repeat == RepeatMode::All {
            self.rebuild_order();
        } else if self.order_pos + 1 < self.order.len() {
            self.order_pos += 1;
        }
        self.current()
    }

    pub fn retreat(&mut self) -> Option<&Track> {
        if self.tracks.is_empty() {
            return None;
        }
        if self.order_pos > 0 {
            self.order_pos -= 1;
            self.index = self.order[self.order_pos];
        } else if self.repeat == RepeatMode::All {
            self.order_pos = self.order.len().saturating_sub(1);
            self.index = self.order[self.order_pos];
        }
        self.current()
    }

    pub fn jump_to_folder(&mut self, folder: &str) -> Option<&Track> {
        let index = self
            .tracks
            .iter()
            .position(|track| track.folder == folder || track.path.starts_with(folder))?;
        self.play_index(index)
    }

    fn rebuild_order(&mut self) {
        let n = self.tracks.len();
        if n == 0 {
            self.order.clear();
            self.order_pos = 0;
            return;
        }
        self.index = self.index.min(n - 1);
        if self.shuffle && n > 1 {
            let mut rest: Vec<usize> = (0..n).filter(|i| *i != self.index).collect();
            fastrand::shuffle(&mut rest);
            self.order = Vec::with_capacity(n);
            self.order.push(self.index);
            self.order.extend(rest);
            self.order_pos = 0;
        } else {
            self.order = (0..n).collect();
            self.order_pos = self.index;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tracks(n: usize) -> Vec<Track> {
        (0..n)
            .map(|i| Track {
                path: format!("/t{i}.mp3"),
                title: format!("T{i}"),
                artist: "A".into(),
                album: "B".into(),
                album_artist: "A".into(),
                track: Some(i as u32 + 1),
                disc: Some(1),
                duration_ms: 1000,
                folder: "/".into(),
                replaygain_track: None,
                replaygain_album: None,
            })
            .collect()
    }

    #[test]
    fn next_stops_at_end_without_repeat() {
        let mut queue = Queue::default();
        queue.replace(tracks(2), 0);
        assert_eq!(queue.peek_next_index(), Some(1));
        queue.advance();
        assert_eq!(queue.index, 1);
        assert_eq!(queue.peek_next_index(), None);
    }

    #[test]
    fn repeat_one_stays_on_track() {
        let mut queue = Queue::default();
        queue.replace(tracks(3), 1);
        queue.set_repeat(RepeatMode::One);
        assert_eq!(queue.peek_next_index(), Some(1));
        queue.advance();
        assert_eq!(queue.index, 1);
    }

    #[test]
    fn repeat_all_wraps() {
        let mut queue = Queue::default();
        queue.replace(tracks(3), 2);
        queue.set_repeat(RepeatMode::All);
        assert_eq!(queue.peek_next_index(), Some(0));
        queue.advance();
        assert_eq!(queue.index, 0);
    }

    #[test]
    fn previous_walks_back() {
        let mut queue = Queue::default();
        queue.replace(tracks(3), 2);
        queue.retreat();
        assert_eq!(queue.index, 1);
        queue.retreat();
        assert_eq!(queue.index, 0);
        queue.retreat();
        assert_eq!(queue.index, 0);
    }
}
