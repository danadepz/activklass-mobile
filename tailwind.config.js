/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Activklass design tokens
        primary: {
          DEFAULT: '#4f46e5', // indigo-600
          dark: '#0e2a5c',    // deep navy focus/primary
        },
        brand: {
          navy: '#0e2a5c',
          indigo: '#4f46e5',
          violet: '#8b5cf6', // AI color
        }
      },
      fontFamily: {
        sans: ["System", "sans-serif"],
      }
    },
  },
  plugins: [],
}
