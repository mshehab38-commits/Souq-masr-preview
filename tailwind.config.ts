import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        cairo: ["var(--font-cairo)", "sans-serif"],
        tajawal: ["var(--font-tajawal)", "sans-serif"],
      },
      colors: {
        teal: {
          50: "#EFFBFA",
          100: "#D7F2EF",
          200: "#AFE6DF",
          300: "#7DD3C9",
          400: "#46B7AC",
          500: "#219A8F",
          600: "#0F8A82",
          700: "#0B6E68",
          800: "#0A5750",
          900: "#073F3B",
          950: "#042A27",
        },
        amber: {
          50: "#FFF8EC",
          100: "#FEECC7",
          200: "#FDD68A",
          300: "#FBBB4D",
          400: "#F5A623",
          500: "#E8940A",
          600: "#C77A05",
          700: "#9C5E04",
          800: "#714404",
          900: "#4D2E03",
        },
        success: "#16A34A",
        warning: "#CA8A04",
        danger: "#DC2626",
        info: "#2563EB",
      },
    },
  },
  plugins: [],
};

export default config;
