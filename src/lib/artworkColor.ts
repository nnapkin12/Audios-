export type ArtColors = {
  app: string;
  raised: string;
  hover: string;
  accent: string;
  accentDim: string;
  play: string;
  playFg: string;
  text: string;
  muted: string;
  subtle: string;
  border: string;
  line: string;
};

type Rgb = [number, number, number];

export function paletteFromPixels(data: Uint8ClampedArray): ArtColors | null {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  const step = Math.max(4, Math.floor(data.length / (48 * 48 * 4)) * 4);
  for (let index = 0; index + 3 < data.length; index += step) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];
    if (alpha < 200) continue;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max < 32 || max - min < 18) continue;
    const key = `${Math.round(red / 24)},${Math.round(green / 24)},${Math.round(blue / 24)}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += red;
    bucket.g += green;
    bucket.b += blue;
    buckets.set(key, bucket);
  }

  let best: { rgb: Rgb; score: number } | null = null;
  for (const bucket of buckets.values()) {
    const rgb: Rgb = [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count];
    const score = bucket.count * saturation(rgb);
    if (!best || score > best.score) best = { rgb, score };
  }
  if (!best || best.score <= 0) return null;

  const accent = clampRgb(boost(best.rgb));
  const app = mix(accent, [10, 10, 12], 0.84);
  const raised = mix(accent, [16, 16, 18], 0.76);
  const hover = mix(accent, [28, 28, 32], 0.66);
  const border = mix(accent, [40, 40, 44], 0.62);
  return {
    app: fmt(app),
    raised: fmt(raised),
    hover: fmt(hover),
    accent: fmt(accent),
    accentDim: fmt(mix(accent, [0, 0, 0], 0.35)),
    play: fmt(mix(accent, [255, 255, 255], 0.72)),
    playFg: fmt(mix(accent, [8, 8, 10], 0.78)),
    text: "244 244 246",
    muted: fmt(mix([210, 210, 214], app, 0.35)),
    subtle: "226 226 230",
    border: fmt(border),
    line: fmt(mix(accent, [24, 24, 28], 0.7)),
  };
}

function saturation([red, green, blue]: Rgb): number {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max === 0) return 0;
  return (max - min) / max;
}

function boost([red, green, blue]: Rgb): Rgb {
  const max = Math.max(red, green, blue, 1);
  const scale = 210 / max;
  return [red * scale, green * scale, blue * scale];
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    from[0] * (1 - amount) + to[0] * amount,
    from[1] * (1 - amount) + to[1] * amount,
    from[2] * (1 - amount) + to[2] * amount,
  ];
}

function clampRgb([red, green, blue]: Rgb): Rgb {
  return [clamp(red), clamp(green), clamp(blue)];
}

function clamp(value: number): number {
  return Math.min(255, Math.max(0, value));
}

function fmt(rgb: Rgb): string {
  return rgb.map((value) => Math.round(clamp(value))).join(" ");
}
