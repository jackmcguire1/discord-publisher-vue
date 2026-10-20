<script setup lang="ts">
import { computed } from "vue";
import { currentDraftId, undo, redo, canUndo, canRedo, isDirty } from "../stores/message";
import { drafts, getDraft, statusOf, canOverwriteVersion } from "../stores/drafts";
import { openAuthors, savedAuthors } from "../stores/authors";
import { saveDraft, saveNewVersion, saveAsNewDraft as saveAsNew, requestNewMessage, openHistory } from "../stores/editorActions";

// Header and toolbar of the Message panel: what is being edited, actions on
// the message as a whole (history, list, new), then editing tools and saving.

const emit = defineEmits<{ open: [view: "json" | "curl" | "drafts"] }>();

const draft = computed(() => getDraft(currentDraftId.value));
/** Published and deleted messages are history; saving starts a new draft rather than changing them. */
const editableDraft = computed(() => (draft.value && statusOf(draft.value) === "draft" ? draft.value : undefined));
const status = computed(() => (draft.value ? statusOf(draft.value) : null));
const nextVersion = computed(() => (draft.value?.revision ?? 0) + 1);
/** What "Update draft" will do with the current version. */
const updateHint = computed(() =>
  canOverwriteVersion(editableDraft.value)
    ? `Save over v${editableDraft.value!.revision} (use New version to keep it)`
    : `Save as v${nextVersion.value}`
);
</script>

<template>
  <header class="panel-header">
    <div class="panel-heading">
      <h2 class="panel-title">Message</h2>
      <span class="editing-name" :title="draft?.name">{{ draft ? draft.name : "Not saved yet" }}<template v-if="draft && isDirty"> · unsaved changes</template></span>
      <span v-if="draft?.revision" class="tag revision-tag">v{{ draft.revision }}</span>
      <span v-if="status === 'published'" class="tag tag-green">published</span>
      <span v-else-if="status === 'deleted'" class="tag tag-red">deleted</span>
    </div>
    <div class="row row-nowrap panel-actions">
      <button
        class="btn btn-ghost btn-sm editor-history"
        :disabled="!draft?.revision"
        :title="draft?.revision ? 'Revision history of this message' : 'Save the message to start its history'"
        @click="draft && openHistory(draft.id)"
      >
        History
      </button>
      <button class="btn btn-ghost btn-sm" title="Drafts and published messages" @click="emit('open', 'drafts')">
        Messages <span class="tag">{{ drafts.length }}</span>
      </button>
      <button class="btn btn-primary btn-sm new-message" title="Start a blank message" @click="requestNewMessage()">+ New message</button>
    </div>
  </header>

  <div class="toolbar" role="toolbar" aria-label="Message tools">
    <div class="btn-group">
      <button class="btn btn-ghost btn-sm" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="undo">Undo</button>
      <button class="btn btn-ghost btn-sm" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" @click="redo">Redo</button>
    </div>
    <div class="btn-group">
      <button class="btn btn-ghost btn-sm" title="View, copy or paste the payload" @click="emit('open', 'json')">JSON</button>
      <button class="btn btn-ghost btn-sm" title="Copy a cURL command" @click="emit('open', 'curl')">cURL</button>
    </div>
    <button class="btn btn-ghost btn-sm" title="Saved authors" @click="openAuthors()">
      Authors <span class="tag">{{ savedAuthors.length }}</span>
    </button>
    <div class="toolbar-spacer" />
    <button v-if="editableDraft" class="btn btn-ghost btn-sm" title="Save as a separate message" @click="saveAsNew()">Save as new</button>
    <button
      v-if="editableDraft"
      class="btn btn-ghost btn-sm new-version"
      :title="`Keep the current version and save these changes as v${nextVersion}`"
      @click="saveNewVersion"
    >
      New version
    </button>
    <button class="btn btn-sm save-draft" :class="{ 'btn-primary': isDirty }" :title="editableDraft ? updateHint : ''" @click="saveDraft()">
      {{ editableDraft ? "Update draft" : draft ? "Save as draft" : "Save draft" }}
    </button>
  </div>
</template>
