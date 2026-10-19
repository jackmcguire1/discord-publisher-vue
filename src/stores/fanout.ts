import { createDraft, markPublished, markUpdated, markDeleted, setGroup, setDraftServer, newGroupId, getDraft, type Draft } from "./drafts";
import { getWebhook, webhookByDiscordId, type SavedWebhook } from "./webhooks";
import { sendMessage, editMessage, deleteMessage, type DiscordApiError } from "../discord/webhook";
import type { Message } from "../discord/schema";

// Publishing one message to several webhooks. Each destination becomes its own
// published message (so server access, permissions and history work per copy),
// linked by a shared groupId. Destinations are handled one by one so a failure
// only affects that webhook, and every outcome is reported back.

export interface Outcome {
  label: string;
  ok: boolean;
  /** Not attempted, e.g. the copy's webhook isn't available to this user. */
  skipped?: boolean;
  error?: string;
}

export function describeError(e: unknown): string {
  const err = e as DiscordApiError;
  if (!err || typeof err !== "object") return String(e);
  return `${err.message}${err.status ? ` (HTTP ${err.status})` : ""}`.slice(0, 200);
}

/** The saved webhook a published copy went through, if this user can see it. */
export function webhookForCopy(d: Draft): SavedWebhook | undefined {
  const info = d.published ?? d.deleted;
  if (!info) return undefined;
  return getWebhook(info.savedWebhookId) ?? webhookByDiscordId(info.webhookId);
}

/**
 * Publish `message` to each webhook. The first successful destination uses
 * `firstDraft()` (the message being edited); the others get new copies.
 * Returns the id of the editor's copy, if any destination succeeded.
 */
export async function publishToMany(
  webhooks: SavedWebhook[],
  message: Message,
  name: string,
  firstDraft: () => string
): Promise<{ outcomes: Outcome[]; editorDraftId: string | null }> {
  const groupId = newGroupId();
  const outcomes: Outcome[] = [];
  let editorDraftId: string | null = null;
  for (const w of webhooks) {
    try {
      const ref = await sendMessage(w.url, message);
      let id: string;
      if (!editorDraftId) {
        id = editorDraftId = firstDraft();
        // File the editor's copy under its own webhook's server.
        if (getDraft(id)?.serverId !== w.serverId) setDraftServer(id, w.serverId);
      } else {
        id = createDraft(name, message, w.serverId, { revision: false }).id;
      }
      markPublished(id, ref, message, w.id);
      setGroup(id, groupId);
      outcomes.push({ label: w.name, ok: true });
    } catch (e) {
      outcomes.push({ label: w.name, ok: false, error: describeError(e) });
    }
  }
  return { outcomes, editorDraftId };
}

/** Edit every live copy on Discord to `message`. */
export async function updateCopies(copies: Draft[], message: Message): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const c of copies) {
    if (!c.published) continue;
    const hook = webhookForCopy(c);
    const label = hook?.name ?? "Unknown webhook";
    if (!hook) {
      outcomes.push({ label, ok: false, skipped: true, error: "webhook not available to you" });
      continue;
    }
    try {
      const ref = await editMessage(hook.url, c.published, message);
      markUpdated(c.id, ref, message);
      outcomes.push({ label, ok: true });
    } catch (e) {
      outcomes.push({ label, ok: false, error: describeError(e) });
    }
  }
  return outcomes;
}

/** Delete every live copy from Discord (each stays in Messages as deleted). */
export async function deleteCopies(copies: Draft[]): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const c of copies) {
    if (!c.published) continue;
    const hook = webhookForCopy(c);
    const label = hook?.name ?? "Unknown webhook";
    if (!hook) {
      outcomes.push({ label, ok: false, skipped: true, error: "webhook not available to you" });
      continue;
    }
    try {
      await deleteMessage(hook.url, c.published);
      markDeleted(c.id);
      outcomes.push({ label, ok: true });
    } catch (e) {
      outcomes.push({ label, ok: false, error: describeError(e) });
    }
  }
  return outcomes;
}

/** One-line summary for a toast, e.g. "2 of 3 succeeded · Staff: HTTP 404". */
export function summarize(outcomes: Outcome[]): { ok: number; total: number; detail: string } {
  const ok = outcomes.filter((o) => o.ok).length;
  const failures = outcomes.filter((o) => !o.ok).map((o) => `${o.label}: ${o.error}`);
  return { ok, total: outcomes.length, detail: failures.join(" · ") };
}
