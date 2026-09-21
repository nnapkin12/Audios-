export const EQ_BAND_COUNT = 10;
export const EQ_GAIN_MIN = -12;
export const EQ_GAIN_MAX = 12;
export const MAX_USER_EQ_PRESETS = 20;
export const WORKING_EQ_ID = "custom";
export const FLAT_EQ_ID = "flat";

export const EQ_BANDS = [
  { hz: 32, label: "32 Hz", hint: "Sub" },
  { hz: 64, label: "64 Hz", hint: "Bass" },
  { hz: 125, label: "125 Hz", hint: "Low" },
  { hz: 250, label: "250 Hz", hint: "Warmth" },
  { hz: 500, label: "500 Hz", hint: "Body" },
  { hz: 1000, label: "1 kHz", hint: "Vocals" },
  { hz: 2000, label: "2 kHz", hint: "Presence" },
  { hz: 4000, label: "4 kHz", hint: "Clarity" },
  { hz: 8000, label: "8 kHz", hint: "Sparkle" },
  { hz: 16000, label: "16 kHz", hint: "Air" },
] as const;

export interface EqUserPreset {
  id: string;
  name: string;
  gains: number[];
  preamp: number;
  autoPreamp: boolean;
}

export interface EqBuiltin {
  id: string;
  name: string;
  description: string;
  gains: number[];
  preamp: number;
}

export interface EqState {
  enabled: boolean;
  presetId: string;
  gains: number[];
  preamp: number;
  autoPreamp: boolean;
  customPresets: EqUserPreset[];
  builtins: EqBuiltin[];
}

export interface EqUpdate {
  enabled: boolean;
  presetId: string;
  gains: number[];
  preamp: number;
  autoPreamp: boolean;
}

export const EMPTY_EQ: EqState = {
  enabled: false,
  presetId: FLAT_EQ_ID,
  gains: Array(EQ_BAND_COUNT).fill(0),
  preamp: 0,
  autoPreamp: true,
  customPresets: [],
  builtins: [],
};

export function clampEqGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(EQ_GAIN_MAX, Math.max(EQ_GAIN_MIN, value));
}

export function normalizeEqGains(input: number[] | undefined): number[] {
  const out = Array(EQ_BAND_COUNT).fill(0);
  (input ?? []).slice(0, EQ_BAND_COUNT).forEach((gain, index) => {
    out[index] = clampEqGain(gain);
  });
  return out;
}

export function bandsFromSimple(bass: number, mids: number, treble: number): number[] {
  const b = clampEqGain(bass);
  const m = clampEqGain(mids);
  const t = clampEqGain(treble);
  const weights: Array<[number, number, number]> = [
    [1.0, 0.0, 0.0],
    [0.9, 0.0, 0.0],
    [0.55, 0.2, 0.0],
    [0.15, 0.65, 0.0],
    [0.0, 1.0, 0.0],
    [0.0, 1.0, 0.0],
    [0.0, 0.45, 0.35],
    [0.0, 0.1, 0.75],
    [0.0, 0.0, 0.95],
    [0.0, 0.0, 1.0],
  ];
  return weights.map(([wb, wm, wt]) => clampEqGain(wb * b + wm * m + wt * t));
}

export function simpleFromBands(gains: number[]): { bass: number; mids: number; treble: number } {
  const g = normalizeEqGains(gains);
  return {
    bass: (g[0] + g[1]) / 2,
    mids: (g[4] + g[5]) / 2,
    treble: (g[8] + g[9]) / 2,
  };
}

export function effectivePreamp(gains: number[], preamp: number, autoPreamp: boolean): number {
  const user = clampEqGain(preamp);
  if (!autoPreamp) return user;
  const boost = normalizeEqGains(gains).reduce((max, gain) => Math.max(max, gain), 0);
  if (boost > 0) return Math.min(user, -boost);
  return user;
}

export function eqPresetName(eq: EqState): string {
  if (eq.presetId === WORKING_EQ_ID) return "Custom";
  const builtin = eq.builtins.find((item) => item.id === eq.presetId);
  if (builtin) return builtin.name;
  const custom = eq.customPresets.find((item) => item.id === eq.presetId);
  if (custom) return custom.name;
  return eq.enabled ? "Custom" : "Flat";
}

export function eqStatus(eq: EqState): string {
  if (!eq.enabled) return "Off";
  return eqPresetName(eq);
}

export function toEqUpdate(eq: EqState): EqUpdate {
  return {
    enabled: eq.enabled,
    presetId: eq.presetId,
    gains: normalizeEqGains(eq.gains),
    preamp: clampEqGain(eq.preamp),
    autoPreamp: eq.autoPreamp,
  };
}

export function newCustomEq(eq: EqState, name = "Custom EQ"): EqUserPreset {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `custom-${crypto.randomUUID()}`
      : `custom-${Date.now()}`;
  return {
    id,
    name,
    gains: normalizeEqGains(eq.gains),
    preamp: clampEqGain(eq.preamp),
    autoPreamp: eq.autoPreamp,
  };
}

export function dirtyEqPreset(eq: EqState): EqState {
  if (eq.presetId === WORKING_EQ_ID) return eq;
  return { ...eq, presetId: WORKING_EQ_ID };
}
