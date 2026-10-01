<script setup lang="ts">
import type { EmbedField } from "../discord/schema";
import { errorAt, moveField, duplicateField, removeField } from "../stores/message";
import Field from "./Field.vue";

const props = defineProps<{
  field: EmbedField;
  embedIndex: number;
  index: number;
  total: number;
}>();

const path = () => `embeds.${props.embedIndex}.fields.${props.index}`;
</script>

<template>
  <div class="card field-card">
    <div class="card-body" style="border-top: none">
      <div class="row row-between">
        <span class="muted small">Field {{ index + 1 }}</span>
        <div class="row">
          <label class="checkbox small">
            <input v-model="field.inline" type="checkbox" /> Inline
          </label>
          <button class="btn btn-icon btn-ghost" title="Move up" :disabled="index === 0" @click="moveField(embedIndex, index, -1)">↑</button>
          <button class="btn btn-icon btn-ghost" title="Move down" :disabled="index === total - 1" @click="moveField(embedIndex, index, 1)">↓</button>
          <button class="btn btn-icon btn-ghost" title="Duplicate" :disabled="total >= 25" @click="duplicateField(embedIndex, index)">⧉</button>
          <button class="btn btn-icon btn-danger" title="Delete field" @click="removeField(embedIndex, index)">✕</button>
        </div>
      </div>
      <div class="grid-2">
        <Field label="Name" :error="errorAt(`${path()}.name`)" :count="field.name.length" :max="256">
          <input v-model="field.name" class="input" />
        </Field>
        <Field label="Value" :error="errorAt(`${path()}.value`)" :count="field.value.length" :max="1024">
          <textarea v-model="field.value" class="input" rows="2" />
        </Field>
      </div>
    </div>
  </div>
</template>
