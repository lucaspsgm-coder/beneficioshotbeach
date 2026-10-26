import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F8F8",
        surface: "#FFFFFF",
        ink: { DEFAULT: "#14262B", soft: "#4A5D62", faint: "#7F9094" },
        line: { DEFAULT: "#DCE4E5", strong: "#C3CFD1" },
        petrol: {
          50: "#EEF5F6",
          100: "#D6E8EA",
          200: "#AFD0D4",
          500: "#1A6B79",
          600: "#0B5563",
          700: "#08434E",
          800: "#06333B",
        },
        ok: { DEFAULT: "#2F7A58", bg: "#E8F3ED" },
        warn: { DEFAULT: "#9A6512", bg: "#FBF1DF" },
        bad: { DEFAULT: "#A8423A", bg: "#F8E7E5" },
      },
      fontFamily: {
        sans: ['"Public Sans Variable"', "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: { md: "6px", lg: "10px" },
      boxShadow: {
        panel: "0 1px 0 rgba(20,38,43,0.04)",
        pop: "0 12px 32px -12px rgba(8,51,59,0.28)",
      },
    },
  },
  plugins: [],
} satisfies Config;
