import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";

const HOTJAR_SITE_ID = 6787642;

/** Inject the Hotjar tracking snippet into <head>, production builds only. */
function hotjar(siteId: number): Plugin {
  return {
    name: "hotjar",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          injectTo: "head-prepend",
          children: `(function(h,o,t,j,a,r){
        h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
        h._hjSettings={hjid:${siteId},hjsv:6};
        a=o.getElementsByTagName('head')[0];
        r=o.createElement('script');r.async=1;
        r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
        a.appendChild(r);
    })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`,
        },
      ];
    },
  };
}

// GitHub Pages serves project sites from /<repo>/. Override with VITE_BASE if
// you deploy somewhere else (e.g. VITE_BASE=/ for a custom domain).
export default defineConfig(({ mode }) => ({
  plugins: [vue(), hotjar(HOTJAR_SITE_ID)],
  base:
    process.env.VITE_BASE ??
    (mode === "production" ? "/discord-publisher-vue/" : "/"),
  build: {
    outDir: "dist",
    sourcemap: false,
  },
}));
