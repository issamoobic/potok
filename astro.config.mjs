import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

// На VPS задайте PUBLIC_SITE_URL=https://ваш-домен.ru (для canonical, sitemap и т.п.)
const site = process.env.PUBLIC_SITE_URL || 'https://potok.ai';

// На Vercel в процессе сборки выставляется VERCEL=1 — нужен @astrojs/vercel.
// Локально и на своём Node-сервере — @astrojs/node (standalone).
const isVercel = process.env.VERCEL === '1';

export default defineConfig({
  site,
  output: 'server',
  adapter: isVercel ? vercel() : node({ mode: 'standalone' }),
  integrations: [tailwind(), mdx()],
});