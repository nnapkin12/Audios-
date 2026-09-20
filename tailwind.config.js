/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          DEFAULT: "rgb(var(--app) / <alpha-value>)",
          frame: "rgb(var(--app-frame) / <alpha-value>)",
          raised: "rgb(var(--app-raised) / <alpha-value>)",
          bar: "rgb(var(--app-bar) / <alpha-value>)",
          "bar-line": "rgb(var(--app-bar-line) / <alpha-value>)",
          hover: "rgb(var(--app-hover) / <alpha-value>)",
          border: "rgb(var(--app-border) / <alpha-value>)",
          line: "rgb(var(--app-line) / <alpha-value>)",
          muted: "rgb(var(--app-muted) / <alpha-value>)",
          text: "rgb(var(--app-text) / <alpha-value>)",
          subtle: "rgb(var(--app-subtle) / <alpha-value>)",
          accent: "rgb(var(--app-accent) / <alpha-value>)",
          "accent-dim": "rgb(var(--app-accent-dim) / <alpha-value>)",
          danger: "rgb(var(--app-danger) / <alpha-value>)",
          play: "rgb(var(--app-play) / <alpha-value>)",
          "play-fg": "rgb(var(--app-play-fg) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
