/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Switchday brand colors — keep in sync with web app
        brand: {
          olive: "#6B7535",
          sage: "#5A8A5A",
          slate: "#5A4A7A",
        },
      },
    },
  },
  plugins: [],
};
