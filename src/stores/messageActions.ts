import { deleteDraft, statusOf, type Draft } from "./drafts";
import { currentDraftId } from "./message";
import { canDelete } from "./session";
import { webhookForCopy, describeError } from "./fanout";
import { deleteMessage } from "../discord/webhook";
import { ask } from "./dialog";
import { toast } from "./toasts";

// Removing a message from the org. A message still live on Discord gets an
// explicit choice: delete it on Discord first, or only drop the record here
// (it then stays on Discord with nothing left to edit or delete it from).

/** Ask how to remove `d`, then do it. Resolves true if it was removed. */
export async function removeMessage(d: Draft): Promise<boolean> {
  const status = statusOf(d);
  let choice: string | null;

  if (status === "published") {
    const hook = webhookForCopy(d);
    const canDeleteOnDiscord = !!hook && canDelete.value;
    const where = hook ? ` via ${hook.name}` : "";
    const note = hook
      ? "Removing it here only leaves it on Discord, with no way to edit or delete it from this app."
      : "Its webhook isn't available to you, so it can't be deleted from Discord here; removing it leaves it on Discord.";
    choice = await ask(
      "Remove a published message",
      `"${d.name}" is still live on Discord${where}.\n\n${note}`,
      [
        { id: "cancel", label: "Cancel", kind: "ghost" },
        { id: "record", label: "Remove here only", kind: canDeleteOnDiscord ? "ghost" : "danger" },
        ...(canDeleteOnDiscord ? [{ id: "both", label: "Delete from Discord and remove", kind: "danger" as const }] : []),
      ]
    );
    if (choice === "both" && hook && d.published) {
      try {
        await deleteMessage(hook.url, d.published);
      } catch (e) {
        toast("error", "Couldn't delete it from Discord", `${describeError(e)}. Nothing was removed.`, 10000);
        return false;
      }
    }
  } else if (status === "deleted") {
    choice = await ask("Remove from history", `Remove "${d.name}" and its publish history? It's already deleted from Discord.`, [
      { id: "cancel", label: "Cancel", kind: "ghost" },
      { id: "record", label: "Remove", kind: "danger" },
    ]);
  } else {
    choice = await ask("Delete draft", `Delete the draft "${d.name}" and its versions?`, [
      { id: "cancel", label: "Cancel", kind: "ghost" },
      { id: "record", label: "Delete draft", kind: "danger" },
    ]);
  }

  if (choice !== "record" && choice !== "both") return false;
  deleteDraft(d.id);
  if (currentDraftId.value === d.id) currentDraftId.value = null;
  toast("success", choice === "both" ? "Deleted from Discord and removed" : "Removed", d.name);
  return true;
}
