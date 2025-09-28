import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  experimental: {
    renderBuiltUrl(filename) {
      if (import.meta.env.VITE_DATAFILE_BASE_URL != null) {
        const match = filename.match(/^assets\/(.*\.bin)$/);
        if (match) {
          return import.meta.env.VITE_DATAFILE_BASE_URL + match[1];
        }
      }
    },
  },
});
