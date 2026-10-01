<script setup lang="ts">
defineProps<{
  label: string;
  error?: string;
  count?: number;
  max?: number;
  hint?: string;
}>();
</script>

<template>
  <div class="field" :class="{ 'has-error': !!error }">
    <div class="field-label">
      <span>{{ label }}</span>
      <span v-if="max !== undefined" class="count" :class="{ over: (count ?? 0) > max }">
        {{ count ?? 0 }}/{{ max }}
      </span>
      <span v-else-if="hint" class="count">{{ hint }}</span>
    </div>
    <slot />
    <div v-if="error" class="field-error">{{ error }}</div>
  </div>
</template>
