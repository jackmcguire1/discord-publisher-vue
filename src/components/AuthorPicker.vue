<script setup lang="ts">
import { savedAuthors, getAuthor, openAuthors, type Author, type AuthorInput } from "../stores/authors";

// A compact "apply a saved author" control used above the webhook identity
// fields and inside each embed's author section.
const props = defineProps<{
  /** Values currently in the fields, offered as the prefill when saving a new author. */
  current: Partial<AuthorInput>;
}>();
const emit = defineEmits<{ apply: [author: Author] }>();

function onPick(e: Event) {
  const el = e.target as HTMLSelectElement;
  const a = getAuthor(el.value);
  if (a) emit("apply", a);
  el.value = "";
}

const canSave = () => !!props.current.name?.trim();
</script>

<template>
  <div class="row author-picker">
    <select class="input author-select" value="" :disabled="!savedAuthors.length" @change="onPick">
      <option value="" disabled>{{ savedAuthors.length ? "Apply saved author…" : "No saved authors" }}</option>
      <option v-for="a in savedAuthors" :key="a.id" :value="a.id">{{ a.name }}</option>
    </select>
    <button v-if="canSave()" type="button" class="btn btn-ghost btn-sm" title="Save these values as a reusable author" @click="openAuthors(current)">Save as author…</button>
    <button v-else type="button" class="btn btn-ghost btn-sm" @click="openAuthors()">Manage authors</button>
  </div>
</template>
