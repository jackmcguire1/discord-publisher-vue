<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import { drafts, deleteDraft, duplicateDraft, renameDraft, exportDrafts, importDrafts, type Draft } from "../stores/drafts";
import { message, currentDraftId, replaceMessage } from "../stores/message";
import { messageLink } from "../discord/webhook";
import { downloadText, readFileAsText, slugify, formatDateTime } from "../util";
import { toast } from "../stores/toasts";

const emit = defineEmits<{ close: [] }>();

function load(d: Draft) {
  const unsaved = currentDraftId.value !== d.id && JSON.stringify(message.value) !== JSON.stringify(drafts.value.find((x) => x.id === currentDraftId.value)?.message);
  if (unsaved && !confirm("Replace the current editor contents with this draft? Unsaved changes will be lost (undo still works).")) return;
  replaceMessage(JSON.parse(JSON.stringify(d.message)), d.id);
  toast("info", "Draft loaded", d.name);
  emit("close");
}

function rename(d: Draft) {
  const name = prompt("Rename draft", d.name);
  if (name !== null) renameDraft(d.id, name);
}

function remove(d: Draft) {
  if (!confirm(`Delete draft "${d.name}"? This does not touch Discord.`)) return;
  deleteDraft(d.id);
  if (currentDraftId.value === d.id) currentDraftId.value = null;
}

function exportOne(d: Draft) {
  downloadText(`${slugify(d.name)}.draft.json`, JSON.stringify(exportDrafts([d.id]), null, 2));
}

function exportAll() {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`discord-publisher-drafts-${stamp}.json`, JSON.stringify(exportDrafts(), null, 2));
}

const fileInput = ref<HTMLInputElement>();
async function importFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  let total = 0;
  for (const file of files) {
    try {
      total += importDrafts(JSON.parse(await readFileAsText(file)), file.name.replace(/\.json$/i, ""));
    } catch (err) {
      toast("error", `Could not import ${file.name}`, (err as Error).message);
    }
  }
  if (total) toast("success", `Imported ${total} draft${total === 1 ? "" : "s"}`);
  if (fileInput.value) fileInput.value.value = "";
}
</script>

<template>
  <Modal title="Drafts" @close="emit('close')">
    <div v-if="!drafts.length" class="empty">
      No drafts yet. Use “Save draft” in the toolbar, or publish a message and it will be tracked here automatically.
    </div>
    <div v-else class="draft-list">
      <div v-for="d in drafts" :key="d.id" class="draft" :class="{ active: d.id === currentDraftId }">
        <div class="grow">
          <div class="row">
            <span class="draft-name">{{ d.name }}</span>
            <span v-if="d.id === currentDraftId" class="tag">editing</span>
            <span v-if="d.published" class="tag tag-green">published</span>
          </div>
          <div class="draft-meta">
            Updated {{ formatDateTime(d.updatedAt) }}
            · {{ d.message.embeds.length }} embed{{ d.message.embeds.length === 1 ? "" : "s" }}
            <template v-if="d.published">
              · published {{ formatDateTime(d.published.publishedAt) }} ·
              <a :href="messageLink(d.published)" target="_blank" rel="noreferrer">open</a>
            </template>
          </div>
        </div>
        <div class="row">
          <button class="btn btn-sm btn-primary" @click="load(d)">Load</button>
          <button class="btn btn-sm btn-ghost" title="Rename" @click="rename(d)">Rename</button>
          <button class="btn btn-sm btn-ghost" @click="duplicateDraft(d.id)">Duplicate</button>
          <button class="btn btn-sm btn-ghost" @click="exportOne(d)">Export</button>
          <button class="btn btn-sm btn-danger" title="Delete" @click="remove(d)">✕</button>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-ghost" @click="fileInput?.click()">
        Import…
        <input ref="fileInput" type="file" accept=".json,application/json" multiple hidden @change="importFiles" />
      </button>
      <button class="btn" :disabled="!drafts.length" @click="exportAll">Export all</button>
    </template>
  </Modal>
</template>
