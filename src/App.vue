<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { message, currentDraftId, undo, redo } from "./stores/message";
import { getDraft } from "./stores/drafts";
import Toolbar from "./components/Toolbar.vue";
import PublishPanel from "./components/PublishPanel.vue";
import MessageEditor from "./components/MessageEditor.vue";
import MessagePreview from "./components/MessagePreview.vue";
import JsonModal from "./components/JsonModal.vue";
import CurlModal from "./components/CurlModal.vue";
import DraftsModal from "./components/DraftsModal.vue";
import WebhooksModal from "./components/WebhooksModal.vue";
import Toasts from "./components/Toasts.vue";

type View = "json" | "curl" | "drafts" | "webhooks" | null;
const view = ref<View>(null);
const draft = computed(() => getDraft(currentDraftId.value));

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
  if (typing || view.value) return; // let native undo handle text fields and modals
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="app">
    <div class="pane pane-editor">
      <div class="stack">
        <div class="row row-between">
          <h1>Discord Publisher</h1>
          <span v-if="draft" class="muted small">Draft: <strong>{{ draft.name }}</strong></span>
          <span v-else class="muted small">Unsaved message</span>
        </div>
        <PublishPanel @manage="view = 'webhooks'" />
        <Toolbar @open="view = $event" />
        <hr class="divider" />
        <MessageEditor />
      </div>
    </div>

    <div class="pane pane-preview">
      <h2>Preview</h2>
      <MessagePreview :message="message" />
    </div>

    <JsonModal v-if="view === 'json'" @close="view = null" />
    <CurlModal v-if="view === 'curl'" @close="view = null" />
    <DraftsModal v-if="view === 'drafts'" @close="view = null" />
    <WebhooksModal v-if="view === 'webhooks'" @close="view = null" />
    <Toasts />
  </div>
</template>
