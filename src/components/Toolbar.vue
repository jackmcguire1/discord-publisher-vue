<script setup lang="ts">
import { computed } from "vue";
import { currentDraftId, undo, redo, canUndo, canRedo } from "../stores/message";
import { drafts, getDraft, statusOf } from "../stores/drafts";
import { openAuthors, savedAuthors } from "../stores/authors";
import { saveDraft, saveAsNewDraft as saveAsNew } from "../stores/editorActions";

const emit = defineEmits<{ open: [view: "json" | "curl" | "drafts"] }>();

const draft = computed(() => getDraft(currentDraftId.value));
/** Published and deleted messages are history; saving starts a new draft rather than changing them. */
const editableDraft = computed(() => (draft.value && statusOf(draft.value) === "draft" ? draft.value : undefined));

</script>

<template>
  <div class="row row-between">
    <div class="row">
      <button class="btn btn-ghost btn-sm" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="undo">Undo</button>
      <button class="btn btn-ghost btn-sm" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" @click="redo">Redo</button>
      <button class="btn btn-ghost btn-sm" @click="emit('open', 'json')">JSON</button>
      <button class="btn btn-ghost btn-sm" @click="emit('open', 'curl')">cURL</button>
    </div>
    <div class="row">
      <button class="btn btn-ghost btn-sm" @click="openAuthors()">
        Authors <span class="tag">{{ savedAuthors.length }}</span>
      </button>
      <button class="btn btn-ghost btn-sm" title="Drafts and published messages" @click="emit('open', 'drafts')">
        Messages <span class="tag">{{ drafts.length }}</span>
      </button>
      <button class="btn btn-sm" @click="saveDraft">{{ editableDraft ? "Update draft" : draft ? "Save as draft" : "Save draft" }}</button>
      <button v-if="editableDraft" class="btn btn-ghost btn-sm" @click="saveAsNew">Save as new</button>
    </div>
  </div>
</template>
