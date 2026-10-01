import { ref, computed } from "vue";
import { load, persistRef } from "./persist";
import { parseWebhookUrl } from "../discord/webhook";

interface Settings {
  webhookUrl: string;
  threadId: string;
  /** Id of the saved webhook the URL came from, or null for a hand-typed URL. */
  webhookId: string | null;
}

const stored = load<Partial<Settings>>("settings", {});
const state = ref<Settings>({
  webhookUrl: stored.webhookUrl ?? "",
  threadId: stored.threadId ?? "",
  webhookId: stored.webhookId ?? null,
});
persistRef("settings", state);

export const settings = state;
export const webhookInfo = computed(() => parseWebhookUrl(state.value.webhookUrl));
