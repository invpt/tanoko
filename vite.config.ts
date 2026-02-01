import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  experimental: {
    renderBuiltUrl(filename) {
      if (process.env.DATA_BASE_URL != null) {
        const match = filename.match(/^assets\/(.*\.(?:bin|woff2))$/);
        if (match) {
          return process.env.DATA_BASE_URL + match[1];
        }
      }
    },
  },
});
