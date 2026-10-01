<script setup lang="ts">
import { ref, computed } from "vue";
import Modal from "./Modal.vue";
import { message, currentDraftId } from "../stores/message";
import { settings, webhookInfo } from "../stores/settings";
import { getDraft } from "../stores/drafts";
import { buildCurl } from "../discord/webhook";
import { copyToClipboard, downloadText, slugify } from "../util";
import { toast } from "../stores/toasts";

const emit = defineEmits<{ close: [] }>();

const published = computed(() => getDraft(currentDraftId.value)?.published);
const canEdit = computed(() => !!published.value && published.value.webhookId === webhookInfo.value?.id);
const mode = ref<"send" | "edit">("send");

const curl = computed(() =>
  buildCurl(settings.value.webhookUrl, message.value, {
    threadId: settings.value.threadId.trim() || undefined,
    edit: mode.value === "edit" && canEdit.value ? published.value : undefined,
  })
);

async function copy() {
  toast((await copyToClipboard(curl.value)) ? "success" : "error", "cURL command copied");
}
function download() {
  const d = getDraft(currentDraftId.value);
  downloadText(`${slugify(d?.name || "message")}.sh`, `#!/bin/sh\n${curl.value}\n`, "text/x-shellscript");
}
</script>

<template>
  <Modal title="cURL command" @close="emit('close')">
    <div class="row" style="margin-bottom: 8px">
      <label class="checkbox"><input v-model="mode" type="radio" value="send" /> Send new message</label>
      <label class="checkbox" :class="{ muted: !canEdit }"><input v-model="mode" type="radio" value="edit" :disabled="!canEdit" /> Edit published message</label>
    </div>
    <div v-if="!webhookInfo" class="banner banner-info small" style="margin-bottom: 8px">
      No webhook URL set, so a placeholder URL is used. The command includes your webhook token once set; keep it private.
    </div>
    <textarea :value="curl" class="input code" rows="20" readonly spellcheck="false" />
    <template #footer>
      <button class="btn btn-ghost" @click="download">Download .sh</button>
      <button class="btn btn-primary" @click="copy">Copy</button>
    </template>
  </Modal>
</template>
