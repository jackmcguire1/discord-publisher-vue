<script setup lang="ts">
import { toasts, dismissToast } from "../stores/toasts";
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="`toast-${t.type}`">
      <div class="grow">
        <div class="toast-title">{{ t.title }}</div>
        <div v-if="t.message" class="toast-message">{{ t.message }}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss" @click="dismissToast(t.id)">✕</button>
    </div>
  </div>
</template>
