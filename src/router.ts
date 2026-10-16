import { ref, computed } from "vue";

// Three pages (editor, messages, settings) don't justify vue-router. Routes live in
// the hash so GitHub Pages serves them without rewrites, and the query string
// stays free for Firebase's sign-in links.

export type SettingsTab = "general" | "members" | "webhooks" | "authors" | "account";
export type Route = { page: "editor" } | { page: "messages" } | { page: "settings"; tab: SettingsTab };
export type Path = "/" | "/messages" | `/settings/${SettingsTab}`;

const TABS: SettingsTab[] = ["general", "members", "webhooks", "authors", "account"];

function parse(hash: string): Route {
  const [page, tab] = hash.replace(/^#\/?/, "").split("/");
  if (page === "messages") return { page: "messages" };
  if (page === "settings") return { page: "settings", tab: TABS.includes(tab as SettingsTab) ? (tab as SettingsTab) : "webhooks" };
  return { page: "editor" };
}

const hash = ref(window.location.hash);
window.addEventListener("hashchange", () => (hash.value = window.location.hash));

export const route = computed(() => parse(hash.value));

export function navigate(path: Path) {
  window.location.hash = path === "/" ? "" : path;
  hash.value = window.location.hash;
}

export function href(path: Path): string {
  return path === "/" ? "#/" : `#${path}`;
}
