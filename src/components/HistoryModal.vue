<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import Modal from "./Modal.vue";
import MessagePreview from "./MessagePreview.vue";
import { listRevisions, deleteRevision, type Revision, type RevisionKind } from "../stores/revisions";
import { getDraft, forgetRevision } from "../stores/drafts";
import { currentDraftId, isDirty, replaceMessage, markCleanAs } from "../stores/message";
import { historyFor, selectWebhookFor } from "../stores/editorActions";
import { navigate } from "../router";
import { toast } from "../stores/toasts";
import { formatDateTime } from "../util";

// Every revision of one message, newest first. Restoring loads an old revision
// into the editor as unsaved changes; saving (or updating on Discord) then
// records it as a new revision, so nothing in the history is ever lost.

const draftId = historyFor.value!;
const draft = computed(() => getDraft(draftId));
const revisions = ref<Revision[]>([]);
const loading = ref(true);
const failed = ref("");
const previewing = ref<string | null>(null);

const KIND_LABEL: Record<RevisionKind, string> = {
  saved: "Saved",
  published: "Published to Discord",
  updated: "Updated on Discord",
};

onMounted(async () => {
  try {
    revisions.value = await listRevisions(draftId);
  } catch (e) {
    failed.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

function summary(r: Revision): string {
  const first = r.message.embeds?.[0];
  const text = r.message.content?.split("\n")[0] || first?.title || first?.description || "";
  const embeds = r.message.embeds?.length ?? 0;
  return [text.slice(0, 80), embeds ? `${embeds} embed${embeds === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "Empty message";
}

function close() {
  historyFor.value = null;
}

async function remove(r: Revision) {
  if (!confirm(`Delete v${r.number}? The other versions and the message itself aren't affected.`)) return;
  try {
    await deleteRevision(draftId, r);
    forgetRevision(draftId, r.id);
    revisions.value = revisions.value.filter((x) => x.id !== r.id);
    if (previewing.value === r.id) previewing.value = null;
    toast("success", `Deleted v${r.number}`);
  } catch (e) {
    toast("error", "Could not delete version", (e as Error).message);
  }
}

function restore(r: Revision) {
  const d = draft.value;
  if (!d) return;
  if (isDirty.value && currentDraftId.value !== d.id && !confirm("Replace the current editor contents? Unsaved changes will be lost (undo still works).")) return;
  selectWebhookFor(d);
  replaceMessage(JSON.parse(JSON.stringify(r.message)), d.id);
  // Compare against the message's latest content, so the restore shows as unsaved changes.
  markCleanAs(d.message);
  const next = d.published ? "Update published to put it back on Discord." : "Save the draft to keep it as a new revision.";
  toast("info", `Restored v${r.number}`, next);
  close();
  navigate("/");
}
</script>

<template>
  <Modal :title="`History: ${draft?.name ?? 'message'}`" @close="close">
    <div class="stack history" style="--gap: 10px">
      <p class="muted small" style="margin: 0">
        Each save, publish and Discord update is kept as a revision. Restoring one opens it in the editor; nothing here is
        changed until you save or update.
      </p>
      <div v-if="loading" class="empty">Loading history…</div>
      <div v-else-if="failed" class="banner banner-error">Couldn't load the history: {{ failed }}</div>
      <div v-else-if="!revisions.length" class="empty">No revisions yet.</div>
      <div v-else class="draft-list">
        <div v-for="(r, i) in revisions" :key="r.id" class="draft revision-item" :data-revision="r.number">
          <div class="grow">
            <div class="row">
              <span class="draft-name">v{{ r.number }}</span>
              <span class="tag" :class="{ 'tag-green': r.kind !== 'saved' }">{{ KIND_LABEL[r.kind] }}</span>
              <span v-if="i === 0" class="tag">latest</span>
            </div>
            <div class="draft-meta">
              {{ formatDateTime(r.createdAt) }}<template v-if="r.createdBy"> by {{ r.createdBy }}</template>
              <template v-if="r.updatedAt"> · last saved {{ formatDateTime(r.updatedAt) }}<template v-if="r.updatedBy"> by {{ r.updatedBy }}</template></template>
              · {{ summary(r) }}<template v-if="r.note"> · {{ r.note }}</template>
            </div>
            <div v-if="previewing === r.id" class="revision-preview">
              <MessagePreview :message="r.message" />
            </div>
          </div>
          <div class="row row-nowrap" style="align-self: flex-start">
            <button class="btn btn-sm btn-ghost revision-preview-toggle" @click="previewing = previewing === r.id ? null : r.id">
              {{ previewing === r.id ? "Hide" : "Preview" }}
            </button>
            <button class="btn btn-sm btn-primary revision-restore" @click="restore(r)">Restore</button>
            <button
              v-if="r.kind === 'saved' && r.number !== 1"
              class="btn btn-sm btn-danger revision-delete"
              title="Delete this version"
              @click="remove(r)"
            >✕</button>
            <span
              v-else
              class="btn btn-sm btn-ghost revision-locked"
              :title="r.number === 1 ? 'The first version is kept as the message\'s starting point' : 'Versions that went out to Discord are kept as a record'"
              aria-disabled="true"
            >🔒</span>
          </div>
        </div>
      </div>
    </div>
  </Modal>
</template>
