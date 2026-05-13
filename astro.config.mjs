import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://potok.ai',
  output: 'server',
  adapter: vercel(),
  integrations: [tailwind(), mdx()],
});