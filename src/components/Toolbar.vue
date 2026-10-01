<script setup lang="ts">
import { computed } from "vue";
import { message, currentDraftId, undo, redo, canUndo, canRedo, replaceMessage } from "../stores/message";
import { drafts, getDraft, createDraft, updateDraftMessage } from "../stores/drafts";
import { emptyMessage } from "../discord/schema";
import { selectedWebhookServerId } from "../stores/webhooks";
import { toast } from "../stores/toasts";

const emit = defineEmits<{ open: [view: "json" | "curl" | "drafts"] }>();

const draft = computed(() => getDraft(currentDraftId.value));

function saveDraft() {
  if (draft.value) {
    updateDraftMessage(draft.value.id, message.value);
    toast("success", "Draft updated", draft.value.name);
    return;
  }
  saveAsNew();
}

function saveAsNew() {
  const suggested = message.value.embeds[0]?.title || message.value.content.split("\n")[0].slice(0, 60) || "Untitled";
  const name = prompt("Draft name", suggested);
  if (name === null) return;
  const d = createDraft(name, message.value, selectedWebhookServerId());
  currentDraftId.value = d.id;
  toast("success", "Draft saved", d.name);
}

function clear() {
  if (!confirm("Clear the editor? Saved drafts are not affected.")) return;
  replaceMessage(emptyMessage(), null);
}
</script>

<template>
  <div class="row row-between">
    <div class="row">
      <button class="btn btn-ghost btn-sm" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="undo">Undo</button>
      <button class="btn btn-ghost btn-sm" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" @click="redo">Redo</button>
      <button class="btn btn-ghost btn-sm" @click="clear">Clear message</button>
      <button class="btn btn-ghost btn-sm" @click="emit('open', 'json')">JSON</button>
      <button class="btn btn-ghost btn-sm" @click="emit('open', 'curl')">cURL</button>
    </div>
    <div class="row">
      <button class="btn btn-ghost btn-sm" @click="emit('open', 'drafts')">
        Drafts <span class="tag">{{ drafts.length }}</span>
      </button>
      <button class="btn btn-sm" @click="saveDraft">{{ draft ? "Update draft" : "Save draft" }}</button>
      <button v-if="draft" class="btn btn-ghost btn-sm" @click="saveAsNew">Save as new</button>
    </div>
  </div>
</template>
