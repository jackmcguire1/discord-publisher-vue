import { ref, computed } from "vue";
import { load, persistRef } from "./persist";
import { parseWebhookUrl } from "../discord/webhook";

interface Settings {
  webhookUrl: string;
  threadId: string;
}

const state = ref<Settings>(load<Settings>("settings", { webhookUrl: "", threadId: "" }));
persistRef("settings", state);

export const settings = state;
export const webhookInfo = computed(() => parseWebhookUrl(state.value.webhookUrl));
