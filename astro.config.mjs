import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

// На VPS задайте PUBLIC_SITE_URL=https://ваш-домен.ru (для canonical, sitemap и т.п.)
const site = process.env.PUBLIC_SITE_URL || 'https://potok.ai';

export default defineConfig({
  site,
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [tailwind(), mdx()],
});