import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary Brand Colors
        primary: "#16a34a",
        secondary: "#059669",

        // Form Page - Gold & Black Theme
        form: {
          black: "#1a1a1a",
          gold: "#d4af37",
          "gold-light": "#f0e5d8",
          "gold-dark": "#a88a2a",
          white: "#ffffff",
          "off-white": "#f5f5f5",
          "text-dark": "#2d2d2d",
          border: "#e0e0e0",
          placeholder: "#999999",
          success: "#22c55e",
          error: "#ef4444",
        },

        // Light Mode
        light: {
          bg: "#FFFFFF",
          text: "#0A0A0A",
          border: "#E5E5E5",
          muted: "#F5F5F5",
          error: "#F87171",
        },

        // Dark Mode
        dark: {
          bg: "#0A0A0A",
          text: "#FAFAFA",
          secondary: "#262626",
          border: "#262626",
          error: "#7F1D1D",
        },

        // Accent Colors
        accent: {
          amber: "#F59E0B",
          cyan: "#06B6D4",
          orange: "#FB923C",
          red: "#F87171",
        },
      },
    },
  },
  plugins: [],
}
export default config
