<script setup lang="ts">
import { ref, computed } from "vue";
import Modal from "./Modal.vue";
import Field from "./Field.vue";
import { savedAuthors, addAuthor, updateAuthor, deleteAuthor, authorsDialog, closeAuthors, type Author } from "../stores/authors";
import { isHttpUrl } from "../discord/schema";
import { toast } from "../stores/toasts";

const prefill = authorsDialog.value?.prefill ?? {};
const editingId = ref<string | null>(null);
const form = ref({ name: prefill.name ?? "", url: prefill.url ?? "", avatarUrl: prefill.avatarUrl ?? "" });

const urlError = computed(() => (form.value.url && !isHttpUrl(form.value.url) ? "Invalid URL" : ""));
const avatarError = computed(() => (form.value.avatarUrl && !isHttpUrl(form.value.avatarUrl) ? "Invalid URL" : ""));
const canSave = computed(() => !!form.value.name.trim() && !urlError.value && !avatarError.value);

function startEdit(a: Author) {
  editingId.value = a.id;
  form.value = { name: a.name, url: a.url, avatarUrl: a.avatarUrl };
}
function reset() {
  editingId.value = null;
  form.value = { name: "", url: "", avatarUrl: "" };
}
function save() {
  if (!canSave.value) return;
  if (editingId.value) {
    updateAuthor(editingId.value, form.value);
    toast("success", "Author updated", form.value.name);
  } else {
    const a = addAuthor(form.value);
    toast("success", "Author saved", a.name);
  }
  reset();
}
function remove(a: Author) {
  if (!confirm(`Delete author "${a.name}"? Messages that already use it are not changed.`)) return;
  deleteAuthor(a.id);
  if (editingId.value === a.id) reset();
}
</script>

<template>
  <Modal title="Authors" @close="closeAuthors">
    <div class="stack">
      <p class="muted small" style="margin: 0">
        An author is a name, link and avatar you reuse. Apply one as the webhook identity (username and avatar) or as an embed's author line (name, link and icon).
      </p>

      <div v-if="!savedAuthors.length" class="empty" style="padding: 8px 0">No saved authors yet.</div>
      <div v-else class="draft-list">
        <div v-for="a in savedAuthors" :key="a.id" class="draft author-item">
          <img v-if="a.avatarUrl" :src="a.avatarUrl" alt="" class="author-avatar" />
          <div v-else class="author-avatar author-avatar-empty">{{ a.name.slice(0, 1).toUpperCase() }}</div>
          <div class="grow">
            <div class="draft-name">{{ a.name }}</div>
            <div v-if="a.url" class="draft-meta"><a :href="a.url" target="_blank" rel="noreferrer">{{ a.url }}</a></div>
            <div v-if="a.avatarUrl" class="draft-meta mono" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ a.avatarUrl }}</div>
          </div>
          <div class="row row-nowrap">
            <button class="btn btn-sm btn-ghost" @click="startEdit(a)">Edit</button>
            <button class="btn btn-sm btn-danger" @click="remove(a)">✕</button>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <form class="stack" @submit.prevent="save">
        <h2 style="margin: 0">{{ editingId ? "Edit author" : "Add author" }}</h2>
        <div class="grid-3">
          <Field label="Name" :count="form.name.length" :max="80">
            <input v-model="form.name" class="input" placeholder="e.g. Stat-Milestones" maxlength="80" required />
          </Field>
          <Field label="URL" hint="optional" :error="urlError">
            <input v-model.trim="form.url" class="input" placeholder="https://" />
          </Field>
          <Field label="Avatar URL" hint="optional" :error="avatarError">
            <input v-model.trim="form.avatarUrl" class="input" placeholder="https://" />
          </Field>
        </div>
        <div class="row">
          <button type="submit" class="btn btn-primary" :disabled="!canSave">{{ editingId ? "Save changes" : "Add author" }}</button>
          <button v-if="editingId || form.name || form.url || form.avatarUrl" type="button" class="btn btn-ghost" @click="reset">Cancel</button>
        </div>
      </form>
    </div>
  </Modal>
</template>
