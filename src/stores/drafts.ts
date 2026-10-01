import { ref, computed } from "vue";
import { load, persistRef } from "./persist";
import type { Message } from "../discord/schema";
import { parseIncomingMessage } from "../discord/schema";
import type { PublishedRef } from "../discord/webhook";

// Drafts live in localStorage. Each one remembers where it was last published
// so it can be edited or deleted on Discord later. The webhook token is never
// stored on a draft; only the webhook id, so we can tell whether the currently
// configured webhook is the one that owns the published message.

export interface Draft {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  message: Message;
  /** Server this draft is filed under, or null if unassigned. */
  serverId: string | null;
  published?: PublishedRef & { publishedAt: string };
}

export interface DraftsFile {
  format: "discord-publisher-drafts";
  version: 1;
  exportedAt: string;
  drafts: Draft[];
  /** Servers referenced by the drafts, so names survive the move to another browser. */
  servers?: { id: string; name: string; guildId: string }[];
}

const state = ref<Draft[]>(load<Draft[]>("drafts", []));
persistRef("drafts", state);

export const drafts = computed(() =>
  [...state.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
);

function newId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function getDraft(id: string | null): Draft | undefined {
  return id ? state.value.find((d) => d.id === id) : undefined;
}

export function createDraft(name: string, message: Message, serverId: string | null = null): Draft {
  const now = new Date().toISOString();
  const draft: Draft = { id: newId(), name: name.trim() || "Untitled", createdAt: now, updatedAt: now, message: clone(message), serverId };
  state.value.push(draft);
  return draft;
}

export function updateDraftMessage(id: string, message: Message): Draft | undefined {
  const d = getDraft(id);
  if (!d) return;
  d.message = clone(message);
  d.updatedAt = new Date().toISOString();
  return d;
}

export function renameDraft(id: string, name: string) {
  const d = getDraft(id);
  if (!d) return;
  d.name = name.trim() || d.name;
  d.updatedAt = new Date().toISOString();
}

export function setDraftServer(id: string, serverId: string | null) {
  const d = getDraft(id);
  if (!d) return;
  d.serverId = serverId;
  d.updatedAt = new Date().toISOString();
}

/** Unassign every draft that was filed under a deleted server. */
export function clearDraftServer(serverId: string) {
  for (const d of state.value) if (d.serverId === serverId) d.serverId = null;
}

export function setDraftPublished(id: string, ref: PublishedRef | null) {
  const d = getDraft(id);
  if (!d) return;
  d.published = ref ? { ...ref, publishedAt: new Date().toISOString() } : undefined;
  d.updatedAt = new Date().toISOString();
}

export function duplicateDraft(id: string): Draft | undefined {
  const d = getDraft(id);
  if (!d) return;
  return createDraft(`${d.name} (copy)`, d.message, d.serverId);
}

export function deleteDraft(id: string) {
  state.value = state.value.filter((d) => d.id !== id);
}

export function exportDrafts(
  ids?: string[],
  resolveServer: (id: string) => { id: string; name: string; guildId: string } | undefined = () => undefined
): DraftsFile {
  const chosen = ids ? state.value.filter((d) => ids.includes(d.id)) : state.value;
  const serverIds = [...new Set(chosen.map((d) => d.serverId).filter((x): x is string => !!x))];
  const servers = serverIds.map(resolveServer).filter((s): s is NonNullable<typeof s> => !!s);
  return {
    format: "discord-publisher-drafts",
    version: 1,
    exportedAt: new Date().toISOString(),
    drafts: clone(chosen),
    servers: servers.length ? servers : undefined,
  };
}

/**
 * Accepts a drafts export file, a bare array of drafts, or a single raw
 * webhook payload. Returns how many drafts were added.
 */
export function importDrafts(
  raw: unknown,
  fallbackName = "Imported",
  /** Maps a server from the file to a local server id (matching by name, creating if needed). */
  mapServer: (server: { name: string; guildId?: string }) => string | null = () => null
): number {
  let incoming: unknown[] = [];
  const r = raw as any;
  const fileServers: Record<string, { name: string; guildId?: string }> = {};
  if (r && Array.isArray(r.servers)) {
    for (const s of r.servers) if (s && typeof s.id === "string" && typeof s.name === "string") fileServers[s.id] = s;
  }
  if (r && Array.isArray(r.drafts)) incoming = r.drafts;
  else if (Array.isArray(r)) incoming = r;
  else if (r && typeof r === "object") incoming = [r];

  let added = 0;
  for (const item of incoming as any[]) {
    const looksLikeDraft = item && typeof item === "object" && "message" in item;
    const message = parseIncomingMessage(looksLikeDraft ? item.message : item);
    const name = looksLikeDraft && typeof item.name === "string" ? item.name : fallbackName;
    const now = new Date().toISOString();
    const draft: Draft = {
      id: newId(),
      name,
      createdAt: looksLikeDraft && typeof item.createdAt === "string" ? item.createdAt : now,
      updatedAt: now,
      message,
      serverId:
        looksLikeDraft && typeof item.serverId === "string" && fileServers[item.serverId]
          ? mapServer(fileServers[item.serverId])
          : null,
      published:
        looksLikeDraft && item.published && typeof item.published.messageId === "string"
          ? item.published
          : undefined,
    };
    state.value.push(draft);
    added++;
  }
  return added;
}
