import { computed, watch } from "vue";
import { activeOrgId, authReady, user, membershipsReady } from "./session";
import { settings } from "./settings";
import { currentDraftId } from "./message";
import { load, save } from "./persist";

// The editor's webhook selection (and the draft it's attached to) belongs to
// one workspace: an org, or "guest". When the workspace changes (switching
// org, signing in or out) those are cleared, so a webhook URL from one org is
// never left filled in while working in another. A reload in the same
// workspace keeps them.

const KEY = "workspace";

/** The current workspace, or null while sign-in or memberships are still loading. */
const workspace = computed<string | null>(() => {
  if (!authReady.value) return null;
  if (!user.value) return "guest";
  if (!membershipsReady.value) return null;
  return activeOrgId.value ?? "none";
});

watch(
  workspace,
  (current) => {
    if (current === null) return;
    const previous = load<string | null>(KEY, null);
    save(KEY, current);
    // First run after this was added: adopt the current workspace without clearing.
    if (previous === null || previous === current) return;
    settings.value.webhookUrl = "";
    settings.value.webhookId = null;
    settings.value.threadId = "";
    currentDraftId.value = null;
  },
  { immediate: true }
);
