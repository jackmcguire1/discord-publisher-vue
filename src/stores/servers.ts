import { ref, computed } from "vue";
import { load, persistRef } from "./persist";
import { clearWebhookServer } from "./webhooks";
import { clearDraftServer } from "./drafts";

// A "server" groups webhooks and drafts that belong to the same Discord server
// (or organisation). The optional Discord server id makes "open in Discord"
// links resolve to the right place.

export interface Server {
  id: string;
  name: string;
  /** Discord guild id, optional. Used to build message links. */
  guildId: string;
  createdAt: string;
}

const state = ref<Server[]>(load<Server[]>("servers", []));
persistRef("servers", state);

export const servers = computed(() => [...state.value].sort((a, b) => a.name.localeCompare(b.name)));

function newId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getServer(id: string | null | undefined): Server | undefined {
  return id ? state.value.find((s) => s.id === id) : undefined;
}

export function findServerByName(name: string): Server | undefined {
  const n = name.trim().toLowerCase();
  return state.value.find((s) => s.name.toLowerCase() === n);
}

export function addServer(input: { name: string; guildId?: string }): Server {
  const s: Server = {
    id: newId(),
    name: input.name.trim() || "Untitled server",
    guildId: (input.guildId ?? "").trim(),
    createdAt: new Date().toISOString(),
  };
  state.value.push(s);
  return s;
}

export function updateServer(id: string, patch: { name?: string; guildId?: string }) {
  const s = getServer(id);
  if (!s) return;
  if (patch.name !== undefined) s.name = patch.name.trim() || s.name;
  if (patch.guildId !== undefined) s.guildId = patch.guildId.trim();
}

/** Remove a server. Its webhooks and drafts are kept, just ungrouped. */
export function deleteServer(id: string) {
  state.value = state.value.filter((s) => s.id !== id);
  clearWebhookServer(id);
  clearDraftServer(id);
}

/** Guild id to use in Discord message links for things filed under this server. */
export function guildIdFor(serverId: string | null | undefined): string {
  return getServer(serverId)?.guildId || "@me";
}
