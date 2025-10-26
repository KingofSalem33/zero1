/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand Colors
        brand: {
          primary: {
            50: "#eff6ff",
            100: "#dbeafe",
            200: "#bfdbfe",
            300: "#93c5fd",
            400: "#60a5fa",
            500: "#3b82f6", // Main blue
            600: "#2563eb",
            700: "#1d4ed8",
            800: "#1e40af",
            900: "#1e3a8a",
          },
          secondary: {
            50: "#faf5ff",
            100: "#f3e8ff",
            200: "#e9d5ff",
            300: "#d8b4fe",
            400: "#c084fc",
            500: "#a855f7", // Main purple
            600: "#9333ea",
            700: "#7e22ce",
            800: "#6b21a8",
            900: "#581c87",
          },
        },

        // Neutral Palette (refined grays)
        neutral: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa", // Subtle text
          500: "#71717a", // Medium text
          600: "#52525b", // Borders
          700: "#3f3f46", // Cards/surfaces
          800: "#27272a", // Elevated surfaces
          850: "#1f1f23", // Mid-dark surface
          900: "#18181b", // Main background
          950: "#0a0a0b", // Deepest
        },

        // Semantic Colors
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e", // Main green
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        warning: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b", // Main amber
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
        error: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444", // Main red
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
        },
      },

      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "Consolas",
          "Monaco",
          "Courier New",
          "monospace",
        ],
      },

      fontSize: {
        // Design token scale
        xs: ["0.75rem", { lineHeight: "1rem" }], // 12px
        sm: ["0.875rem", { lineHeight: "1.25rem" }], // 14px
        base: ["1rem", { lineHeight: "1.5rem" }], // 16px
        lg: ["1.125rem", { lineHeight: "1.75rem" }], // 18px
        xl: ["1.25rem", { lineHeight: "1.75rem" }], // 20px
        "2xl": ["1.5rem", { lineHeight: "2rem" }], // 24px
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }], // 30px
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }], // 36px
        "5xl": ["3rem", { lineHeight: "1" }], // 48px
        "6xl": ["3.75rem", { lineHeight: "1" }], // 60px
      },

      spacing: {
        // Additional spacing tokens
        18: "4.5rem", // 72px
        22: "5.5rem", // 88px
        26: "6.5rem", // 104px
        30: "7.5rem", // 120px
      },

      borderRadius: {
        // Design token scale
        sm: "0.25rem", // 4px
        DEFAULT: "0.5rem", // 8px
        md: "0.5rem", // 8px
        lg: "0.75rem", // 12px
        xl: "1rem", // 16px
        "2xl": "1.5rem", // 24px
        "3xl": "2rem", // 32px
      },

      boxShadow: {
        // Custom shadows for elevated surfaces
        "soft-sm": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        soft: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
        "soft-md":
          "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        "soft-lg":
          "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
        "soft-xl":
          "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        "soft-2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        glow: "0 0 20px rgba(59, 130, 246, 0.5)",
        "glow-purple": "0 0 20px rgba(168, 85, 247, 0.5)",
        "glow-green": "0 0 20px rgba(34, 197, 94, 0.5)",
      },

      backdropBlur: {
        xs: "2px",
      },

      animation: {
        "spin-slow": "spin 3s linear infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        fadeIn: "fadeIn 0.3s ease-in-out",
        slideIn: "slideIn 0.3s ease-out",
      },

      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
