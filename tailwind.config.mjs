/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Onest', 'system-ui', 'sans-serif'],
        display: ['Onest', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      colors: {
        ink: '#0A0A0A',
        paper: '#FAFAF7',
        muted: '#6B6B6B',
        line: '#E8E8E3',
      },
    },
  },
  plugins: [],
};
