<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { savedAuthors, openAuthors, type Author, type AuthorInput } from "../stores/authors";

// "Apply a saved author" control used above the webhook identity fields and in
// each embed's author section. A custom dropdown rather than <select> so the
// list can show avatars. The current selection is derived from the field
// values, so it stays put after applying and clears if the fields are edited.
const props = defineProps<{
  /** Values currently in the fields. Only keys present are compared (identity has no url). */
  current: Partial<AuthorInput>;
}>();
const emit = defineEmits<{ apply: [author: Author] }>();

const open = ref(false);
const root = ref<HTMLElement>();

const selected = computed(() =>
  savedAuthors.value.find(
    (a) =>
      a.name === (props.current.name ?? "") &&
      a.avatarUrl === (props.current.avatarUrl ?? "") &&
      (!("url" in props.current) || a.url === (props.current.url ?? ""))
  )
);

const canSave = computed(() => !!props.current.name?.trim() && !selected.value);

function pick(a: Author) {
  emit("apply", a);
  open.value = false;
}

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && open.value) {
    e.stopPropagation();
    open.value = false;
  }
}
onMounted(() => {
  document.addEventListener("mousedown", onDocClick);
  document.addEventListener("keydown", onKey, true);
});
onUnmounted(() => {
  document.removeEventListener("mousedown", onDocClick);
  document.removeEventListener("keydown", onKey, true);
});
</script>

<template>
  <div ref="root" class="author-picker">
    <button
      type="button"
      class="input author-toggle"
      :class="{ 'has-selection': !!selected }"
      :disabled="!savedAuthors.length"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open"
    >
      <img v-if="selected?.avatarUrl" :src="selected.avatarUrl" alt="" class="author-mini" />
      <span v-else-if="selected" class="author-mini author-mini-empty">{{ selected.name.slice(0, 1).toUpperCase() }}</span>
      <span class="author-toggle-label">{{ selected ? selected.name : savedAuthors.length ? "Apply saved author…" : "No saved authors" }}</span>
      <span class="author-caret">▾</span>
    </button>

    <div v-if="open" class="author-menu" role="listbox">
      <button
        v-for="a in savedAuthors"
        :key="a.id"
        type="button"
        class="author-option"
        :class="{ selected: a.id === selected?.id }"
        role="option"
        :aria-selected="a.id === selected?.id"
        @click="pick(a)"
      >
        <img v-if="a.avatarUrl" :src="a.avatarUrl" alt="" class="author-mini" />
        <span v-else class="author-mini author-mini-empty">{{ a.name.slice(0, 1).toUpperCase() }}</span>
        <span class="author-option-text">
          <span class="author-option-name">{{ a.name }}</span>
          <span v-if="a.url" class="author-option-url">{{ a.url }}</span>
        </span>
        <span v-if="a.id === selected?.id" class="author-check">✓</span>
      </button>
      <div class="author-menu-footer">
        <button type="button" class="btn btn-ghost btn-sm" @click="open = false; openAuthors()">Manage authors…</button>
      </div>
    </div>

    <button v-if="canSave" type="button" class="btn btn-ghost btn-sm" title="Save these values as a reusable author" @click="openAuthors(current)">Save as author…</button>
    <button v-else-if="!selected" type="button" class="btn btn-ghost btn-sm" @click="openAuthors()">Manage authors</button>
  </div>
</template>
