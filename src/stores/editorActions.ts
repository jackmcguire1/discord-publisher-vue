import { ref } from "vue";
import { message, currentDraftId, replaceMessage, isDirty, markClean } from "./message";
import { getDraft, createDraft, updateDraftMessage, statusOf } from "./drafts";
import { selectedWebhookServerId } from "./webhooks";
import { emptyMessage } from "../discord/schema";
import { toast } from "./toasts";

// Editor-level actions shared by the toolbar, the "New message" buttons and
// the dialog that guards unsaved changes.

/** The draft being edited, unless it's a published or deleted message (those are history). */
export function editableDraftId(): string | null {
  const d = getDraft(currentDraftId.value);
  return d && statusOf(d) === "draft" ? d.id : null;
}

/** Save the editor into a new draft, asking for a name. Returns false if cancelled. */
export function saveAsNewDraft(): boolean {
  const suggested = message.value.embeds[0]?.title || message.value.content.split("\n")[0].slice(0, 60) || "Untitled";
  const name = prompt("Draft name", suggested);
  if (name === null) return false;
  const d = createDraft(name, message.value, selectedWebhookServerId());
  currentDraftId.value = d.id;
  markClean();
  toast("success", "Draft saved", d.name);
  return true;
}

/** Update the current draft, or save a new one. Returns false if cancelled. */
export function saveDraft(): boolean {
  const id = editableDraftId();
  if (!id) return saveAsNewDraft();
  updateDraftMessage(id, message.value);
  markClean();
  toast("success", "Draft updated", getDraft(id)?.name);
  return true;
}

/**
 * Start a blank message. The webhook identity (username and avatar) and the
 * selected webhook carry over, since the next message usually goes out as the
 * same brand.
 */
export function startNewMessage() {
  const { username, avatar_url } = message.value;
  replaceMessage({ ...emptyMessage(), username, avatar_url }, null);
  toast("info", "New message", "Started a blank message.");
}

/** Set while the "unsaved changes" dialog is open; `after` runs once a new message has started. */
export const newMessageDialog = ref<{ after?: () => void } | null>(null);

/** Start a new message, first asking what to do with unsaved changes if there are any. */
export function requestNewMessage(after?: () => void) {
  if (!isDirty.value) {
    startNewMessage();
    after?.();
    return;
  }
  newMessageDialog.value = { after };
}
