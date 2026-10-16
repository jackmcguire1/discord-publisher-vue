import { ref, computed } from "vue";

// Two pages (the editor and settings) don't justify vue-router. Routes live in
// the hash so GitHub Pages serves them without rewrites, and the query string
// stays free for Firebase's sign-in links.

export type SettingsTab = "general" | "members" | "webhooks" | "authors" | "account";
export type Route = { page: "editor" } | { page: "settings"; tab: SettingsTab };

const TABS: SettingsTab[] = ["general", "members", "webhooks", "authors", "account"];

function parse(hash: string): Route {
  const [page, tab] = hash.replace(/^#\/?/, "").split("/");
  if (page === "settings") return { page: "settings", tab: TABS.includes(tab as SettingsTab) ? (tab as SettingsTab) : "webhooks" };
  return { page: "editor" };
}

const hash = ref(window.location.hash);
window.addEventListener("hashchange", () => (hash.value = window.location.hash));

export const route = computed(() => parse(hash.value));

export function navigate(path: "/" | `/settings/${SettingsTab}`) {
  window.location.hash = path === "/" ? "" : path;
  hash.value = window.location.hash;
}

export function href(path: "/" | `/settings/${SettingsTab}`): string {
  return path === "/" ? "#/" : `#${path}`;
}
