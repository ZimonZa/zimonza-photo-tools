import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        accent2: "hsl(var(--accent-2))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        glow: "0 0 24px -4px hsl(var(--accent) / 0.5)",
        "glow-lg": "0 0 48px -8px hsl(var(--accent) / 0.55)",
        card: "0 1px 2px 0 rgb(0 0 0 / 0.05), 0 8px 24px -12px rgb(0 0 0 / 0.25)",
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "fade-up": "fade-up 0.5s ease-out both",
        "scale-in": "scale-in 0.3s ease-out both",
        float: "float 5s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        "drag-pulse": "drag-pulse 1.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
