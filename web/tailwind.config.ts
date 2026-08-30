import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#f5f2e7",
        "cream-wash": "#f3d2b8",
        paper: "#f5f2e7",
        poster: "#ff4500",
        ink: "#000000",
        mute: "#5c5c5c",
        line: "#000000",
        log: "#c8c8c8",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "IBM Plex Sans", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "Barlow Condensed", "Arial Narrow", "Impact", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        none: "0px",
      },
    },
  },
  plugins: [],
};

export default config;
