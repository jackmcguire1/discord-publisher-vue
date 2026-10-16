<script setup lang="ts">
import { computed } from "vue";
import Modal from "./Modal.vue";
import { newMessageDialog, startNewMessage, saveDraft, editableDraftId } from "../stores/editorActions";
import { getDraft } from "../stores/drafts";

// Shown when "New message" is clicked with unsaved changes in the editor.

const draftName = computed(() => getDraft(editableDraftId())?.name);

function finish() {
  const after = newMessageDialog.value?.after;
  newMessageDialog.value = null;
  startNewMessage();
  after?.();
}

function saveAndStart() {
  if (saveDraft()) finish();
}

function close() {
  newMessageDialog.value = null;
}
</script>

<template>
  <Modal title="Start a new message?" @close="close">
    <p style="margin: 0">
      <template v-if="draftName">You have unsaved changes to <strong>{{ draftName }}</strong>.</template>
      <template v-else>The message in the editor hasn't been saved.</template>
      Save it as a draft first, or discard the changes?
    </p>
    <template #footer>
      <button class="btn btn-ghost" @click="close">Cancel</button>
      <button class="btn btn-danger new-discard" @click="finish">Discard &amp; start new</button>
      <button class="btn btn-primary new-save" @click="saveAndStart">{{ draftName ? "Update draft" : "Save draft" }} &amp; start new</button>
    </template>
  </Modal>
</template>
