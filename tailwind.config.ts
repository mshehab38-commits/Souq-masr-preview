import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        cairo: ["var(--font-cairo)", "sans-serif"],
        tajawal: ["var(--font-tajawal)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
