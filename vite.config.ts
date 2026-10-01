import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// GitHub Pages serves project sites from /<repo>/. Override with VITE_BASE if
// you deploy somewhere else (e.g. VITE_BASE=/ for a custom domain).
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  base:
    process.env.VITE_BASE ??
    (mode === "production" ? "/discord-publisher-vue/" : "/"),
  build: {
    outDir: "dist",
    sourcemap: false,
  },
}));
