import { ref, watch } from "vue";
import { load, persistRef } from "./persist";
import { settings } from "./settings";
import { parseWebhookUrl } from "../discord/webhook";

// Saved webhooks: a nickname and description for each webhook URL so you can
// pick a destination by name instead of pasting URLs around. Stored in this
// browser only; URLs contain the secret token and are never put in draft exports.

export interface SavedWebhook {
  id: string;
  name: string;
  description: string;
  url: string;
  /** Server this webhook belongs to, or null if ungrouped. */
  serverId: string | null;
  createdAt: string;
}

export const savedWebhooks = ref<SavedWebhook[]>(load<SavedWebhook[]>("webhooks", []));
persistRef("webhooks", savedWebhooks);

function newId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getWebhook(id: string | null | undefined): SavedWebhook | undefined {
  return id ? savedWebhooks.value.find((w) => w.id === id) : undefined;
}

/** Find the saved webhook whose URL has this Discord webhook id (used to name published messages). */
export function webhookByDiscordId(discordId: string | undefined): SavedWebhook | undefined {
  if (!discordId) return undefined;
  return savedWebhooks.value.find((w) => parseWebhookUrl(w.url)?.id === discordId);
}

export function addWebhook(input: { name: string; description?: string; url: string; serverId?: string | null }): SavedWebhook {
  const info = parseWebhookUrl(input.url);
  if (!info) throw new Error("Not a Discord webhook URL");
  const w: SavedWebhook = {
    id: newId(),
    name: input.name.trim() || `Webhook ${info.id.slice(-4)}`,
    description: (input.description ?? "").trim(),
    url: info.url,
    serverId: input.serverId ?? null,
    createdAt: new Date().toISOString(),
  };
  savedWebhooks.value.push(w);
  return w;
}

export function updateWebhook(id: string, patch: { name?: string; description?: string; url?: string; serverId?: string | null }) {
  const w = getWebhook(id);
  if (!w) return;
  if (patch.url !== undefined) {
    const info = parseWebhookUrl(patch.url);
    if (!info) throw new Error("Not a Discord webhook URL");
    w.url = info.url;
  }
  if (patch.name !== undefined) w.name = patch.name.trim() || w.name;
  if (patch.description !== undefined) w.description = patch.description.trim();
  if (patch.serverId !== undefined) w.serverId = patch.serverId;
}

/** Ungroup every webhook that pointed at a deleted server. */
export function clearWebhookServer(serverId: string) {
  for (const w of savedWebhooks.value) if (w.serverId === serverId) w.serverId = null;
}

/** The server of the webhook currently selected in the publish panel, if any. */
export function selectedWebhookServerId(): string | null {
  return getWebhook(settings.value.webhookId)?.serverId ?? null;
}

export function deleteWebhook(id: string) {
  savedWebhooks.value = savedWebhooks.value.filter((w) => w.id !== id);
  if (settings.value.webhookId === id) settings.value.webhookId = null;
}

/** Point the publish panel at a saved webhook. */
export function selectWebhook(id: string | null) {
  const w = getWebhook(id);
  settings.value.webhookId = w ? w.id : null;
  if (w) settings.value.webhookUrl = w.url;
}

// Keep the active URL in step if the selected saved webhook is edited.
watch(
  [savedWebhooks, () => settings.value.webhookId],
  () => {
    const w = getWebhook(settings.value.webhookId);
    if (w && settings.value.webhookUrl !== w.url) settings.value.webhookUrl = w.url;
  },
  { deep: true, immediate: true }
);
