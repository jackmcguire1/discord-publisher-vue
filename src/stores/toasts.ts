import { ref } from "vue";

export interface Toast {
  id: number;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}

export const toasts = ref<Toast[]>([]);
let nextId = 1;

export function toast(type: Toast["type"], title: string, message?: string, ttl = 5000) {
  const id = nextId++;
  toasts.value.push({ id, type, title, message });
  if (ttl > 0) setTimeout(() => dismissToast(id), ttl);
}

export function dismissToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
