import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        mc: {
          bg: "#0a0a0b",
          surface: "#111113",
          elevated: "#18181b",
          border: "#27272a",
          "border-hover": "#3f3f46",
          text: "#fafafa",
          "text-secondary": "#a1a1aa",
          "text-tertiary": "#71717a",
          accent: "#818cf8",
          "accent-hover": "#6366f1",
          "accent-subtle": "rgba(129, 140, 248, 0.1)",
          success: "#34d399",
          warning: "#fbbf24",
          danger: "#f87171",
        },
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in": "slideIn 0.2s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
