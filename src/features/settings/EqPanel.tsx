import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import {
  EQ_BANDS,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  FLAT_EQ_ID,
  MAX_USER_EQ_PRESETS,
  WORKING_EQ_ID,
  bandsFromSimple,
  dirtyEqPreset,
  effectivePreamp,
  eqStatus,
  newCustomEq,
  normalizeEqGains,
  simpleFromBands,
  toEqUpdate,
  EMPTY_EQ,
  type EqBuiltin,
  type EqState,
  type EqUserPreset,
} from "@/lib/eq";
import { errorMessage } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";

export function EqPanel() {
  const snapshot = useAppStore((state) => state.snapshot);
  const applySnapshot = useAppStore((state) => state.applySnapshot);
  const setStatus = useAppStore((state) => state.setStatus);
  const remote = snapshot?.eq ?? EMPTY_EQ;
  const [eq, setEq] = useState<EqState>(remote);
  const [advanced, setAdvanced] = useState(false);
  const [name, setName] = useState("Custom EQ");
  const dragging = useRef(false);
  const sourceId = useRef(remote.presetId || FLAT_EQ_ID);
  const timer = useRef(0);

  useEffect(() => {
    if (!dragging.current) {
      setEq(remote);
      if (remote.presetId && remote.presetId !== WORKING_EQ_ID) {
        sourceId.current = remote.presetId;
        const custom = remote.customPresets.find((item) => item.id === remote.presetId);
        if (custom) setName(custom.name);
      }
    }
  }, [remote]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function push(next: EqState, immediate = false) {
    setEq(next);
    window.clearTimeout(timer.current);
    const send = () => {
      void api
        .setEq(toEqUpdate(next))
        .then(applySnapshot)
        .catch((error) => setStatus(errorMessage(error, "Couldn't save equalizer")));
    };
    if (immediate) send();
    else timer.current = window.setTimeout(send, 80);
  }

  function pickBuiltin(item: EqBuiltin) {
    sourceId.current = item.id;
    dragging.current = false;
    push(
      {
        ...eq,
        enabled: true,
        presetId: item.id,
        gains: normalizeEqGains(item.gains),
        preamp: item.preamp,
      },
      true,
    );
  }

  function pickUser(item: EqUserPreset) {
    sourceId.current = item.id;
    setName(item.name);
    dragging.current = false;
    push(
      {
        ...eq,
        enabled: true,
        presetId: item.id,
        gains: normalizeEqGains(item.gains),
        preamp: item.preamp,
        autoPreamp: item.autoPreamp,
      },
      true,
    );
  }

  function tweak(patch: Partial<EqState>) {
    push(dirtyEqPreset({ ...eq, ...patch }));
  }

  function resetSource() {
    const builtin = eq.builtins.find((item) => item.id === sourceId.current);
    if (builtin) {
      pickBuiltin(builtin);
      return;
    }
    const custom = eq.customPresets.find((item) => item.id === sourceId.current);
    if (custom) pickUser(custom);
  }

  function resetFlat() {
    const flat = eq.builtins.find((item) => item.id === FLAT_EQ_ID);
    if (flat) pickBuiltin(flat);
    else {
      sourceId.current = FLAT_EQ_ID;
      push({ ...eq, enabled: eq.enabled, presetId: FLAT_EQ_ID, gains: Array(10).fill(0), preamp: 0 }, true);
    }
  }

  async function savePreset() {
    const existing = eq.customPresets.find((item) => item.id === sourceId.current);
    const preset = existing
      ? {
          ...existing,
          name: name.trim() || existing.name,
          gains: normalizeEqGains(eq.gains),
          preamp: eq.preamp,
          autoPreamp: eq.autoPreamp,
        }
      : newCustomEq(eq, name.trim() || "Custom EQ");
    try {
      const next = await api.saveCustomEq(preset);
      sourceId.current = preset.id;
      dragging.current = false;
      applySnapshot(next);
      setName(preset.name);
    } catch (error) {
      setStatus(errorMessage(error, "Couldn't save preset"));
    }
  }

  async function removePreset(id: string) {
    try {
      applySnapshot(await api.deleteCustomEq(id));
    } catch (error) {
      setStatus(errorMessage(error, "Couldn't remove preset"));
    }
  }

  const simple = simpleFromBands(eq.gains);
  const sourceName =
    eq.builtins.find((item) => item.id === sourceId.current)?.name ??
    eq.customPresets.find((item) => item.id === sourceId.current)?.name ??
    "preset";
  const dirty = eq.presetId === WORKING_EQ_ID;
  const autoPre = effectivePreamp(eq.gains, eq.preamp, eq.autoPreamp);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-[16px] font-semibold text-app-text">Equalizer</h3>
        <p className="text-[13px] font-semibold text-app-subtle">{eqStatus(eq)}</p>
      </div>

      <Toggle
        label="Enable"
        checked={eq.enabled}
        onChange={(enabled) => push({ ...eq, enabled }, true)}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {eq.builtins.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.description}
            onClick={() => pickBuiltin(item)}
            className={`rounded-lg border px-3 py-2.5 text-left text-[14px] font-semibold leading-5 ${
              eq.presetId === item.id
                ? "border-app-accent bg-app-hover text-app-text"
                : "border-app-border text-app-subtle hover:bg-app-hover"
            }`}
          >
            {item.name}
          </button>
        ))}
        {eq.customPresets.map((item) => (
          <div key={item.id} className="relative">
            <button
              type="button"
              title={item.name}
              onClick={() => pickUser(item)}
              onDoubleClick={() => {
                sourceId.current = item.id;
                setName(item.name);
              }}
              className={`w-full rounded-lg border px-3 py-2.5 pr-8 text-left text-[14px] font-semibold leading-5 ${
                eq.presetId === item.id
                  ? "border-app-accent bg-app-hover text-app-text"
                  : "border-app-border text-app-subtle hover:bg-app-hover"
              }`}
            >
              {item.name}
            </button>
            <button
              type="button"
              title="Remove"
              aria-label={`Remove ${item.name}`}
              onClick={() => void removePreset(item.id)}
              className="absolute right-1.5 top-1.5 rounded p-1 text-app-muted hover:text-app-text"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          title={eq.customPresets.length >= MAX_USER_EQ_PRESETS ? "Limit reached" : "Save preset"}
          aria-label="Save preset"
          disabled={eq.customPresets.length >= MAX_USER_EQ_PRESETS}
          onClick={() => void savePreset()}
          className="flex items-center justify-center rounded-lg border border-dashed border-app-border px-3 py-2.5 text-app-muted hover:border-app-accent hover:bg-app-hover hover:text-app-text disabled:opacity-40"
        >
          <Plus size={20} />
        </button>
      </div>

      <GainSlider
        label="Bass"
        value={simple.bass}
        onChange={(bass) => tweak({ gains: bandsFromSimple(bass, simple.mids, simple.treble) })}
        onHold={(hold) => {
          dragging.current = hold;
        }}
      />
      <GainSlider
        label="Mids"
        value={simple.mids}
        onChange={(mids) => tweak({ gains: bandsFromSimple(simple.bass, mids, simple.treble) })}
        onHold={(hold) => {
          dragging.current = hold;
        }}
      />
      <GainSlider
        label="Treble"
        value={simple.treble}
        onChange={(treble) => tweak({ gains: bandsFromSimple(simple.bass, simple.mids, treble) })}
        onHold={(hold) => {
          dragging.current = hold;
        }}
      />
      <GainSlider
        label="Level"
        value={eq.preamp}
        onChange={(preamp) => tweak({ preamp })}
        onHold={(hold) => {
          dragging.current = hold;
        }}
      />
      {eq.autoPreamp && autoPre < eq.preamp - 0.05 ? (
        <p className="text-[13px] text-app-muted">Adjusted to prevent clipping.</p>
      ) : null}

      <Toggle
        label="Prevent clipping"
        hint="Lowers the EQ if it would distort."
        checked={eq.autoPreamp}
        onChange={(autoPreamp) => push(dirtyEqPreset({ ...eq, autoPreamp }), true)}
      />

      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="text-[16px] font-semibold text-app-text">Advanced</span>
        <input
          type="checkbox"
          checked={advanced}
          onChange={(event) => setAdvanced(event.target.checked)}
          className="h-4 w-4"
        />
      </label>

      {advanced ? (
        <div className="flex flex-col gap-4">
          {EQ_BANDS.map((band, index) => (
            <GainSlider
              key={band.hz}
              label={`${band.label} — ${band.hint}`}
              value={eq.gains[index] ?? 0}
              onChange={(gain) => {
                const gains = normalizeEqGains(eq.gains);
                gains[index] = gain;
                tweak({ gains });
              }}
              onHold={(hold) => {
                dragging.current = hold;
              }}
            />
          ))}
          <GainSlider
            label="Level"
            value={eq.preamp}
            onChange={(preamp) => tweak({ preamp })}
            onHold={(hold) => {
              dragging.current = hold;
            }}
          />
          <button
            type="button"
            onClick={resetFlat}
            className="self-start rounded-lg border border-app-border px-3 py-2 text-[14px] font-semibold text-app-subtle hover:bg-app-hover"
          >
            Reset
          </button>
        </div>
      ) : null}

      {dirty && sourceId.current !== WORKING_EQ_ID ? (
        <button
          type="button"
          onClick={resetSource}
          className="self-start text-[14px] font-semibold text-app-accent hover:underline"
        >
          Reset to {sourceName}
        </button>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          void savePreset();
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          className="min-w-0 flex-1 rounded-lg border border-app-border bg-app px-3 py-2 text-[15px] text-app-text"
        />
        <button
          type="submit"
          className="rounded-lg bg-app-play px-3 py-2 text-[14px] font-semibold text-app-play-fg"
        >
          Save
        </button>
      </form>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[16px] font-semibold text-app-text">{label}</span>
        {hint ? <span className="mt-1 block text-[14px] leading-6 text-app-muted">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4"
      />
    </label>
  );
}

function GainSlider({
  label,
  hint,
  value,
  onChange,
  onHold,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  onHold: (hold: boolean) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-[15px] font-semibold text-app-text">{label}</span>
          {hint ? <span className="mt-1 block text-[13px] leading-5 text-app-muted">{hint}</span> : null}
        </span>
        <span className="shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums text-app-subtle">
          {value > 0 ? "+" : ""}
          {value.toFixed(1)}
        </span>
      </span>
      <input
        type="range"
        min={EQ_GAIN_MIN}
        max={EQ_GAIN_MAX}
        step={0.5}
        value={value}
        onPointerDown={() => onHold(true)}
        onPointerUp={() => onHold(false)}
        onPointerCancel={() => onHold(false)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full"
      />
    </label>
  );
}
