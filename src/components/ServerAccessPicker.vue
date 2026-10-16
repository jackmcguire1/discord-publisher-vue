<script setup lang="ts">
import { computed } from "vue";
import { allServers } from "../stores/servers";

// Choose which servers a member may use: all of them, or a selection.
// v-model is a list of server ids, or null for all servers.

const model = defineModel<string[] | null>({ required: true });

const limited = computed(() => model.value !== null);

function setLimited(on: boolean) {
  model.value = on ? [] : null;
}

function toggle(id: string, on: boolean) {
  const list = model.value ?? [];
  model.value = on ? [...new Set([...list, id])] : list.filter((x) => x !== id);
}
</script>

<template>
  <div class="server-access">
    <label class="checkbox small">
      <input type="checkbox" class="access-all" :checked="!limited" @change="setLimited(!($event.target as HTMLInputElement).checked)" />
      All servers
    </label>
    <template v-if="limited">
      <span v-if="!allServers.length" class="muted small">No servers yet. Add one under Webhooks and servers.</span>
      <label v-for="s in allServers" :key="s.id" class="checkbox small access-server">
        <input type="checkbox" :value="s.id" :checked="model?.includes(s.id)" @change="toggle(s.id, ($event.target as HTMLInputElement).checked)" />
        {{ s.name }}
      </label>
    </template>
  </div>
</template>
