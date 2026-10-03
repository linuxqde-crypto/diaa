import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff', 500: '#0ea5a0', 600: '#0b8f8c', 700: '#0a7573', 900: '#084d4c',
        },
      },
      fontFamily: {
        arabic: ['"IBM Plex Sans Arabic"', '"Cairo"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
