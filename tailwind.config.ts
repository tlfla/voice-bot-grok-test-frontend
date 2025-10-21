import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#16a34a",
        secondary: "#059669",
        accent: "#0d9488",
      },
    },
  },
  plugins: [],
}
export default config
