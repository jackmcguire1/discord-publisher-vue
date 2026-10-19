import { drafts, type Draft } from "./drafts";
import { parseWebhookUrl } from "../discord/webhook";
import type { SavedWebhook } from "./webhooks";

// Which messages went out through a saved webhook. Each published (or since
// deleted) message records the saved webhook's id and Discord's webhook id;
// matching on either also catches messages sent by pasting the same URL.

/** When a message last went out or changed on Discord through its webhook. */
function sentAt(d: Draft): string {
  const info = d.published ?? d.deleted!;
  return (d.deleted?.deletedAt ?? info.updatedAt ?? info.publishedAt) || "";
}

/** Messages published through `w` (live or since deleted), newest activity first. */
export function messagesForWebhook(w: SavedWebhook): Draft[] {
  const discordId = parseWebhookUrl(w.url)?.id;
  return drafts.value
    .filter((d) => {
      const info = d.published ?? d.deleted;
      return !!info && (info.savedWebhookId === w.id || (!!discordId && info.webhookId === discordId));
    })
    .sort((a, b) => sentAt(b).localeCompare(sentAt(a)));
}
