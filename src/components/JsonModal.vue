<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Modal from "./Modal.vue";
import { message, currentDraftId, replaceMessage } from "../stores/message";
import { getDraft } from "../stores/drafts";
import { buildPayload } from "../discord/webhook";
import { parseIncomingMessage } from "../discord/schema";
import { copyToClipboard, downloadText, readFileAsText, slugify } from "../util";
import { toast } from "../stores/toasts";

const emit = defineEmits<{ close: [] }>();

const payloadJson = computed(() => JSON.stringify(buildPayload(message.value), null, 2));
const text = ref(payloadJson.value);
const dirty = computed(() => text.value !== payloadJson.value);
watch(payloadJson, (v) => { if (!dirty.value) text.value = v; });

const parseError = computed(() => {
  try {
    JSON.parse(text.value);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
});

const filename = computed(() => {
  const d = getDraft(currentDraftId.value);
  return `${slugify(d?.name || message.value.embeds[0]?.title || "message")}.json`;
});

async function copy() {
  toast((await copyToClipboard(text.value)) ? "success" : "error", "JSON copied to clipboard");
}

function download() {
  downloadText(filename.value, text.value);
}

function apply() {
  if (parseError.value) return;
  replaceMessage(parseIncomingMessage(JSON.parse(text.value)), currentDraftId.value);
  toast("success", "Message replaced from JSON");
  emit("close");
}

const fileInput = ref<HTMLInputElement>();
async function importFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await readFileAsText(file));
    // Accept a bare payload, or a draft / drafts export (first draft wins).
    const msg = Array.isArray(raw?.drafts) ? raw.drafts[0]?.message : raw?.message ?? raw;
    text.value = JSON.stringify(buildPayload(parseIncomingMessage(msg)), null, 2);
    toast("info", "File loaded", "Review the JSON, then click Apply.");
  } catch (err) {
    toast("error", "Could not read file", (err as Error).message);
  } finally {
    if (fileInput.value) fileInput.value.value = "";
  }
}
</script>

<template>
  <Modal title="Webhook payload JSON" @close="emit('close')">
    <p class="muted small" style="margin: 0 0 8px">
      This is exactly what gets POSTed to the webhook. Edit it and press Apply to load it back into the editor, or paste a payload from anywhere.
    </p>
    <textarea v-model="text" class="input code" rows="22" spellcheck="false" />
    <div v-if="parseError" class="field-error" style="margin-top: 6px">{{ parseError }}</div>

    <template #footer>
      <button class="btn btn-ghost" @click="fileInput?.click()">
        Import file…
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importFile" />
      </button>
      <button class="btn btn-ghost" @click="download">Download {{ filename }}</button>
      <button class="btn" @click="copy">Copy</button>
      <button class="btn btn-primary" :disabled="!!parseError || !dirty" @click="apply">Apply to editor</button>
    </template>
  </Modal>
</template>
