import { computed } from "vue";
import { orgCollection } from "./orgCollection";
import { clearWebhookServer } from "./webhooks";
import { clearDraftServer } from "./drafts";

// A "server" groups webhooks and drafts that belong to the same Discord server
// (or organisation). The optional Discord server id makes "open in Discord"
// links resolve to the right place. Shared with the active org; admins edit.

export interface Server {
  id: string;
  name: string;
  /** Discord guild id, optional. Used to build message links. */
  guildId: string;
  createdAt: string;
}

const store = orgCollection<Server>("servers");
const state = store.items;

export const servers = computed(() => [...state.value].sort((a, b) => a.name.localeCompare(b.name)));

export function getServer(id: string | null | undefined): Server | undefined {
  return id ? state.value.find((s) => s.id === id) : undefined;
}

export function findServerByName(name: string): Server | undefined {
  const n = name.trim().toLowerCase();
  return state.value.find((s) => s.name.toLowerCase() === n);
}

export function addServer(input: { name: string; guildId?: string }): Server {
  const s: Server = {
    id: store.newId(),
    name: input.name.trim() || "Untitled server",
    guildId: (input.guildId ?? "").trim(),
    createdAt: new Date().toISOString(),
  };
  store.set(s);
  return s;
}

export function updateServer(id: string, patch: { name?: string; guildId?: string }) {
  const s = getServer(id);
  if (!s) return;
  const out: Partial<Server> = {};
  if (patch.name !== undefined) out.name = patch.name.trim() || s.name;
  if (patch.guildId !== undefined) out.guildId = patch.guildId.trim();
  store.update(id, out);
}

/** Remove a server. Its webhooks and drafts are kept, just ungrouped. */
export function deleteServer(id: string) {
  store.remove(id);
  clearWebhookServer(id);
  clearDraftServer(id);
}

/** Guild id to use in Discord message links for things filed under this server. */
export function guildIdFor(serverId: string | null | undefined): string {
  return getServer(serverId)?.guildId || "@me";
}
