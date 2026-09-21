use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rodio::{Sample, Source};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub const BAND_COUNT: usize = 10;
pub const BAND_FREQS: [f32; BAND_COUNT] = [
    32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];
/// Q for 1-octave graphic bands: √2 ≈ 1.414.
pub const BAND_Q: f32 = std::f32::consts::SQRT_2;
pub const GAIN_MIN: f32 = -12.0;
pub const GAIN_MAX: f32 = 12.0;
pub const MAX_USER_PRESETS: usize = 20;
pub const WORKING_PRESET_ID: &str = "custom";
pub const FLAT_PRESET_ID: &str = "flat";

const GAIN_EPS: f32 = 0.01;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqUserPreset {
    pub id: String,
    pub name: String,
    #[serde(default, deserialize_with = "gains_from_vec")]
    pub gains: [f32; BAND_COUNT],
    #[serde(default)]
    pub preamp: f32,
    #[serde(default = "default_true")]
    pub auto_preamp: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqPersist {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_preset_id")]
    pub preset_id: String,
    #[serde(default = "zero_gains", deserialize_with = "gains_from_vec")]
    pub gains: [f32; BAND_COUNT],
    #[serde(default)]
    pub preamp: f32,
    #[serde(default = "default_true")]
    pub auto_preamp: bool,
    #[serde(default)]
    pub custom_presets: Vec<EqUserPreset>,
}

impl Default for EqPersist {
    fn default() -> Self {
        Self {
            enabled: false,
            preset_id: default_preset_id(),
            gains: zero_gains(),
            preamp: 0.0,
            auto_preamp: true,
            custom_presets: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqUpdate {
    pub enabled: bool,
    pub preset_id: String,
    #[serde(default)]
    pub gains: Vec<f32>,
    pub preamp: f32,
    pub auto_preamp: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqBuiltin {
    pub id: String,
    pub name: String,
    pub description: String,
    pub gains: [f32; BAND_COUNT],
    pub preamp: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqState {
    pub enabled: bool,
    pub preset_id: String,
    pub gains: [f32; BAND_COUNT],
    pub preamp: f32,
    pub auto_preamp: bool,
    pub custom_presets: Vec<EqUserPreset>,
    pub builtins: Vec<EqBuiltin>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EqParams {
    pub enabled: bool,
    pub gains: [f32; BAND_COUNT],
    pub preamp: f32,
    pub auto_preamp: bool,
}

impl EqParams {
    pub fn bypass() -> Self {
        Self {
            enabled: false,
            gains: zero_gains(),
            preamp: 0.0,
            auto_preamp: true,
        }
    }

    pub fn from_persist(eq: &EqPersist) -> Self {
        Self {
            enabled: eq.enabled,
            gains: normalize_gains(&eq.gains),
            preamp: clamp_gain(eq.preamp),
            auto_preamp: eq.auto_preamp,
        }
    }

    pub fn from_update(update: &EqUpdate) -> Self {
        Self {
            enabled: update.enabled,
            gains: normalize_gains(&update.gains),
            preamp: clamp_gain(update.preamp),
            auto_preamp: update.auto_preamp,
        }
    }
}

pub fn state_from(eq: &EqPersist) -> EqState {
    EqState {
        enabled: eq.enabled,
        preset_id: eq.preset_id.clone(),
        gains: normalize_gains(&eq.gains),
        preamp: clamp_gain(eq.preamp),
        auto_preamp: eq.auto_preamp,
        custom_presets: eq.custom_presets.clone(),
        builtins: Vec::new(),
    }
}

pub fn state_with_catalog(eq: &EqPersist) -> EqState {
    let mut state = state_from(eq);
    state.builtins = builtin_catalog();
    state
}

pub fn apply_update(eq: &mut EqPersist, update: &EqUpdate) {
    eq.enabled = update.enabled;
    eq.preset_id = if update.preset_id.trim().is_empty() {
        WORKING_PRESET_ID.to_string()
    } else {
        update.preset_id.clone()
    };
    eq.gains = normalize_gains(&update.gains);
    eq.preamp = clamp_gain(update.preamp);
    eq.auto_preamp = update.auto_preamp;
}

pub fn upsert_user_preset(eq: &mut EqPersist, mut preset: EqUserPreset) -> AppResult<()> {
    preset.name = preset.name.trim().to_string();
    if preset.name.is_empty() {
        preset.name = "Custom EQ".into();
    }
    preset.gains = normalize_gains(&preset.gains);
    preset.preamp = clamp_gain(preset.preamp);
    if preset.id.trim().is_empty() || is_builtin_id(&preset.id) || preset.id == WORKING_PRESET_ID {
        return Err(AppError::msg("Built-in presets can't be changed"));
    }
    if let Some(existing) = eq
        .custom_presets
        .iter_mut()
        .find(|item| item.id == preset.id)
    {
        *existing = preset.clone();
    } else {
        if eq.custom_presets.len() >= MAX_USER_PRESETS {
            return Err(AppError::msg("You can save up to 20 presets"));
        }
        eq.custom_presets.push(preset.clone());
    }
    eq.preset_id = preset.id;
    eq.gains = preset.gains;
    eq.preamp = preset.preamp;
    eq.auto_preamp = preset.auto_preamp;
    eq.enabled = true;
    Ok(())
}

pub fn delete_user_preset(eq: &mut EqPersist, id: &str) -> AppResult<()> {
    if is_builtin_id(id) || id == WORKING_PRESET_ID {
        return Err(AppError::msg("Built-in presets can't be removed"));
    }
    let before = eq.custom_presets.len();
    eq.custom_presets.retain(|item| item.id != id);
    if eq.custom_presets.len() == before {
        return Err(AppError::msg("Preset not found"));
    }
    if eq.preset_id == id {
        eq.preset_id = FLAT_PRESET_ID.into();
        eq.gains = zero_gains();
        eq.preamp = 0.0;
    }
    Ok(())
}

pub fn builtin_catalog() -> Vec<EqBuiltin> {
    builtins()
        .iter()
        .map(|item| EqBuiltin {
            id: item.id.to_string(),
            name: item.name.to_string(),
            description: item.description.to_string(),
            gains: item.gains,
            preamp: item.preamp,
        })
        .collect()
}

pub fn is_builtin_id(id: &str) -> bool {
    builtins().iter().any(|item| item.id == id)
}

pub fn db_to_linear(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

pub fn clamp_gain(value: f32) -> f32 {
    value.clamp(GAIN_MIN, GAIN_MAX)
}

pub fn normalize_gains(input: &[f32]) -> [f32; BAND_COUNT] {
    let mut out = zero_gains();
    for (index, gain) in input.iter().take(BAND_COUNT).enumerate() {
        out[index] = clamp_gain(*gain);
    }
    out
}

pub fn effective_preamp(params: &EqParams) -> f32 {
    let user = clamp_gain(params.preamp);
    if params.auto_preamp {
        let boost = params.gains.iter().copied().fold(0.0f32, f32::max);
        if boost > 0.0 {
            return user.min(-boost);
        }
    }
    user
}

pub fn is_bypass(params: &EqParams) -> bool {
    if !params.enabled {
        return true;
    }
    params.gains.iter().all(|gain| gain.abs() < GAIN_EPS)
        && effective_preamp(params).abs() < GAIN_EPS
}

pub fn peaking_coeffs(sample_rate: f32, freq: f32, q: f32, gain_db: f32) -> Option<BiquadCoeffs> {
    if !(sample_rate.is_finite() && freq.is_finite() && q.is_finite() && gain_db.is_finite()) {
        return None;
    }
    if sample_rate < 1.0 || freq <= 0.0 || q <= 0.0 {
        return None;
    }
    if freq >= sample_rate * 0.49 {
        return None;
    }
    let a = 10f32.powf(gain_db / 40.0);
    let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let cos_w = w0.cos();
    let sin_w = w0.sin();
    let alpha = sin_w / (2.0 * q);
    let b0 = 1.0 + alpha * a;
    let b1 = -2.0 * cos_w;
    let b2 = 1.0 - alpha * a;
    let a0 = 1.0 + alpha / a;
    let a1 = -2.0 * cos_w;
    let a2 = 1.0 - alpha / a;
    if a0.abs() < f32::EPSILON {
        return None;
    }
    let inv = 1.0 / a0;
    Some(BiquadCoeffs {
        b0: b0 * inv,
        b1: b1 * inv,
        b2: b2 * inv,
        a1: a1 * inv,
        a2: a2 * inv,
    })
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

struct BuiltinDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    gains: [f32; BAND_COUNT],
    preamp: f32,
}

fn builtins() -> &'static [BuiltinDef] {
    &[
        BuiltinDef {
            id: "flat",
            name: "Flat",
            description: "No equalization",
            gains: [0.0; BAND_COUNT],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "bass-boost",
            name: "Bass Boost",
            description: "Extra low end",
            gains: [6.5, 5.5, 3.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "bass-cut",
            name: "Bass Cut",
            description: "Less low end",
            gains: [-5.5, -4.5, -2.5, -0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "warm",
            name: "Warm",
            description: "Softer highs",
            gains: [1.5, 2.5, 2.0, 1.0, 0.5, 0.0, -0.5, -1.5, -2.5, -2.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "bright",
            name: "Bright",
            description: "More treble",
            gains: [-0.5, -1.0, -0.5, 0.0, 0.0, 0.5, 1.5, 3.0, 4.5, 5.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "smooth",
            name: "Smooth",
            description: "Softer treble",
            gains: [0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -2.0, -4.0, -5.0, -5.5],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "vocal",
            name: "Vocal",
            description: "Vocals forward",
            gains: [-1.0, -0.5, 0.0, -3.0, -3.5, 0.5, 3.5, 4.0, 1.0, 0.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "spoken-word",
            name: "Spoken Word",
            description: "Podcasts and audiobooks",
            gains: [-6.0, -5.0, -3.0, -1.0, 2.0, 4.0, 3.0, 0.5, -2.5, -4.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "loudness",
            name: "Loudness",
            description: "Fuller at low volume",
            gains: [5.5, 4.0, 1.5, 0.0, -1.5, -1.5, 0.0, 2.0, 4.0, 4.5],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "night",
            name: "Night",
            description: "Quieter bass",
            gains: [-4.0, -3.0, -1.0, 0.5, 1.0, 1.5, 2.5, 3.0, 1.0, 0.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "small-speakers",
            name: "Small Speakers",
            description: "Laptops and TVs",
            gains: [-3.5, 0.5, 3.5, 4.0, 1.5, 0.0, -2.5, -3.5, 0.5, 1.5],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "headphones",
            name: "Headphones",
            description: "Over-ear headphones",
            gains: [0.5, 2.5, 2.0, 0.5, 0.0, -0.5, -2.5, -3.0, -0.5, 2.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "electronic",
            name: "Electronic",
            description: "Dance and electronic",
            gains: [5.0, 4.0, 0.5, -3.0, -3.5, 0.0, 1.0, 2.0, 4.0, 5.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "hip-hop",
            name: "Hip-Hop",
            description: "Hip-hop and R&B",
            gains: [6.0, 3.5, -0.5, -2.5, -1.0, 1.0, 3.0, 3.5, 1.0, 0.5],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "rock",
            name: "Rock",
            description: "Rock and guitar",
            gains: [2.0, 3.0, 0.5, -1.5, 0.0, 2.5, 4.0, 2.5, 2.0, 2.5],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "acoustic",
            name: "Acoustic",
            description: "Acoustic and folk",
            gains: [-2.0, 0.5, 3.0, 2.5, 0.0, 0.5, 2.0, 3.5, 1.5, 1.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "jazz",
            name: "Jazz",
            description: "Jazz",
            gains: [0.0, 2.5, 1.5, -2.0, 0.0, 1.5, 0.5, -2.0, -1.5, 1.5],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "classical",
            name: "Classical",
            description: "Orchestral",
            gains: [-2.5, -1.5, 0.5, 0.5, 1.0, 1.0, 0.5, 1.0, 2.5, 3.5],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "piano",
            name: "Piano",
            description: "Solo piano",
            gains: [-2.5, -1.0, 0.0, 0.5, 1.0, 1.5, 3.0, 2.5, 0.5, 0.0],
            preamp: 0.0,
        },
        BuiltinDef {
            id: "live",
            name: "Live",
            description: "Live recordings",
            gains: [0.0, 0.5, 1.5, 3.0, 2.5, 0.5, 0.0, 1.5, 3.5, 4.0],
            preamp: 0.0,
        },
    ]
}

fn default_preset_id() -> String {
    FLAT_PRESET_ID.into()
}

fn default_true() -> bool {
    true
}

fn zero_gains() -> [f32; BAND_COUNT] {
    [0.0; BAND_COUNT]
}

fn gains_from_vec<'de, D>(deserializer: D) -> Result<[f32; BAND_COUNT], D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = Vec::<f32>::deserialize(deserializer)?;
    Ok(normalize_gains(&raw))
}

pub struct EqShared {
    params: Mutex<EqParams>,
    generation: AtomicU64,
}

impl Default for EqShared {
    fn default() -> Self {
        Self {
            params: Mutex::new(EqParams::bypass()),
            generation: AtomicU64::new(1),
        }
    }
}

impl EqShared {
    pub fn set(&self, params: EqParams) {
        *self
            .params
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = params;
        self.generation.fetch_add(1, Ordering::Release);
    }

    pub fn params(&self) -> EqParams {
        self.params
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    fn generation(&self) -> u64 {
        self.generation.load(Ordering::Acquire)
    }
}

impl Default for BiquadCoeffs {
    fn default() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }
}

#[derive(Clone, Copy, Default)]
struct Biquad {
    coeffs: BiquadCoeffs,
    z1: f32,
    z2: f32,
}

impl Biquad {
    fn from_coeffs(coeffs: BiquadCoeffs) -> Self {
        Self {
            coeffs,
            z1: 0.0,
            z2: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, x: f32) -> f32 {
        let y = self.coeffs.b0 * x + self.z1;
        self.z1 = self.coeffs.b1 * x - self.coeffs.a1 * y + self.z2;
        self.z2 = self.coeffs.b2 * x - self.coeffs.a2 * y;
        y
    }

    fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }
}

struct ChannelEq {
    bands: Vec<Biquad>,
}

pub struct EqFilter {
    sample_rate: u32,
    channels: u16,
    channel_idx: u16,
    channels_eq: Vec<ChannelEq>,
    preamp_lin: f32,
    bypass: bool,
}

impl EqFilter {
    pub fn new(sample_rate: u32, channels: u16) -> Self {
        let mut filter = Self {
            sample_rate,
            channels: channels.max(1),
            channel_idx: 0,
            channels_eq: Vec::new(),
            preamp_lin: 1.0,
            bypass: true,
        };
        filter.configure(&EqParams::bypass());
        filter
    }

    pub fn configure(&mut self, params: &EqParams) {
        self.bypass = is_bypass(params);
        self.preamp_lin = db_to_linear(effective_preamp(params));
        self.channels_eq.clear();
        if self.bypass {
            return;
        }
        let sr = self.sample_rate.max(1) as f32;
        let mut template = Vec::new();
        for (index, freq) in BAND_FREQS.iter().enumerate() {
            let gain = params.gains[index];
            if gain.abs() < GAIN_EPS {
                continue;
            }
            if let Some(coeffs) = peaking_coeffs(sr, *freq, BAND_Q, gain) {
                template.push(Biquad::from_coeffs(coeffs));
            }
        }
        if template.is_empty() && (self.preamp_lin - 1.0).abs() < 1e-6 {
            self.bypass = true;
            return;
        }
        let count = self.channels.max(1) as usize;
        self.channels_eq = (0..count)
            .map(|_| ChannelEq {
                bands: template.clone(),
            })
            .collect();
    }

    pub fn reset(&mut self) {
        self.channel_idx = 0;
        for channel in &mut self.channels_eq {
            for band in &mut channel.bands {
                band.reset();
            }
        }
    }

    #[cfg(test)]
    pub fn process_buffer(&mut self, samples: &[f32]) -> Vec<f32> {
        samples
            .iter()
            .copied()
            .map(|sample| self.process(sample))
            .collect()
    }

    #[inline]
    fn process(&mut self, x: f32) -> f32 {
        let count = self.channels.max(1);
        let ch = self.channel_idx as usize;
        self.channel_idx = (self.channel_idx + 1) % count;
        if self.bypass {
            return x;
        }
        let mut y = x;
        if let Some(channel) = self.channels_eq.get_mut(ch) {
            for band in &mut channel.bands {
                y = band.process(y);
            }
        }
        y * self.preamp_lin
    }
}

pub struct EqSource<I> {
    inner: I,
    shared: Arc<EqShared>,
    generation: u64,
    filter: EqFilter,
}

impl<I> EqSource<I>
where
    I: Source,
    I::Item: Sample,
{
    pub fn new(inner: I, shared: Arc<EqShared>) -> Self {
        let mut filter = EqFilter::new(inner.sample_rate(), inner.channels());
        let params = shared.params();
        filter.configure(&params);
        Self {
            inner,
            generation: shared.generation(),
            shared,
            filter,
        }
    }

    fn sync(&mut self) {
        let gen = self.shared.generation();
        if gen != self.generation {
            self.filter.configure(&self.shared.params());
            self.generation = gen;
        }
    }
}

impl<I> Iterator for EqSource<I>
where
    I: Source,
    I::Item: Sample,
{
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<f32> {
        self.sync();
        Some(self.filter.process(self.inner.next()?.to_f32()))
    }

    #[inline]
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }
}

impl<I> Source for EqSource<I>
where
    I: Source,
    I::Item: Sample,
{
    #[inline]
    fn current_frame_len(&self) -> Option<usize> {
        self.inner.current_frame_len()
    }

    #[inline]
    fn channels(&self) -> u16 {
        self.inner.channels()
    }

    #[inline]
    fn sample_rate(&self) -> u32 {
        self.inner.sample_rate()
    }

    #[inline]
    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), rodio::source::SeekError> {
        self.inner.try_seek(pos)?;
        self.filter.reset();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_preset() -> EqUserPreset {
        EqUserPreset {
            id: "custom-1".into(),
            name: "Desk".into(),
            gains: [2.0, 1.5, 0.0, -1.0, 0.0, 0.5, 1.0, 0.0, -0.5, 0.0],
            preamp: -1.5,
            auto_preamp: true,
        }
    }

    #[test]
    fn flat_and_disabled_are_bypass() {
        let mut disabled = EqParams::bypass();
        disabled.enabled = false;
        disabled.gains[0] = 6.0;
        assert!(is_bypass(&disabled));

        let flat = EqParams {
            enabled: true,
            gains: zero_gains(),
            preamp: 0.0,
            auto_preamp: true,
        };
        assert!(is_bypass(&flat));
    }

    #[test]
    fn bypass_is_identity() {
        let samples = [0.15f32, -0.4, 0.8, -0.05, 0.22, -0.31];
        let mut filter = EqFilter::new(44_100, 2);
        filter.configure(&EqParams::bypass());
        assert_eq!(filter.process_buffer(&samples), samples.to_vec());

        let mut flat = EqFilter::new(44_100, 2);
        flat.configure(&EqParams {
            enabled: true,
            gains: zero_gains(),
            preamp: 0.0,
            auto_preamp: true,
        });
        assert_eq!(flat.process_buffer(&samples), samples.to_vec());
    }

    #[test]
    fn enabled_curve_changes_samples() {
        let samples = [0.2f32, -0.2, 0.4, -0.4];
        let mut filter = EqFilter::new(44_100, 1);
        filter.configure(&EqParams {
            enabled: true,
            gains: [6.0, 5.0, 3.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            preamp: 0.0,
            auto_preamp: false,
        });
        let out = filter.process_buffer(&samples);
        assert_ne!(out, samples);
    }

    #[test]
    fn presets_have_ten_bands_and_unique_jobs() {
        let catalog = builtin_catalog();
        assert_eq!(catalog.len(), 20);
        let mut ids = std::collections::HashSet::new();
        for preset in &catalog {
            assert_eq!(preset.gains.len(), BAND_COUNT);
            assert!(ids.insert(preset.id.clone()));
            for gain in preset.gains {
                assert!(gain >= GAIN_MIN && gain <= GAIN_MAX);
            }
        }
        let flat = catalog.iter().find(|item| item.id == "flat").unwrap();
        assert!(flat.gains.iter().all(|gain| *gain == 0.0));
        let bass = catalog.iter().find(|item| item.id == "bass-boost").unwrap();
        let small = catalog
            .iter()
            .find(|item| item.id == "small-speakers")
            .unwrap();
        assert!(bass.gains[0] > small.gains[0]);
        let vocal = catalog.iter().find(|item| item.id == "vocal").unwrap();
        let spoken = catalog
            .iter()
            .find(|item| item.id == "spoken-word")
            .unwrap();
        assert!(spoken.gains[0] < vocal.gains[0]);
        assert!(vocal.gains[3] < 0.0 && vocal.gains[7] > 0.0);
    }

    #[test]
    fn user_preset_serde_round_trip() {
        let preset = sample_preset();
        let raw = serde_json::to_string(&preset).unwrap();
        assert!(raw.contains("autoPreamp"));
        let back: EqUserPreset = serde_json::from_str(&raw).unwrap();
        assert_eq!(preset, back);
        let short: EqUserPreset = serde_json::from_str(
            r#"{"id":"custom-2","name":"Pad","gains":[1,2,3],"preamp":0,"autoPreamp":false}"#,
        )
        .unwrap();
        assert_eq!(short.gains[0], 1.0);
        assert_eq!(short.gains[9], 0.0);
    }

    #[test]
    fn q_and_gain_helpers() {
        assert!((BAND_Q - std::f32::consts::SQRT_2).abs() < 1e-6);
        assert!((db_to_linear(0.0) - 1.0).abs() < 1e-6);
        assert!((db_to_linear(6.0) - 2.0).abs() < 0.02);
        assert!((db_to_linear(-6.0) - 0.5).abs() < 0.02);
        let coeffs = peaking_coeffs(44_100.0, 1000.0, BAND_Q, 0.0).unwrap();
        assert!((coeffs.b0 - 1.0).abs() < 1e-5);
        assert!(peaking_coeffs(22_050.0, 16_000.0, BAND_Q, 3.0).is_none());
    }

    #[test]
    fn auto_preamp_follows_worst_boost() {
        let params = EqParams {
            enabled: true,
            gains: [6.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            preamp: 0.0,
            auto_preamp: true,
        };
        assert_eq!(effective_preamp(&params), -6.0);
        let lower = EqParams {
            preamp: -9.0,
            ..params.clone()
        };
        assert_eq!(effective_preamp(&lower), -9.0);
        let off = EqParams {
            auto_preamp: false,
            ..params
        };
        assert_eq!(effective_preamp(&off), 0.0);
    }

    #[test]
    fn upsert_caps_and_protects_builtins() {
        let mut eq = EqPersist::default();
        assert!(upsert_user_preset(&mut eq, sample_preset()).is_ok());
        assert_eq!(eq.custom_presets.len(), 1);
        assert_eq!(eq.preset_id, "custom-1");
        let mut builtin = sample_preset();
        builtin.id = "vocal".into();
        assert!(upsert_user_preset(&mut eq, builtin).is_err());
        for index in 0..MAX_USER_PRESETS {
            let mut extra = sample_preset();
            extra.id = format!("custom-x-{index}");
            let _ = upsert_user_preset(&mut eq, extra);
        }
        assert_eq!(eq.custom_presets.len(), MAX_USER_PRESETS);
        let mut overflow = sample_preset();
        overflow.id = "custom-overflow".into();
        assert!(upsert_user_preset(&mut eq, overflow).is_err());
        assert!(delete_user_preset(&mut eq, "flat").is_err());
        assert!(delete_user_preset(&mut eq, "custom-1").is_ok());
        assert!(eq.custom_presets.iter().all(|item| item.id != "custom-1"));
        let selected = eq.preset_id.clone();
        assert!(delete_user_preset(&mut eq, &selected).is_ok());
        assert_eq!(eq.preset_id, FLAT_PRESET_ID);
    }

    #[test]
    fn seek_resets_filter_memory() {
        let mut filter = EqFilter::new(44_100, 1);
        filter.configure(&EqParams {
            enabled: true,
            gains: [4.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            preamp: 0.0,
            auto_preamp: false,
        });
        let _ = filter.process(0.9);
        let _ = filter.process(-0.4);
        filter.reset();
        let first = EqFilter::new(44_100, 1);
        let mut fresh = first;
        fresh.configure(&EqParams {
            enabled: true,
            gains: [4.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            preamp: 0.0,
            auto_preamp: false,
        });
        let a = filter.process(0.3);
        let b = fresh.process(0.3);
        assert!((a - b).abs() < 1e-6);
    }
}
