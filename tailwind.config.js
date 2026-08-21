/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // Themes are switched by NativeWind's colorScheme, which toggles the `dark`
  // class -- the same hook global.css keys its second block off.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Semantic tokens. Screens name a ROLE, never a shade, so one palette
           swap in global.css restyles all 21 of them. The rgb(... / <alpha>)
           wrapper is what keeps opacity modifiers like bg-surface/40 working
           with CSS variables. */
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        sunken: 'rgb(var(--color-sunken) / <alpha-value>)',
        hairline: 'rgb(var(--color-hairline) / <alpha-value>)',
        'hairline-strong': 'rgb(var(--color-hairline-strong) / <alpha-value>)',

        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--color-ink-soft) / <alpha-value>)',
        'ink-muted': 'rgb(var(--color-ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--color-ink-faint) / <alpha-value>)',

        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-text': 'rgb(var(--color-accent-text) / <alpha-value>)',
        'on-accent': 'rgb(var(--color-on-accent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',

        // Kept: still referenced by the brand mark and a few AI accents.
        primary: {
          DEFAULT: '#4f46e5',
          dark: '#0e2a5c',
        },
        brand: {
          navy: '#0e2a5c',
          indigo: '#4f46e5',
          violet: '#8b5cf6',
          gold: '#FDC20E', // sampled from assets/images/logo.png
        }
      },
      fontFamily: {
        sans: ["System", "sans-serif"],
      }
    },
  },
  plugins: [],
}
