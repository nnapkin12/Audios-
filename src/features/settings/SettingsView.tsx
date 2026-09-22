import { useState } from "react";
import { Plus, X } from "lucide-react";
import { EqPanel } from "@/features/settings/EqPanel";
import { ThemeBuilder } from "@/features/settings/ThemeBuilder";
import { api, openExternal } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { GITHUB_URL, SVG_REPO_MARKS } from "@/lib/links";
import {
  ACCENTS,
  THEMES,
  newCustomTheme,
  readThemeColors,
  type CustomTheme,
} from "@/lib/theme";
import { useAppStore } from "@/store/useAppStore";

export function SettingsView() {
  const snapshot = useAppStore((state) => state.snapshot);
  const libraryRoots = useAppStore((state) => state.libraryRoots);
  const theme = useAppStore((state) => state.theme);
  const accent = useAppStore((state) => state.accent);
  const customThemes = useAppStore((state) => state.customThemes);
  const minimizeMovement = useAppStore((state) => state.minimizeMovement);
  const setAppearance = useAppStore((state) => state.setAppearance);
  const setMinimizeMovement = useAppStore((state) => state.setMinimizeMovement);
  const setStatus = useAppStore((state) => state.setStatus);
  const [builder, setBuilder] = useState<CustomTheme | "new" | null>(null);

  function applySaved(next: { theme: string; accent: string; customThemes: CustomTheme[] }) {
    setAppearance(next.theme, next.accent, next.customThemes);
  }

  async function saveAppearance(nextTheme: string, nextAccent: string) {
    setAppearance(nextTheme, nextAccent);
    try {
      applySaved(await api.setAppearance(nextTheme, nextAccent));
    } catch (error) {
      setStatus(errorMessage(error, "Could not save theme"));
    }
  }

  async function saveCustomTheme(
    draft: { name: string; colors: CustomTheme["colors"] },
    existing?: CustomTheme,
  ) {
    const theme = existing
      ? { ...existing, name: draft.name, colors: draft.colors }
      : newCustomTheme(draft.colors, draft.name);
    try {
      applySaved(await api.saveCustomTheme(theme));
      setBuilder(null);
    } catch (error) {
      setStatus(errorMessage(error, "Could not save theme"));
    }
  }

  async function removeCustomTheme(id: string) {
    try {
      applySaved(await api.deleteCustomTheme(id));
    } catch (error) {
      setStatus(errorMessage(error, "Could not remove theme"));
    }
  }

  return (
    <section className="page-scroll flex flex-col">
      <div className="flex w-full flex-col gap-8">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
        </div>

        <section className="rounded-xl border border-app-border bg-app-raised/80 p-5">
          <h2 className="mb-4 text-[16px] font-semibold">Theme</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void saveAppearance(item.id, accent)}
                className={`rounded-lg border px-3 py-3 text-left text-[15px] font-semibold ${
                  theme === item.id
                    ? "border-app-accent bg-app-hover text-app-text"
                    : "border-app-border text-app-subtle hover:bg-app-hover"
                }`}
              >
                {item.label}
              </button>
            ))}
            {customThemes.map((item) => (
              <div key={item.id} className="relative">
                <button
                  type="button"
                  onClick={() => void saveAppearance(item.id, accent)}
                  onDoubleClick={() => setBuilder(item)}
                  className={`w-full rounded-lg border px-3 py-3 pr-8 text-left text-[15px] font-semibold ${
                    theme === item.id
                      ? "border-app-accent bg-app-hover text-app-text"
                      : "border-app-border text-app-subtle hover:bg-app-hover"
                  }`}
                >
                  {item.name}
                </button>
                <button
                  type="button"
                  title="Remove theme"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => void removeCustomTheme(item.id)}
                  className="absolute right-1.5 top-1.5 rounded p-1 text-app-muted hover:text-app-text"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              title="Create theme"
              aria-label="Create theme"
              onClick={() => setBuilder("new")}
              className="flex items-center justify-center rounded-lg border border-dashed border-app-border px-3 py-3 text-app-muted hover:border-app-accent hover:bg-app-hover hover:text-app-text"
            >
              <Plus size={20} />
            </button>
          </div>
          <h3 className="mb-3 mt-6 text-[15px] font-semibold text-app-subtle">Accent</h3>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void saveAppearance(theme, item.id)}
                className={`rounded-full border px-3 py-1.5 text-[14px] font-semibold ${
                  accent === item.id
                    ? "border-app-accent text-app-text"
                    : "border-app-border text-app-muted hover:text-app-text"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-app-border bg-app-raised/80 p-5">
          <h2 className="mb-4 text-[16px] font-semibold">Playback</h2>
          <div className="flex flex-col gap-5">
            <Toggle
              label="ReplayGain"
              hint="Normalize volume from tags when they exist."
              checked={snapshot?.replaygain ?? true}
              onChange={(checked) => void api.setReplaygain(checked)}
            />
            <Toggle
              label="Gapless playback"
              hint="Start the next song before this one ends."
              checked={snapshot?.gapless ?? true}
              onChange={(checked) => void api.setGapless(checked)}
            />
            <EqPanel />
          </div>
        </section>

        <section className="rounded-xl border border-app-border bg-app-raised/80 p-5">
          <h2 className="mb-4 text-[16px] font-semibold">Interface</h2>
          <Toggle
            label="Minimize movement"
            hint="Fewer animations, lower GPU use."
            checked={minimizeMovement}
            onChange={(checked) => {
              setMinimizeMovement(checked);
              void api.setMinimizeMovement(checked).catch((error) => {
                setMinimizeMovement(!checked);
                setStatus(errorMessage(error, "Could not save setting"));
              });
            }}
          />
        </section>

        <section className="rounded-xl border border-app-border bg-app-raised/80 p-5">
          <h2 className="mb-2 text-[16px] font-semibold">Credits</h2>
          <p className="mb-3 text-[14px] leading-6 text-app-muted">
            The Audios! logo uses these SVGs
          </p>
          <ul className="flex flex-col gap-1.5">
            {SVG_REPO_MARKS.map((item) => (
              <li key={item.href}>
                <button
                  type="button"
                  onClick={() => void openExternal(item.href)}
                  className="text-left text-[15px] font-semibold text-app-accent hover:underline"
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void openExternal(GITHUB_URL)}
            className="mt-4 text-[15px] font-semibold text-app-accent hover:underline"
          >
            GitHub
          </button>
        </section>

        <section className="rounded-xl border border-app-border bg-app-raised/80 p-5">
          <h2 className="mb-2 text-[16px] font-semibold">Library</h2>
          {libraryRoots.length === 0 ? (
            <p className="text-[15px] text-app-subtle">None yet</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {libraryRoots.map((path) => (
                <li key={path} className="break-all text-[15px] text-app-subtle">
                  {path}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {builder ? (
        <ThemeBuilder
          initialName={builder === "new" ? "Custom theme" : builder.name}
          initialColors={builder === "new" ? readThemeColors() : builder.colors}
          onCancel={() => setBuilder(null)}
          onSave={(draft) => void saveCustomTheme(draft, builder === "new" ? undefined : builder)}
        />
      ) : null}
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[16px] font-semibold text-app-text">{label}</span>
        <span className="mt-1 block text-[14px] leading-6 text-app-muted">{hint}</span>
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
