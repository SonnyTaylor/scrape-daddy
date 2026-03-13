import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ScrapeDaddy',
    description: 'Extract data instantly: Grab text, images, emails & links from any website with a single click.',
    permissions: ['activeTab', 'scripting', 'storage', 'downloads', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    action: {},
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
