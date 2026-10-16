import { ref } from "vue";
import { load, save } from "./persist";

// Banners the user has closed, by key. Persistent keys survive reloads;
// session keys come back next visit (for prompts that still need acting on).

const persisted = ref<string[]>(load<string[]>("dismissed", []));
const session = ref<string[]>([]);

export function isDismissed(key: string): boolean {
  return persisted.value.includes(key) || session.value.includes(key);
}

export function dismiss(key: string, { persist = true } = {}) {
  if (persist) {
    // Keep the list bounded; old per-message keys are not worth remembering forever.
    persisted.value = [...persisted.value.filter((k) => k !== key), key].slice(-200);
    save("dismissed", persisted.value);
  } else {
    session.value = [...session.value, key];
  }
}
