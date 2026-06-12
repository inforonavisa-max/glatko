import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  darkMode: "class",
  content: [
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        premiumLight: {
          50: "#F8F6F0",
          100: "#F3F0E6",
          200: "#E8E0D0",
          DEFAULT: "#F8F6F0",
        },
        premiumDark: {
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#444444",
          800: "#3a3a3a",
          900: "#2a2a2a",
          950: "#333333",
          DEFAULT: "#333333",
        },
        // Vertical accent tokens (MASTER_PLAN §1.5, K7-r2): wayfinding only —
        // tab icons/active indicators, section tints (50), small factual
        // badges. NEVER buttons/CTAs/links/focus rings (those stay teal).
        // health = sky (medical blue); career = amber.
        health: {
          50: "#F0F9FF",
          100: "#E0F2FE",
          600: "#0284C7",
          700: "#0369A1",
        },
        career: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          600: "#D97706",
          700: "#B45309",
        },
        teal: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
          800: "#115E59",
          900: "#134E4A",
          950: "#042F2E",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-cormorant)", "Georgia", "serif"],
      },
      boxShadow: {
        "premium-sm": "0 2px 8px 0 rgba(30,32,34,0.06)",
        "premium-md": "0 4px 24px 0 rgba(30,32,34,0.10)",
        "premium-lg": "0 8px 48px 0 rgba(30,32,34,0.15)",
        "teal-sm": "0 2px 8px 0 rgba(20,184,166,0.15)",
        "teal-md": "0 4px 24px 0 rgba(20,184,166,0.25)",
        "teal-lg": "0 8px 48px 0 rgba(20,184,166,0.35)",
      },
      backgroundImage: {
        "teal-gradient": "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)",
        "dark-gradient": "linear-gradient(135deg, #1E2022 0%, #0b1f23 100%)",
      },
      animation: {
        "fade-up": "fadeUp 0.6s cubic-bezier(0.4,0,0.2,1) forwards",
        "fade-in": "fadeIn 0.4s cubic-bezier(0.4,0,0.2,1) forwards",
        "shimmer": "shimmer 2s linear infinite",
        "teal-pulse": "tealPulse 2s ease-in-out infinite",
        "slide-down": "slideDown 0.3s cubic-bezier(0.4,0,0.2,1) forwards",
        "marquee-left": "marqueeLeft 40s linear infinite",
        "marquee-right": "marqueeRight 40s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        tealPulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(20,184,166,0)" },
          "50%": { boxShadow: "0 0 0 8px rgba(20,184,166,0.15)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marqueeLeft: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(calc(-100% - 2rem))" },
        },
        marqueeRight: {
          "0%": { transform: "translateX(calc(-100% - 2rem))" },
          "100%": { transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [
    plugin(({ addBase, addUtilities, addComponents }) => {
      addBase({
        "@media (prefers-reduced-motion: reduce)": {
          "*": {
            "animation-duration": "0.01ms !important",
            "animation-iteration-count": "1 !important",
            "transition-duration": "0.01ms !important",
            "scroll-behavior": "auto !important",
          },
        },
      });
      addComponents({
        ".luxury-card": {
          transition: "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          "backface-visibility": "hidden",
        },
      });
      addUtilities({
        ".gpu-accelerate": {
          transform: "translateZ(0)",
          "will-change": "transform",
          "backface-visibility": "hidden",
        },
        // Horizontally scrollable tab/chip rows without a visible scrollbar
        ".scrollbar-none": {
          "scrollbar-width": "none",
          "-ms-overflow-style": "none",
          "&::-webkit-scrollbar": { display: "none" },
        },
      });
    }),
  ],
};

export default config;
