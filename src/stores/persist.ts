import { watch, type Ref } from "vue";

const PREFIX = "discord-publisher:";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or disabled; the app still works for this session */
  }
}

/** Mirror a ref into localStorage whenever it changes. */
export function persistRef<T>(key: string, r: Ref<T>): void {
  watch(r, (v) => save(key, v), { deep: true });
}
