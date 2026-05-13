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
        ink: '#4B0082',
        paper: '#FF6A00',
        muted: 'rgba(75, 0, 130, 0.72)',
        line: 'rgba(75, 0, 130, 0.36)',
      },
    },
  },
  plugins: [],
};
