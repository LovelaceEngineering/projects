import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "claude-cream": "#F7F4EE",
        "claude-sand": "#E8E2D5",
        "claude-dark": "#1F1F1E",
        "claude-muted": "#6B665C",
        "claude-amber": "#D97706",
        "claude-amber-dark": "#B45309",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-lora)", "Georgia", "serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
