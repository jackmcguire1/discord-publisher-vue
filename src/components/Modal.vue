<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @mousedown.self="emit('close')">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="title">
        <div class="modal-header">
          <h3>{{ title }}</h3>
          <button class="btn btn-icon btn-ghost" aria-label="Close" @click="emit('close')">✕</button>
        </div>
        <div class="modal-body"><slot /></div>
        <div v-if="$slots.footer" class="modal-footer"><slot name="footer" /></div>
      </div>
    </div>
  </Teleport>
</template>
